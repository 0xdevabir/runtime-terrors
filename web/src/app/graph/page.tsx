"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Collection, Core } from "cytoscape";
import { DIR_COLOR, VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { Chip, DirectionGlyph, Page, Quote, Row, Section, Segmented, Sheet, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { api, Central, Community, Consensus, download, EvidencePath, Finding, GEdge, GNode, PaperCard } from "@/lib/api";
import { TYPE_META, useEntities } from "@/lib/entities";

type Neighbor = { id: string; label: string; relation: string; edge: string; papers: number; majority: string; outgoing?: boolean };
type NodeDetail = GNode & { synonyms: string[]; neighbors: Neighbor[]; papers: PaperCard[]; consensus: Consensus[] };
type EdgeDetail = GEdge & { source_label: string; target_label: string; finding_cards: Finding[]; paper_cards: PaperCard[] };

const ALL_TYPES = ["condition", "fuel", "geometry", "outcome", "countermeasure", "species", "platform"];
const REL_LABEL: Record<string, string> = {
  affects: "affects", burned_in: "burned in", observed_in: "seen in", mitigates: "reduces",
  fails_to_mitigate: "doesn't reduce", implicated_in: "involved in", hosted: "hosted",
};

/** Plain-language verb for a link, so "A → B" reads as a sentence. */
function verb(relation: string, majority?: string | null) {
  if (relation === "affects") {
    return ({ increase: "raises", decrease: "lowers", mixed: "has mixed effects on", no_change: "doesn't change" } as Record<string, string>)[majority ?? ""] ?? "affects";
  }
  return REL_LABEL[relation] ?? relation.replace(/_/g, " ");
}

export default function GraphPage() {
  return <Suspense><Graph /></Suspense>;
}

/** Resolve a CSS custom property to an rgb()/rgba() string. Chrome serialises custom properties as
 *  8-digit hex (#78788033), which Cytoscape rejects, so let the browser compute a real colour instead. */
function cssVar(name: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name}, #888)`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return c || "#888";
}

function Graph() {
  const params = useSearchParams();
  const router = useRouter();
  const focus = params.get("focus") ?? "";
  const pathParam = params.get("path") ?? "";
  const lit = useMemo(() => new Set((pathParam || params.get("lit") || "").split(",").filter(Boolean)), [params, pathParam]);
  const [types, setTypes] = useState<Set<string>>(new Set(["condition", "fuel", "geometry", "outcome", "countermeasure"]));
  const [minPapers, setMinPapers] = useState(3);
  const [depth, setDepth] = useState<"1" | "2">("1");
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[]; communities: Community[] } | null>(null);
  const [yearFrom, setYearFrom] = useState(0);
  const [yearTo, setYearTo] = useState(0);
  const [colorBy, setColorBy] = useState<"type" | "theme">("type");
  const [panel, setPanel] = useState<"" | "path" | "central" | "filters">("");
  const [error, setError] = useState<unknown>(null);
  const [sel, setSel] = useState<{ kind: "node"; d: NodeDetail } | { kind: "edge"; d: EdgeDetail } | null>(null);
  const [query, setQuery] = useState("");
  const [themeTick, setThemeTick] = useState(0);
  const [hint, setHint] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const { entities, label } = useEntities();

  // make sure the focused entity's type is visible
  useEffect(() => {
    if (focus) setTypes((t) => (t.has(focus.split(":")[0]) ? t : new Set([...t, focus.split(":")[0]])));
  }, [focus]);

  useEffect(() => {
    const qs = new URLSearchParams({ types: [...types].join(","), min_papers: String(focus || pathParam ? 1 : minPapers), depth, limit: "220" });
    if (focus) qs.set("focus", focus);
    if (pathParam) qs.set("nodes", pathParam);
    if (yearFrom) qs.set("year_from", String(yearFrom));
    if (yearTo) qs.set("year_to", String(yearTo));
    setError(null);
    api<{ nodes: GNode[]; edges: GEdge[]; communities: Community[] }>(`/graph?${qs}`).then(setData).catch(setError);
  }, [types, minPapers, focus, depth, pathParam, yearFrom, yearTo]);

  // re-colour when the theme flips
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const bump = () => setThemeTick((x) => x + 1);
    mq.addEventListener("change", bump);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", bump); mo.disconnect(); };
  }, []);

  useEffect(() => {
    if (!data || !box.current) return;
    let destroyed = false;
    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      const fcose = (await import("cytoscape-fcose")).default;
      try { cytoscape.use(fcose); } catch {}
      if (destroyed || !box.current) return;
      const col: Record<string, string> = Object.fromEntries(ALL_TYPES.map((t) => [t, cssVar(TYPE_META[t].color.slice(4, -1))]));
      const dir: Record<string, string> = Object.fromEntries(Object.entries(DIR_COLOR).map(([k, v]) => [k, cssVar(v.slice(4, -1))]));
      const ink = cssVar("--label"), ink2 = cssVar("--label-2"), surface = cssVar("--bg-2"), faint = cssVar("--label-3"), tint = cssVar("--tint");
      const font = getComputedStyle(document.body).fontFamily;
      const theme = (c?: number) => (c == null ? ink2 : cssVar(`--series-${(c % 8) + 1}`));
      const maxP = Math.max(...data.nodes.map((n) => n.papers), 1);
      const maxE = Math.max(...data.edges.map((e) => e.paper_count), 1);
      cyRef.current?.destroy();
      const cy = cytoscape({
        container: box.current,
        elements: [
          ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, papers: n.papers, size: 14 + 42 * Math.sqrt(n.papers / maxP), color: colorBy === "theme" ? theme(n.community) : col[n.type] ?? ink2 } })),
          ...data.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, w: 1 + 4 * Math.sqrt(e.paper_count / maxE), verb: verb(e.relation, e.majority), color: e.relation === "affects" && e.majority && dir[e.majority] ? dir[e.majority] : faint, rel: e.relation } })),
        ],
        style: [
          { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(color)", "border-width": 2, "border-color": surface, label: "data(label)", "font-size": 11, "font-weight": 500, "font-family": font, color: ink, "text-valign": "bottom", "text-margin-y": 5, "text-wrap": "ellipsis", "text-max-width": "120px", "text-outline-color": surface, "text-outline-width": 2.5, "min-zoomed-font-size": 8, "transition-property": "opacity", "transition-duration": 150 } as never },
          { selector: "edge", style: { width: "data(w)", "line-color": "data(color)", "curve-style": "bezier", opacity: 0.45, "target-arrow-shape": "none", "transition-property": "opacity", "transition-duration": 150 } as never },
          { selector: "edge[rel = 'affects']", style: { "target-arrow-shape": "triangle", "target-arrow-color": "data(color)", "arrow-scale": 0.8, opacity: 0.7 } },
          // show the plain-language verb on links that are in focus
          { selector: "edge.talk", style: { label: "data(verb)", "font-size": 10, "font-weight": 600, "font-family": font, color: ink, "text-background-color": surface, "text-background-opacity": 0.92, "text-background-padding": "3px", "text-background-shape": "roundrectangle", "text-rotation": "autorotate", opacity: 1 } as never },
          { selector: ".dim", style: { opacity: 0.08 } },
          { selector: "node.hl", style: { "border-color": ink, "border-width": 3 } },
          { selector: "node:selected", style: { "border-color": tint, "border-width": 4 } },
          { selector: "edge:selected", style: { opacity: 1, "line-color": tint, "target-arrow-color": tint } },
        ],
        layout: { name: "fcose", animate: true, animationDuration: 600, quality: "default", nodeRepulsion: 11000, idealEdgeLength: 110, nodeSeparation: 70, randomize: true, packComponents: true } as never,
        wheelSensitivity: 0.25,
        minZoom: 0.2,
        maxZoom: 3,
      });
      let pinned = false;
      const spotlight = (els: Collection) => {
        cy.elements().addClass("dim").removeClass("talk");
        els.removeClass("dim");
        els.edges().addClass("talk");
      };
      const reset = () => {
        cy.elements().removeClass("dim talk");
        if (lit.size) {
          cy.elements().addClass("dim");
          const on = cy.nodes().filter((n) => lit.has(n.id()));
          on.removeClass("dim").addClass("hl");
          on.edgesWith(on).removeClass("dim").addClass("talk");
        }
      };
      reset();
      if (focus) cy.$id(focus).addClass("hl");
      // hover previews a node's connections; tapping pins them and opens the details
      cy.on("mouseover", "node", (e) => { if (!pinned) spotlight(e.target.closedNeighborhood()); });
      cy.on("mouseout", "node", () => { if (!pinned) reset(); });
      cy.on("tap", "node", async (e) => {
        pinned = true;
        setHint(false);
        spotlight(e.target.closedNeighborhood());
        setSel({ kind: "node", d: await api<NodeDetail>(`/graph/node/${encodeURIComponent(e.target.id())}`) });
      });
      cy.on("tap", "edge", async (e) => {
        pinned = true;
        setHint(false);
        spotlight(e.target.union(e.target.connectedNodes()));
        setSel({ kind: "edge", d: await api<EdgeDetail>(`/graph/edge?id=${encodeURIComponent(e.target.id())}`) });
      });
      cy.on("tap", (e) => { if (e.target === cy) { pinned = false; reset(); setSel(null); } });
      cy.on("unpin", () => { pinned = false; reset(); });
      cyRef.current = cy;
    })();
    return () => { destroyed = true; };
  }, [data, lit, focus, themeTick, colorBy]);

  useEffect(() => () => cyRef.current?.destroy(), []);

  const matches = query.length >= 2
    ? entities.filter((e) => (e.label + " " + e.synonyms.join(" ")).toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];
  const setFocus = (id: string) => { setQuery(""); setSel(null); router.push(id ? `/graph?focus=${encodeURIComponent(id)}` : "/graph"); };
  const exportPng = async () => {
    const cy = cyRef.current;
    if (!cy) return;
    download("knowledge-graph.png", await cy.png({ output: "blob-promise", full: true, scale: 2, bg: cssVar("--bg-2") }));
  };
  const exportJson = () => data && download("knowledge-graph.json", JSON.stringify(data, null, 1), "application/json");
  const years = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i);
  const selCls = "h-10 w-full rounded-xl bg-bg-2 ring-[0.5px] ring-sep px-3 t-sub";
  const toggle = (t: string) => setTypes((s) => { const n = new Set(s); if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t); return n; });
  const filtersOn = (yearFrom ? 1 : 0) + (yearTo ? 1 : 0) + (minPapers !== 3 ? 1 : 0) + (colorBy !== "type" ? 1 : 0);
  const pill = "inline-flex items-center gap-2 h-9 pl-3.5 pr-1 rounded-full bg-accent/35 text-label t-foot font-semibold";

  return (
    <Page wide title="Knowledge Graph" subtitle="Each dot is a concept. Lines show what the research says links them.">
      {/* Row 1: search + the three actions people actually use */}
      <div className="flex flex-col md:flex-row gap-2 mb-3 no-print">
        <div className="relative md:w-[340px]">
          <form onSubmit={(e) => { e.preventDefault(); if (matches[0]) setFocus(matches[0].id); }}
            className="flex items-center gap-2 h-10 px-3 rounded-xl bg-bg-2 ring-[0.5px] ring-sep">
            <Icon name="search" size={17} className="text-label-2" stroke={2.2} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a concept, e.g. soot"
              className="flex-1 bg-transparent outline-none t-sub placeholder:text-label-3 min-w-0" />
          </form>
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1.5 w-full group shadow-[var(--shadow)] anim-pop">
              {matches.map((m) => (
                <button key={m.id} onClick={() => setFocus(m.id)} className="row pressable w-full text-left">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_META[m.type]?.color }} />
                  <span className="flex-1 t-sub">{m.label}</span>
                  <span className="t-cap text-label-2">{TYPE_META[m.type]?.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 md:ml-auto">
          <Chip onClick={() => setPanel("path")}><Icon name="link" size={14} />How are two linked?</Chip>
          <Chip onClick={() => setPanel("central")}><Icon name="target" size={14} />Key concepts</Chip>
          <Chip onClick={() => setPanel("filters")} active={filtersOn > 0}><Icon name="filter" size={14} />Filters{filtersOn ? ` · ${filtersOn}` : ""}</Chip>
        </div>
      </div>

      {/* Row 2: what's shown */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center mb-3 no-print -mx-4 px-4 md:mx-0 md:px-0">
        {pathParam ? (
          <span className={pill}>
            <Icon name="link" size={14} />{pathParam.split(",").map(label).join(" → ")}
            <button onClick={() => router.push("/graph")} className="grid place-items-center w-7 h-7 rounded-full hover:bg-fill" aria-label="Clear path"><Icon name="xmark" size={12} stroke={2.6} /></button>
          </span>
        ) : focus ? (
          <>
            <span className={pill}>
              Around {label(focus)}
              <button onClick={() => setFocus("")} className="grid place-items-center w-7 h-7 rounded-full hover:bg-fill" aria-label="Clear focus"><Icon name="xmark" size={12} stroke={2.6} /></button>
            </span>
            <Segmented size="sm" className="w-[190px] shrink-0" value={depth} onChange={setDepth} options={[{ value: "1", label: "Direct links" }, { value: "2", label: "+ next step" }]} />
            <span className="w-px h-5 bg-sep mx-1 shrink-0" />
          </>
        ) : null}
        {ALL_TYPES.map((t) => (
          <button key={t} onClick={() => toggle(t)} aria-pressed={types.has(t)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full t-foot font-medium transition-all btn-press ${types.has(t) ? "bg-bg-2 ring-[0.5px] ring-sep text-label" : "text-label-3 hover:text-label-2"}`}>
            <span className="w-2.5 h-2.5 rounded-full transition-opacity" style={{ background: TYPE_META[t].color, opacity: types.has(t) ? 1 : 0.35 }} />
            {TYPE_META[t].label}
          </button>
        ))}
      </div>

      <div className="relative bg-bg-2 rounded-[22px] ring-[0.5px] ring-sep overflow-hidden h-[calc(100dvh-280px)] min-h-[440px]">
        {/* inline style: Cytoscape injects an unlayered `position: relative` rule that beats Tailwind's `absolute` */}
        <div ref={box} style={{ position: "absolute", inset: 0 }} />
        {!data && !error && <div className="absolute inset-0 grid place-items-center t-sub text-label-2">Drawing the map…</div>}
        {error ? <div className="absolute inset-0 grid place-items-center t-sub text-label-2">Can&apos;t reach the API.</div> : null}

        {hint && data && !error && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 material rounded-full pl-3.5 pr-1.5 h-9 flex items-center gap-2 ring-[0.5px] ring-sep t-foot text-label-2 anim-fade whitespace-nowrap">
            <Icon name="info" size={15} />Hover or tap a dot to see its links
            <button onClick={() => setHint(false)} className="grid place-items-center w-6 h-6 rounded-full hover:bg-fill" aria-label="Dismiss"><Icon name="xmark" size={11} stroke={2.6} /></button>
          </div>
        )}

        {/* Legend: how to read it, in one glance */}
        <div className="absolute left-3 bottom-3 material rounded-2xl px-3.5 py-2.5 ring-[0.5px] ring-sep t-cap text-label-2 space-y-1.5 max-w-[calc(100%-80px)]">
          <div className="flex flex-wrap gap-x-3.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><span className="w-5 h-[3px] rounded" style={{ background: DIR_COLOR.increase }} />raises</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 h-[3px] rounded" style={{ background: DIR_COLOR.decrease }} />lowers</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 h-[3px] rounded bg-label-3" />other link</span>
            <span className="hidden sm:inline text-label-3">Bigger dot / thicker line = more reports</span>
          </div>
          {colorBy === "theme" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {(data?.communities ?? []).filter((c) => data?.nodes.some((n) => n.community === c.id)).map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: `var(--series-${(c.id % 8) + 1})` }} />{c.label}</span>
              ))}
            </div>
          )}
        </div>

        <div className="absolute right-3 top-3 flex flex-col rounded-xl overflow-hidden material ring-[0.5px] ring-sep no-print">
          {[["+", 1.25, "Zoom in"], ["−", 0.8, "Zoom out"]].map(([s, f, l]) => (
            <button key={s} aria-label={l as string} onClick={() => cyRef.current?.zoom({ level: cyRef.current.zoom() * (f as number), renderedPosition: { x: box.current!.clientWidth / 2, y: box.current!.clientHeight / 2 } })}
              className="w-10 h-10 t-title3 text-label-2 hover:text-label hover:bg-fill hairline-b">{s}</button>
          ))}
          <button onClick={() => cyRef.current?.fit(undefined, 30)} className="w-10 h-10 grid place-items-center text-label-2 hover:text-label hover:bg-fill" aria-label="Fit to screen"><Icon name="target" size={18} /></button>
        </div>
        {data && <div className="absolute right-3 bottom-3 t-cap text-label-3 tabular-nums">{data.nodes.length} concepts · {data.edges.length} links</div>}
      </div>

      <Sheet open={!!sel} onClose={() => { setSel(null); cyRef.current?.emit("unpin"); }}
        title={sel?.kind === "node" ? sel.d.label : sel?.kind === "edge" ? "How they're linked" : ""}>
        {sel?.kind === "node" && <NodePanel d={sel.d} onFocus={setFocus} />}
        {sel?.kind === "edge" && <EdgePanel d={sel.d} />}
      </Sheet>
      <Sheet open={panel === "path"} onClose={() => setPanel("")} title="How are two concepts linked?">
        <PathFinder initial={focus} onShow={(ids) => { setPanel(""); router.push(`/graph?path=${encodeURIComponent(ids.join(","))}`); }} />
      </Sheet>
      <Sheet open={panel === "central"} onClose={() => setPanel("")} title="Key concepts">
        <CentralPanel onFocus={(id) => { setPanel(""); setFocus(id); }} />
      </Sheet>
      <Sheet open={panel === "filters"} onClose={() => setPanel("")} title="Filters">
        <div className="space-y-6">
          {!focus && !pathParam && (
            <div>
              <div className="section-header flex justify-between"><span>Hide weak links</span><span className="text-label-2 font-normal tabular-nums">{minPapers}+ reports</span></div>
              <input type="range" min={1} max={20} value={minPapers} onChange={(e) => setMinPapers(+e.target.value)} className="w-full" />
            </div>
          )}
          <div>
            <div className="section-header">Years</div>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label="From year" className={selCls} value={yearFrom} onChange={(e) => setYearFrom(+e.target.value)}>
                <option value={0}>From any year</option>{years.map((y) => <option key={y} value={y}>From {y}</option>)}
              </select>
              <select aria-label="To year" className={selCls} value={yearTo} onChange={(e) => setYearTo(+e.target.value)}>
                <option value={0}>To any year</option>{years.map((y) => <option key={y} value={y}>To {y}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="section-header">Colour dots by</div>
            <Segmented value={colorBy} onChange={setColorBy} options={[{ value: "type", label: "Kind of concept" }, { value: "theme", label: "Research theme" }]} />
          </div>
          <div>
            <div className="section-header">Export</div>
            <div className="flex gap-2"><Chip onClick={exportPng}>Image (PNG)</Chip><Chip onClick={exportJson}>Data (JSON)</Chip></div>
          </div>
          {filtersOn > 0 && (
            <button onClick={() => { setMinPapers(3); setYearFrom(0); setYearTo(0); setColorBy("type"); }} className="t-sub text-tint font-medium">Reset filters</button>
          )}
        </div>
      </Sheet>
    </Page>
  );
}

function LinkRow({ n, self, onFocus }: { n: Neighbor; self: string; onFocus: (id: string) => void }) {
  const v = verb(n.relation, n.majority);
  const c = n.relation === "affects" && n.majority ? DIR_COLOR[n.majority] : undefined;
  const vb = <span className="font-semibold" style={{ color: c }}>{v}</span>;
  return (
    <Row onClick={() => onFocus(n.id)} title={
      <span className="t-sub">
        {n.outgoing ? <>{vb} <b>{n.label}</b></> : <><b>{n.label}</b> {vb}</>}
      </span>
    } subtitle={n.outgoing ? undefined : `→ ${self}`} detail={<span className="t-foot tabular-nums">{n.papers}</span>} />
  );
}

function NodePanel({ d, onFocus }: { d: NodeDetail; onFocus: (id: string) => void }) {
  const out = d.neighbors.filter((n) => n.outgoing !== false).slice(0, 10);
  const inc = d.neighbors.filter((n) => n.outgoing === false).slice(0, 10);
  const known = d.neighbors.some((n) => n.outgoing != null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 t-foot font-medium text-label-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_META[d.type]?.color }} />{TYPE_META[d.type]?.label ?? d.type}
        </span>
        {d.group && <Tag>{d.group}</Tag>}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[[d.papers, "reports"], [d.flight_papers, "from spaceflight"], [d.neighbors.length, "links"]].map(([v, l]) => (
          <div key={l} className="bg-bg-2 rounded-2xl ring-[0.5px] ring-sep p-3"><div className="t-title2 tabular-nums">{v}</div><div className="t-cap text-label-2">{l}</div></div>
        ))}
      </div>
      <button onClick={() => onFocus(d.id)} className="w-full h-11 rounded-xl bg-tint text-on-tint t-headline mb-8 btn-press">Show only its links</button>

      {known ? (
        <>
          {out.length > 0 && <Section header={<>{d.label} …</>} footer="Number = reports backing the link. Tap to jump there.">{out.map((n) => <LinkRow key={n.edge} n={n} self={d.label} onFocus={onFocus} />)}</Section>}
          {inc.length > 0 && <Section header={<>… {d.label}</>}>{inc.map((n) => <LinkRow key={n.edge} n={n} self={d.label} onFocus={onFocus} />)}</Section>}
        </>
      ) : (
        <Section header="Linked to">
          {d.neighbors.slice(0, 12).map((n) => (
            <Row key={n.edge} onClick={() => onFocus(n.id)} title={n.label} subtitle={`${REL_LABEL[n.relation] ?? n.relation} · ${n.papers} reports`}
              detail={n.majority ? <DirectionGlyph d={n.majority} /> : undefined} />
          ))}
        </Section>
      )}

      {d.consensus.length > 0 && (
        <Section header="Do studies agree?">
          {d.consensus.slice(0, 4).map((c) => (
            <Link key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} className="row pressable block">
              <div className="flex justify-between gap-2 mb-1.5"><span className="t-sub font-medium">{c.label}</span>
                <Tag tone={c.status === "contradictory" ? "red" : c.status === "consensus" ? "green" : "gray"}>{c.status === "contradictory" ? "disagree" : c.status === "consensus" ? "agree" : c.status}</Tag></div>
              <VoteBar votes={c.votes} height={6} legend={false} />
            </Link>
          ))}
        </Section>
      )}
      <Section header="Reports">
        {d.papers.slice(0, 8).map((p) => <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub line-clamp-2">{p.title}</span>} subtitle={`${p.year}`} />)}
      </Section>
    </div>
  );
}

function EdgePanel({ d }: { d: EdgeDetail }) {
  const v = verb(d.relation, d.majority);
  const c = d.relation === "affects" && d.majority ? DIR_COLOR[d.majority] : "var(--tint)";
  return (
    <div>
      {/* The link as one sentence */}
      <div className="bg-bg-2 rounded-[20px] ring-[0.5px] ring-sep p-5 mb-4 text-center">
        <div className="t-headline">{d.source_label}</div>
        <div className="my-2 inline-flex items-center gap-1.5 h-7 px-3 rounded-full t-foot font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
          {v}<Icon name="chevronDown" size={13} stroke={2.6} />
        </div>
        <div className="t-headline">{d.target_label}</div>
      </div>
      <div className="bg-bg-2 rounded-[20px] ring-[0.5px] ring-sep p-4 mb-8 space-y-3">
        <div className="flex justify-between items-center"><span className="t-sub font-medium">{d.paper_count} reports</span><StrengthBadge s={d.strength} /></div>
        {Object.keys(d.directions ?? {}).length > 0 && <VoteBar votes={d.directions} />}
        {d.agreement > 0 && <div className="t-foot text-label-2">{Math.round(d.agreement * 100)}% agree on the direction</div>}
      </div>
      {d.finding_cards.length > 0 && (
        <>
          <div className="section-header">What the reports say</div>
          <div className="space-y-2 mb-8">
            {d.finding_cards.slice(0, 10).map((f) => (
              <Link key={f.id} href={`/papers/${f.paper_id}`} className="block bg-bg-2 rounded-2xl ring-[0.5px] ring-sep p-3.5 pressable">
                <div className="flex flex-wrap items-center gap-2 mb-2"><DirectionGlyph d={f.direction} /><StudyTag type={f.study_type} />
                  <span className="t-cap text-label-2">{[f.labels.fuel, f.year].filter(Boolean).join(" · ")}</span></div>
                <Quote section={f.section}>{f.evidence_quote}</Quote>
                <div className="t-cap text-label-2 mt-2 line-clamp-1">{f.paper_title}</div>
              </Link>
            ))}
          </div>
        </>
      )}
      <Section header="Reports">
        {d.paper_cards.slice(0, 10).map((p) => <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub line-clamp-2">{p.title}</span>} subtitle={`${p.year}`} />)}
      </Section>
    </div>
  );
}

function EntityPicker({ value, onChange, placeholder }: { value: string; onChange: (id: string) => void; placeholder: string }) {
  const { entities } = useEntities();
  return (
    <select aria-label={placeholder} className="w-full h-11 rounded-xl bg-bg-2 ring-[0.5px] ring-sep px-3 t-sub" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {Object.entries(TYPE_META).map(([t, m]) => (
        <optgroup key={t} label={m.label}>
          {entities.filter((e) => e.type === t && e.papers > 0).sort((a, b) => a.label.localeCompare(b.label)).map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function PathFinder({ initial, onShow }: { initial: string; onShow: (ids: string[]) => void }) {
  const [a, setA] = useState(initial);
  const [b, setB] = useState("");
  const [res, setRes] = useState<EvidencePath[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => {
    if (!a || !b || a === b) return;
    setBusy(true);
    api<{ paths: EvidencePath[] }>(`/graph/path?source=${encodeURIComponent(a)}&target=${encodeURIComponent(b)}&k=3`)
      .then((r) => setRes(r.paths)).catch(() => setRes([])).finally(() => setBusy(false));
  };
  return (
    <div className="space-y-3">
      <EntityPicker value={a} onChange={setA} placeholder="From… (e.g. Elevated oxygen)" />
      <div className="flex justify-center text-label-3"><Icon name="chevronDown" size={18} stroke={2.4} /></div>
      <EntityPicker value={b} onChange={setB} placeholder="To… (e.g. Flame spread rate)" />
      <button onClick={run} disabled={!a || !b || a === b || busy} className="w-full h-11 rounded-xl bg-tint text-on-tint t-headline btn-press disabled:opacity-40">
        {busy ? "Searching…" : "Find the link"}
      </button>
      {res && res.length === 0 && <p className="t-sub text-label-2 text-center py-4">No connecting evidence found.</p>}
      {res?.map((p, i) => (
        <div key={i} className="bg-bg-2 rounded-[20px] ring-[0.5px] ring-sep p-4 anim-rise">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="t-foot font-semibold text-label-2">Route {i + 1}</span>
            <button onClick={() => onShow(p.nodes.map((n) => n.id))} className="t-foot text-tint font-medium">Show on map</button>
          </div>
          {/* vertical stepper: concept → verb → concept */}
          <div>
            <div className="flex items-center gap-3"><span className="w-[11px] h-[11px] rounded-full bg-tint shrink-0" /><span className="t-sub font-semibold">{p.steps[0]?.source_label}</span></div>
            {p.steps.map((s) => (
              <div key={s.edge}>
                <div className="flex items-stretch gap-3">
                  <span className="w-[11px] flex justify-center shrink-0"><span className="w-px bg-sep" /></span>
                  <div className="t-foot py-2 flex items-center gap-2">
                    <span className="font-semibold" style={{ color: s.relation === "affects" && s.majority ? DIR_COLOR[s.majority] : "var(--label-2)" }}>{verb(s.relation, s.majority)}</span>
                    <span className="text-label-3">{s.paper_count} reports</span>
                  </div>
                </div>
                <div className="flex items-center gap-3"><span className="w-[11px] h-[11px] rounded-full bg-tint shrink-0" /><span className="t-sub font-semibold">{s.target_label}</span></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CentralPanel({ onFocus }: { onFocus: (id: string) => void }) {
  const [d, setD] = useState<{ pagerank: Central[]; betweenness: Central[]; communities: Community[] } | null>(null);
  const { label } = useEntities();
  useEffect(() => { api<typeof d>("/graph/analytics?top=8").then(setD).catch(() => {}); }, []);
  if (!d) return <p className="t-sub text-label-2">Loading…</p>;
  const dot = (t: string) => <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: TYPE_META[t]?.color }} />;
  return (
    <div>
      <Section header="Most connected" footer="Many well-supported links lead here.">
        {d.pagerank.map((n) => <Row key={n.id} onClick={() => onFocus(n.id)} title={<span className="flex items-center gap-2">{dot(n.type)}{n.label}</span>} detail={<span className="t-foot">{n.papers}</span>} />)}
      </Section>
      <Section header="Bridges between fields" footer="These join research areas that rarely meet.">
        {d.betweenness.map((n) => <Row key={n.id} onClick={() => onFocus(n.id)} title={<span className="flex items-center gap-2">{dot(n.type)}{n.label}</span>} detail={<span className="t-foot">{n.papers}</span>} />)}
      </Section>
      <Section header="Research themes">
        {d.communities.map((c) => (
          <div key={c.id} className="row block">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `var(--series-${(c.id % 8) + 1})` }} />
              <span className="t-sub font-medium flex-1">{c.label}</span><span className="t-cap text-label-2">{c.size}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.top.slice(0, 5).map((id) => <Chip key={id} onClick={() => onFocus(id)}>{label(id)}</Chip>)}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

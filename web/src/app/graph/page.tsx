"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Core } from "cytoscape";
import { DIR_COLOR, VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { Chip, DirectionGlyph, Page, Quote, Row, Section, Segmented, Sheet, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { api, Central, Community, Consensus, download, EvidencePath, Finding, GEdge, GNode, PaperCard } from "@/lib/api";
import { TYPE_META, useEntities } from "@/lib/entities";

type NodeDetail = GNode & { synonyms: string[]; neighbors: { id: string; label: string; relation: string; edge: string; papers: number; majority: string }[]; papers: PaperCard[]; consensus: Consensus[] };
type EdgeDetail = GEdge & { source_label: string; target_label: string; finding_cards: Finding[]; paper_cards: PaperCard[] };

const ALL_TYPES = ["condition", "fuel", "geometry", "outcome", "countermeasure", "species", "platform"];
const REL_LABEL: Record<string, string> = {
  affects: "affects", burned_in: "burned in", observed_in: "observed in", mitigates: "mitigates",
  fails_to_mitigate: "fails to mitigate", implicated_in: "implicated in", hosted: "hosted",
};

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
  const [panel, setPanel] = useState<"" | "path" | "central">("");
  const [error, setError] = useState<unknown>(null);
  const [sel, setSel] = useState<{ kind: "node"; d: NodeDetail } | { kind: "edge"; d: EdgeDetail } | null>(null);
  const [query, setQuery] = useState("");
  const [themeTick, setThemeTick] = useState(0);
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
      const ink = cssVar("--label"), ink2 = cssVar("--label-2"), surface = cssVar("--bg-2"), faint = cssVar("--fill-2");
      const theme = (c?: number) => (c == null ? ink2 : cssVar(`--series-${(c % 8) + 1}`));
      const maxP = Math.max(...data.nodes.map((n) => n.papers), 1);
      const maxE = Math.max(...data.edges.map((e) => e.paper_count), 1);
      cyRef.current?.destroy();
      const cy = cytoscape({
        container: box.current,
        elements: [
          ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, papers: n.papers, size: 16 + 44 * Math.sqrt(n.papers / maxP), color: colorBy === "theme" ? theme(n.community) : col[n.type] ?? ink2 } })),
          ...data.edges.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, w: 1 + 5 * Math.sqrt(e.paper_count / maxE), color: e.relation === "affects" && e.majority ? dir[e.majority] ?? faint : faint, rel: e.relation } })),
        ],
        style: [
          { selector: "node", style: { width: "data(size)", height: "data(size)", "background-color": "data(color)", "border-width": 2, "border-color": surface, label: "data(label)", "font-size": 11, "font-family": "-apple-system, system-ui, sans-serif", color: ink, "text-valign": "bottom", "text-margin-y": 4, "text-wrap": "ellipsis", "text-max-width": "110px", "text-outline-color": surface, "text-outline-width": 2, "min-zoomed-font-size": 7 } },
          { selector: "edge", style: { width: "data(w)", "line-color": "data(color)", "curve-style": "bezier", opacity: 0.55, "target-arrow-shape": "none" } },
          { selector: "edge[rel = 'affects']", style: { "target-arrow-shape": "triangle", "target-arrow-color": "data(color)", "arrow-scale": 0.7, opacity: 0.8 } },
          { selector: ".dim", style: { opacity: 0.12 } },
          { selector: "node.hl", style: { "border-color": ink, "border-width": 3 } },
          { selector: "node:selected", style: { "border-color": cssVar("--tint"), "border-width": 4 } },
          { selector: "edge:selected", style: { opacity: 1, "line-color": cssVar("--tint"), "target-arrow-color": cssVar("--tint") } },
        ],
        layout: { name: "fcose", animate: true, animationDuration: 600, quality: "default", nodeRepulsion: 9000, idealEdgeLength: 90, nodeSeparation: 60, randomize: true, packComponents: true } as never,
        wheelSensitivity: 0.25,
        minZoom: 0.2,
        maxZoom: 3,
      });
      if (lit.size) {
        cy.elements().addClass("dim");
        const on = cy.nodes().filter((n) => lit.has(n.id()));
        on.removeClass("dim").addClass("hl");
        on.edgesWith(on).removeClass("dim");
      }
      if (focus) cy.$id(focus).addClass("hl");
      cy.on("tap", "node", async (e) => {
        const id = e.target.id();
        const nb = e.target.closedNeighborhood();
        cy.elements().addClass("dim");
        nb.removeClass("dim");
        setSel({ kind: "node", d: await api<NodeDetail>(`/graph/node/${encodeURIComponent(id)}`) });
      });
      cy.on("tap", "edge", async (e) => {
        cy.elements().addClass("dim");
        e.target.removeClass("dim").connectedNodes().removeClass("dim");
        setSel({ kind: "edge", d: await api<EdgeDetail>(`/graph/edge?id=${encodeURIComponent(e.target.id())}`) });
      });
      cy.on("tap", (e) => { if (e.target === cy) { cy.elements().removeClass("dim"); setSel(null); } });
      cyRef.current = cy;
    })();
    return () => { destroyed = true; };
  }, [data, lit, focus, themeTick, colorBy]);

  useEffect(() => () => cyRef.current?.destroy(), []);

  const matches = query.length >= 2
    ? entities.filter((e) => (e.label + " " + e.synonyms.join(" ")).toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];
  const setFocus = (id: string) => { setQuery(""); router.push(id ? `/graph?focus=${encodeURIComponent(id)}` : "/graph"); };
  const exportPng = async () => {
    const cy = cyRef.current;
    if (!cy) return;
    download("knowledge-graph.png", await cy.png({ output: "blob-promise", full: true, scale: 2, bg: cssVar("--bg-2") }));
  };
  const exportJson = () => data && download("knowledge-graph.json", JSON.stringify(data, null, 1), "application/json");
  const years = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i);
  const selCls = "h-8 rounded-lg bg-fill px-2 t-foot";
  const toggle = (t: string) => setTypes((s) => { const n = new Set(s); if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t); return n; });

  return (
    <Page wide title="Knowledge Graph" subtitle="Entities extracted from every report and the evidence linking them. Arrow colour shows the majority effect direction; tap any node or link for the underlying reports and quotes.">
      <div className="flex flex-col lg:flex-row gap-3 mb-3 no-print">
        <div className="relative lg:w-[320px]">
          <form onSubmit={(e) => { e.preventDefault(); if (matches[0]) setFocus(matches[0].id); }}
            className="flex items-center gap-1.5 h-9 px-2 rounded-[10px] bg-fill">
            <Icon name="search" size={17} className="text-label-2" stroke={2.2} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Focus on an entity (e.g. PMMA, soot)"
              className="flex-1 bg-transparent outline-none t-body placeholder:text-label-2 min-w-0" />
          </form>
          {matches.length > 0 && (
            <div className="absolute z-20 mt-1 w-full group shadow-[var(--shadow)] border border-sep">
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
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center">
          {ALL_TYPES.map((t) => <Chip key={t} active={types.has(t)} onClick={() => toggle(t)} color={types.has(t) ? undefined : TYPE_META[t].color}>{TYPE_META[t].label}</Chip>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3 no-print">
        {pathParam ? (
          <span className="inline-flex items-center gap-2 h-8 pl-3 pr-1 rounded-full bg-tint/12 text-tint t-foot font-semibold">
            Evidence path: {pathParam.split(",").map(label).join(" → ")}
            <button onClick={() => router.push("/graph")} className="grid place-items-center w-6 h-6 rounded-full hover:bg-tint/15" aria-label="Clear path"><Icon name="xmark" size={12} stroke={2.6} /></button>
          </span>
        ) : focus ? (
          <>
            <span className="inline-flex items-center gap-2 h-8 pl-3 pr-1 rounded-full bg-tint/12 text-tint t-foot font-semibold">
              Focused: {label(focus)}
              <button onClick={() => setFocus("")} className="grid place-items-center w-6 h-6 rounded-full hover:bg-tint/15" aria-label="Clear focus"><Icon name="xmark" size={12} stroke={2.6} /></button>
            </span>
            <Segmented size="sm" className="w-[180px]" value={depth} onChange={setDepth} options={[{ value: "1", label: "1 hop" }, { value: "2", label: "2 hops" }]} />
          </>
        ) : (
          <label className="flex items-center gap-2 t-foot text-label-2">
            Min. papers per link
            <input type="range" min={1} max={20} value={minPapers} onChange={(e) => setMinPapers(+e.target.value)} className="w-32" />
            <span className="tabular-nums text-label font-medium w-5">{minPapers}</span>
          </label>
        )}
        <select aria-label="From year" className={selCls} value={yearFrom} onChange={(e) => setYearFrom(+e.target.value)}>
          <option value={0}>From any year</option>{years.map((y) => <option key={y} value={y}>From {y}</option>)}
        </select>
        <select aria-label="To year" className={selCls} value={yearTo} onChange={(e) => setYearTo(+e.target.value)}>
          <option value={0}>To any year</option>{years.map((y) => <option key={y} value={y}>To {y}</option>)}
        </select>
        <Segmented size="sm" className="w-[170px]" value={colorBy} onChange={setColorBy} options={[{ value: "type", label: "By type" }, { value: "theme", label: "By theme" }]} />
        {data && <span className="t-foot text-label-2">{data.nodes.length} entities · {data.edges.length} links</span>}
        <div className="flex gap-1.5 lg:ml-auto">
          <Chip onClick={() => setPanel("path")}><span className="inline-flex items-center gap-1"><Icon name="split" size={13} />Find path</span></Chip>
          <Chip onClick={() => setPanel("central")}><span className="inline-flex items-center gap-1"><Icon name="target" size={13} />Key concepts</span></Chip>
          <Chip onClick={exportPng}>PNG</Chip>
          <Chip onClick={exportJson}>JSON</Chip>
        </div>
      </div>

      <div className="relative bg-bg-2 rounded-2xl overflow-hidden h-[calc(100dvh-300px)] min-h-[420px]">
        {/* inline style: Cytoscape injects an unlayered `position: relative` rule that beats Tailwind's `absolute` */}
        <div ref={box} style={{ position: "absolute", inset: 0 }} />
        {!data && !error && <div className="absolute inset-0 grid place-items-center t-sub text-label-2">Laying out graph…</div>}
        {error ? <div className="absolute inset-0 grid place-items-center t-sub text-label-2">Can&apos;t reach the API.</div> : null}
        <div className="absolute left-3 bottom-3 material rounded-xl px-3 py-2 space-y-1.5 border border-sep">
          <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[520px]">
            {colorBy === "theme" ? (data?.communities ?? []).filter((c) => data?.nodes.some((n) => n.community === c.id)).map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 t-cap text-label-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: `var(--series-${(c.id % 8) + 1})` }} />{c.label}</span>
            )) : [...types].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 t-cap text-label-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_META[t].color }} />{TYPE_META[t].label}</span>
            ))}
          </div>
          <div className="flex gap-3 t-cap text-label-2">
            <span className="inline-flex items-center gap-1.5"><span className="w-4 h-[2px] rounded" style={{ background: DIR_COLOR.decrease }} />Mostly decreases</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-4 h-[2px] rounded" style={{ background: DIR_COLOR.increase }} />Mostly increases</span>
          </div>
        </div>
        <div className="absolute right-3 top-3 flex flex-col gap-1 no-print">
          {[["+", 1.25], ["−", 0.8]].map(([s, f]) => (
            <button key={s} onClick={() => cyRef.current?.zoom({ level: cyRef.current.zoom() * (f as number), renderedPosition: { x: box.current!.clientWidth / 2, y: box.current!.clientHeight / 2 } })}
              className="material w-9 h-9 rounded-[10px] border border-sep t-title3 text-label-2 btn-press">{s}</button>
          ))}
          <button onClick={() => cyRef.current?.fit(undefined, 30)} className="material w-9 h-9 rounded-[10px] border border-sep grid place-items-center text-label-2 btn-press" aria-label="Fit"><Icon name="target" size={18} /></button>
        </div>
      </div>

      <Sheet open={!!sel} onClose={() => { setSel(null); cyRef.current?.elements().removeClass("dim"); }}
        title={sel?.kind === "node" ? sel.d.label : sel?.kind === "edge" ? `${sel.d.source_label} → ${sel.d.target_label}` : ""}>
        {sel?.kind === "node" && <NodePanel d={sel.d} onFocus={setFocus} />}
        {sel?.kind === "edge" && <EdgePanel d={sel.d} />}
      </Sheet>
      <Sheet open={panel === "path"} onClose={() => setPanel("")} title="Evidence path finder">
        <PathFinder initial={focus} onShow={(ids) => { setPanel(""); router.push(`/graph?path=${encodeURIComponent(ids.join(","))}`); }} />
      </Sheet>
      <Sheet open={panel === "central"} onClose={() => setPanel("")} title="Key concepts & research themes">
        <CentralPanel onFocus={(id) => { setPanel(""); setFocus(id); }} />
      </Sheet>
    </Page>
  );
}

function NodePanel({ d, onFocus }: { d: NodeDetail; onFocus: (id: string) => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tag tone="blue">{TYPE_META[d.type]?.label ?? d.type}</Tag>
        {d.group && <Tag>{d.group}</Tag>}
        {d.ontology && <Tag tone="teal">{d.ontology}</Tag>}
      </div>
      {d.pagerank != null && (
        <div className="t-foot text-label-2 mb-4">
          Centrality: PageRank {d.pagerank.toFixed(3)} · bridging score {(d.betweenness ?? 0).toFixed(3)}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-bg-2 rounded-2xl p-3"><div className="t-title2 tabular-nums">{d.papers}</div><div className="t-foot text-label-2">reports</div></div>
        <div className="bg-bg-2 rounded-2xl p-3"><div className="t-title2 tabular-nums">{d.flight_papers}</div><div className="t-foot text-label-2">from orbital flight</div></div>
      </div>
      <button onClick={() => onFocus(d.id)} className="w-full h-11 rounded-xl bg-tint text-on-tint t-headline mb-6 btn-press">Focus graph here</button>
      {d.consensus.length > 0 && (
        <Section header="Evidence groups">
          {d.consensus.slice(0, 5).map((c) => (
            <Link key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} className="row pressable block">
              <div className="flex justify-between gap-2 mb-1.5"><span className="t-sub font-medium">{c.label}</span>
                <Tag tone={c.status === "contradictory" ? "red" : c.status === "consensus" ? "green" : "gray"}>{c.status}</Tag></div>
              <VoteBar votes={c.votes} height={6} legend={false} />
            </Link>
          ))}
        </Section>
      )}
      <Section header="Connected to">
        {d.neighbors.slice(0, 12).map((n) => (
          <Row key={n.edge} onClick={() => onFocus(n.id)} title={n.label} subtitle={`${REL_LABEL[n.relation] ?? n.relation} · ${n.papers} papers`}
            detail={n.majority ? <DirectionGlyph d={n.majority} /> : undefined} />
        ))}
      </Section>
      <Section header={`Reports (${d.papers.length})`}>
        {d.papers.slice(0, 12).map((p) => <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub line-clamp-2">{p.title}</span>} subtitle={`${p.year} · ${p.journal ?? ""}`} />)}
      </Section>
    </div>
  );
}

function EdgePanel({ d }: { d: EdgeDetail }) {
  return (
    <div>
      <div className="t-sub text-label-2 mb-3">{d.source_label} <b className="text-label">{REL_LABEL[d.relation] ?? d.relation}</b> {d.target_label}</div>
      <div className="bg-bg-2 rounded-2xl p-4 mb-6 space-y-3">
        <div className="flex justify-between items-center"><span className="t-sub">{d.paper_count} papers</span><StrengthBadge s={d.strength} /></div>
        {Object.keys(d.directions ?? {}).length > 0 && <VoteBar votes={d.directions} />}
        {d.agreement > 0 && <div className="t-foot text-label-2">Agreement on direction: {Math.round(d.agreement * 100)}%</div>}
      </div>
      {d.finding_cards.length > 0 && (
        <>
          <div className="section-header">Findings with evidence</div>
          <div className="space-y-2 mb-6">
            {d.finding_cards.slice(0, 15).map((f) => (
              <Link key={f.id} href={`/papers/${f.paper_id}`} className="block bg-bg-2 rounded-2xl p-3.5 pressable">
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
        {d.paper_cards.slice(0, 15).map((p) => <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub line-clamp-2">{p.title}</span>} subtitle={`${p.year}`} />)}
      </Section>
    </div>
  );
}

function EntityPicker({ value, onChange, placeholder }: { value: string; onChange: (id: string) => void; placeholder: string }) {
  const { entities } = useEntities();
  return (
    <select aria-label={placeholder} className="w-full h-10 rounded-xl bg-bg-2 border border-sep px-3 t-sub" value={value} onChange={(e) => onChange(e.target.value)}>
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
      <p className="t-foot text-label-2">How are two concepts connected in the literature? Paths prefer links backed by many reports.</p>
      <EntityPicker value={a} onChange={setA} placeholder="From (e.g. Elevated oxygen)" />
      <EntityPicker value={b} onChange={setB} placeholder="To (e.g. Flame spread rate)" />
      <button onClick={run} disabled={!a || !b || a === b || busy} className="w-full h-11 rounded-xl bg-tint text-on-tint t-headline btn-press disabled:opacity-40">
        {busy ? "Searching…" : "Find evidence paths"}
      </button>
      {res && res.length === 0 && <p className="t-sub text-label-2">No connecting evidence found.</p>}
      {res?.map((p, i) => (
        <div key={i} className="bg-bg-2 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="t-foot font-semibold text-label-2">Path {i + 1} · weakest link {p.support} papers</span>
            <button onClick={() => onShow(p.nodes.map((n) => n.id))} className="t-foot text-tint">Show on graph</button>
          </div>
          {p.steps.map((s) => (
            <div key={s.edge} className="py-2 hairline-t first:border-0">
              <div className="t-sub">
                <b>{s.source_label}</b> <span className="text-label-2">{REL_LABEL[s.relation] ?? s.relation}</span> <b>{s.target_label}</b>
                {s.majority && <span className="ml-1.5 inline-block align-middle"><DirectionGlyph d={s.majority} /></span>}
              </div>
              <div className="t-cap text-label-2 mt-0.5">{s.paper_count} papers</div>
              {s.papers.slice(0, 2).map((pc) => (
                <Link key={pc.id} href={`/papers/${pc.id}`} className="block t-cap text-tint line-clamp-1 mt-0.5">{pc.title}</Link>
              ))}
            </div>
          ))}
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
  return (
    <div>
      <Section header="Most connected (PageRank)" footer="Concepts that many well-supported links point to.">
        {d.pagerank.map((n) => <Row key={n.id} onClick={() => onFocus(n.id)} title={n.label} subtitle={`${TYPE_META[n.type]?.label} · ${n.papers} papers`} detail={n.pagerank.toFixed(3)} />)}
      </Section>
      <Section header="Bridges between fields (betweenness)" footer="Concepts that connect otherwise separate research areas.">
        {d.betweenness.map((n) => <Row key={n.id} onClick={() => onFocus(n.id)} title={n.label} subtitle={`${TYPE_META[n.type]?.label} · ${n.papers} papers`} detail={n.betweenness.toFixed(3)} />)}
      </Section>
      <Section header={`Research themes (${d.communities.length})`} footer="Communities detected from the co-evidence graph (modularity clustering).">
        {d.communities.map((c) => (
          <div key={c.id} className="row block">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `var(--series-${(c.id % 8) + 1})` }} />
              <span className="t-sub font-medium flex-1">{c.label}</span><span className="t-cap text-label-2">{c.size} concepts</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {c.top.slice(0, 6).map((id) => <Chip key={id} onClick={() => onFocus(id)}>{label(id)}</Chip>)}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

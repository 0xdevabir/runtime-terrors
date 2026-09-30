"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Core } from "cytoscape";
import { DIR_COLOR, VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { Chip, DirectionGlyph, Page, Quote, Row, Section, Segmented, Sheet, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { api, Consensus, Finding, GEdge, GNode, PaperCard } from "@/lib/api";
import { TYPE_META, useEntities } from "@/lib/entities";

type NodeDetail = GNode & { synonyms: string[]; neighbors: { id: string; label: string; relation: string; edge: string; papers: number; majority: string }[]; papers: PaperCard[]; consensus: Consensus[] };
type EdgeDetail = GEdge & { source_label: string; target_label: string; finding_cards: Finding[]; paper_cards: PaperCard[] };

const ALL_TYPES = ["stressor", "organism", "tissue", "outcome", "countermeasure", "gene", "platform"];
const REL_LABEL: Record<string, string> = {
  affects: "affects", exposed_to: "exposed to", observed_in: "observed in", mitigates: "mitigates",
  fails_to_mitigate: "fails to mitigate", implicated_in: "implicated in", hosted: "hosted",
};

export default function GraphPage() {
  return <Suspense><Graph /></Suspense>;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

function Graph() {
  const params = useSearchParams();
  const router = useRouter();
  const focus = params.get("focus") ?? "";
  const lit = useMemo(() => new Set((params.get("lit") ?? "").split(",").filter(Boolean)), [params]);
  const [types, setTypes] = useState<Set<string>>(new Set(["stressor", "organism", "tissue", "outcome", "countermeasure"]));
  const [minPapers, setMinPapers] = useState(3);
  const [depth, setDepth] = useState<"1" | "2">("1");
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[] } | null>(null);
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
    const qs = new URLSearchParams({ types: [...types].join(","), min_papers: String(focus ? 1 : minPapers), depth, limit: "220" });
    if (focus) qs.set("focus", focus);
    setError(null);
    api<{ nodes: GNode[]; edges: GEdge[] }>(`/graph?${qs}`).then(setData).catch(setError);
  }, [types, minPapers, focus, depth]);

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
      const maxP = Math.max(...data.nodes.map((n) => n.papers), 1);
      const maxE = Math.max(...data.edges.map((e) => e.paper_count), 1);
      cyRef.current?.destroy();
      const cy = cytoscape({
        container: box.current,
        elements: [
          ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label, type: n.type, papers: n.papers, size: 16 + 44 * Math.sqrt(n.papers / maxP), color: col[n.type] ?? ink2 } })),
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
  }, [data, lit, focus, themeTick]);

  useEffect(() => () => cyRef.current?.destroy(), []);

  const matches = query.length >= 2
    ? entities.filter((e) => (e.label + " " + e.synonyms.join(" ")).toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];
  const setFocus = (id: string) => { setQuery(""); router.push(id ? `/graph?focus=${encodeURIComponent(id)}` : "/graph"); };
  const toggle = (t: string) => setTypes((s) => { const n = new Set(s); if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t); return n; });

  return (
    <Page wide title="Knowledge Graph" subtitle="Entities extracted from every publication and the evidence linking them. Arrow colour shows the majority effect direction; tap any node or link for the underlying papers and quotes.">
      <div className="flex flex-col lg:flex-row gap-3 mb-3 no-print">
        <div className="relative lg:w-[320px]">
          <form onSubmit={(e) => { e.preventDefault(); if (matches[0]) setFocus(matches[0].id); }}
            className="flex items-center gap-1.5 h-9 px-2 rounded-[10px] bg-fill">
            <Icon name="search" size={17} className="text-label-2" stroke={2.2} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Focus on an entity (e.g. bone, mouse)"
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
        {focus ? (
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
        {data && <span className="t-foot text-label-2">{data.nodes.length} entities · {data.edges.length} links</span>}
      </div>

      <div className="relative bg-bg-2 rounded-2xl overflow-hidden h-[calc(100dvh-300px)] min-h-[420px]">
        <div ref={box} className="absolute inset-0" />
        {!data && !error && <div className="absolute inset-0 grid place-items-center t-sub text-label-2">Laying out graph…</div>}
        {error ? <div className="absolute inset-0 grid place-items-center t-sub text-label-2">Can&apos;t reach the API.</div> : null}
        <div className="absolute left-3 bottom-3 material rounded-xl px-3 py-2 space-y-1.5 border border-sep">
          <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[520px]">
            {[...types].map((t) => (
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
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-bg-2 rounded-2xl p-3"><div className="t-title2 tabular-nums">{d.papers}</div><div className="t-foot text-label-2">papers</div></div>
        <div className="bg-bg-2 rounded-2xl p-3"><div className="t-title2 tabular-nums">{d.flight_papers}</div><div className="t-foot text-label-2">from spaceflight</div></div>
      </div>
      <button onClick={() => onFocus(d.id)} className="w-full h-11 rounded-xl bg-tint text-white t-headline mb-6 btn-press">Focus graph here</button>
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
      <Section header={`Publications (${d.papers.length})`}>
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
                  <span className="t-cap text-label-2">{[f.labels.organism, f.year].filter(Boolean).join(" · ")}</span></div>
                <Quote section={f.section}>{f.evidence_quote}</Quote>
                <div className="t-cap text-label-2 mt-2 line-clamp-1">{f.paper_title}</div>
              </Link>
            ))}
          </div>
        </>
      )}
      <Section header="Publications">
        {d.paper_cards.slice(0, 15).map((p) => <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub line-clamp-2">{p.title}</span>} subtitle={`${p.year}`} />)}
      </Section>
    </div>
  );
}

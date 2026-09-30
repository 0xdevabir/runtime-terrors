"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnswerText } from "@/components/Answer";
import { VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { PERSONAS, usePrefs } from "@/components/prefs";
import { Chip, DirectionGlyph, Quote, Segmented, Sheet, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { API, Finding, Passage, Strength } from "@/lib/api";
import { TYPE_META, useEntities } from "@/lib/entities";

type Panel = { consensus: { id: string; status: string; majority: string; agreement: number; n_papers: number; votes: Record<string, number>; strength: Strength; label: string }[]; risks: string[] };
type Turn = {
  id: number; q: string; persona: string; text: string; status: "retrieving" | "streaming" | "done" | "error";
  passages: Passage[]; entities: string[]; lit: string[]; findings: Finding[]; panel?: Panel;
  mode?: string; refused?: boolean; citations?: number[]; invalid?: number[];
};

const SCOPE = [
  { value: "", label: "All studies" },
  { value: "flight,both", label: "Spaceflight" },
  { value: "ground_analog,ground", label: "Ground" },
];

export default function AskPage() {
  return <Suspense><Ask /></Suspense>;
}

function Ask() {
  const params = useSearchParams();
  const { persona, setPersona } = usePrefs();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState("");
  const [source, setSource] = useState<{ turn: Turn; n: number } | null>(null);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const update = (id: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)));

  const ask = useCallback((q: string) => {
    q = q.trim();
    if (q.length < 3) return;
    esRef.current?.close();
    const id = Date.now();
    setTurns((ts) => [...ts, { id, q, persona, text: "", status: "retrieving", passages: [], entities: [], lit: [], findings: [] }]);
    setInput("");
    const url = `${API}/api/ask?q=${encodeURIComponent(q)}&persona=${persona}${scope ? `&study_type=${scope}` : ""}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.addEventListener("retrieval", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      update(id, { passages: d.passages, entities: d.entities, lit: d.lit, findings: d.findings, panel: d.panel, status: "streaming" });
    });
    es.addEventListener("token", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      update(id, (t) => ({ text: t.text + d.text }));
    });
    es.addEventListener("done", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      update(id, { status: "done", mode: d.mode, refused: d.refused, citations: d.citations, invalid: d.invalid_citations });
      es.close();
    });
    es.onerror = () => {
      update(id, (t) => (t.status === "done" ? {} : { status: t.text ? "done" : "error" }));
      es.close();
    };
  }, [persona, scope]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      ask(q);
    }
  }, [params, ask]);

  useEffect(() => () => esRef.current?.close(), []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length]);

  const busy = turns.some((t) => t.status === "retrieving" || t.status === "streaming");

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="no-print sticky top-0 z-30 material hairline-b">
        <div className="mx-auto max-w-[860px] px-4 lg:px-8 h-[52px] flex items-center justify-between gap-3">
          <div className="t-headline">Ask</div>
          <Segmented size="sm" className="w-[270px]" value={persona} onChange={setPersona}
            options={PERSONAS.map((p) => ({ value: p.id, label: p.short }))} />
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-[860px] px-4 lg:px-8 pt-4">
        {turns.length === 0 && <Intro onAsk={ask} />}
        {turns.map((t) => <TurnView key={t.id} t={t} onCite={(n) => setSource({ turn: t, n })} onAsk={ask} />)}
        <div ref={bottom} className="h-40" />
      </div>

      {/* composer */}
      <div className="no-print sticky bottom-[calc(50px+env(safe-area-inset-bottom))] lg:bottom-0 z-20 pt-2 pb-3 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="mx-auto max-w-[860px] px-4 lg:px-8">
          <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            {SCOPE.map((s) => <Chip key={s.value} active={scope === s.value} onClick={() => setScope(s.value)}>{s.label}</Chip>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex items-end gap-2 bg-bg-2 rounded-[22px] pl-4 pr-1.5 py-1.5 shadow-[var(--shadow)] border border-sep">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Ask a question about space biology"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              className="flex-1 bg-transparent outline-none resize-none t-body py-1.5 max-h-32 placeholder:text-label-2" />
            <button type="submit" disabled={busy || input.trim().length < 3} aria-label="Send"
              className="grid place-items-center w-8 h-8 rounded-full bg-tint text-white disabled:opacity-30 btn-press shrink-0">
              <Icon name="arrowUp" size={18} stroke={2.6} />
            </button>
          </form>
        </div>
      </div>

      <Sheet open={!!source} onClose={() => setSource(null)} title={source ? `Source ${source.n}` : ""} wide>
        {source && <SourceDetail p={source.turn.passages[source.n - 1]} />}
      </Sheet>
    </div>
  );
}

function Intro({ onAsk }: { onAsk: (q: string) => void }) {
  const ex = [
    "What happens to muscle mass in rodents during spaceflight?",
    "How does microgravity change plant root growth?",
    "Does spaceflight impair wound healing?",
    "What are the effects of space radiation on the heart?",
    "Do bisphosphonates prevent bone loss in space?",
    "How does the gut microbiome change in astronauts?",
  ];
  return (
    <div className="pt-10 pb-6 text-center">
      <div className="mx-auto w-16 h-16 rounded-[18px] grid place-items-center text-white mb-4" style={{ background: "linear-gradient(145deg,#5e5ce6,#007aff)" }}>
        <Icon name="sparkles" size={34} />
      </div>
      <h1 className="t-title1">Ask the literature</h1>
      <p className="t-sub text-label-2 mt-2 max-w-[520px] mx-auto">
        Every answer is grounded in retrieved passages from NASA space biology publications. Tap a citation to read the exact source.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 mt-8 text-left">
        {ex.map((q) => (
          <button key={q} onClick={() => onAsk(q)} className="bg-bg-2 rounded-xl px-4 py-3 t-sub pressable btn-press flex items-center gap-2">
            <span className="flex-1">{q}</span><Icon name="arrowUpRight" size={15} className="text-label-3" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnView({ t, onCite, onAsk }: { t: Turn; onCite: (n: number) => void; onAsk: (q: string) => void }) {
  const { label } = useEntities();
  const [showFindings, setShowFindings] = useState(false);
  const cited = new Set(t.citations ?? []);
  return (
    <article className="mb-8 anim-pop">
      {/* question bubble */}
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] bg-tint text-white rounded-[20px] rounded-br-[6px] px-4 py-2.5 t-body">{t.q}</div>
      </div>

      <div className="bg-bg-2 rounded-[20px] p-4 md:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 t-foot text-label-2">
            <span className="text-indigo"><Icon name="sparkles" size={16} /></span>
            {t.status === "retrieving" ? "Searching publications…" : t.status === "streaming" ? `Reading ${t.passages.length} sources…` : t.status === "error" ? "Something went wrong" : `Answer · ${t.passages.length} sources`}
          </div>
          {t.mode && <Tag tone={t.mode === "claude" ? "purple" : "gray"}>{t.mode === "claude" ? "Claude" : "Extractive"}</Tag>}
        </div>

        {t.status === "retrieving" && <div className="space-y-2"><div className="skeleton h-4 w-[90%]" /><div className="skeleton h-4 w-[75%]" /><div className="skeleton h-4 w-[60%]" /></div>}
        {t.status === "error" && <p className="t-sub text-label-2">Couldn&apos;t reach the knowledge engine. Check that the API is running and try again.</p>}
        {t.text && (
          <div className={t.refused ? "flex gap-2 items-start" : ""}>
            {t.refused && <span className="text-orange mt-0.5"><Icon name="info" size={20} /></span>}
            <AnswerText text={t.text} onCite={onCite} streaming={t.status === "streaming"} valid={t.passages.length} />
          </div>
        )}

        {t.status === "done" && !t.refused && (t.citations?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 t-cap text-label-2 mt-1">
            <span className="text-green"><Icon name="checkCircle" size={14} stroke={2.2} /></span>
            {t.citations!.length} citations verified against retrieved sources
            {(t.invalid?.length ?? 0) > 0 && <span className="text-red"> · {t.invalid!.length} removed</span>}
          </div>
        )}

        {/* sources carousel */}
        {t.passages.length > 0 && (
          <div className="mt-4">
            <div className="t-foot font-semibold text-label-2 mb-2">Sources</div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:-mx-5 md:px-5 pb-1 snap-x">
              {t.passages.map((p, i) => (
                <button key={p.chunk_id} onClick={() => onCite(i + 1)}
                  className={`snap-start shrink-0 w-[230px] text-left rounded-xl p-3 pressable btn-press ${cited.has(i + 1) ? "bg-tint/10 ring-1 ring-tint/30" : "bg-bg-3"}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="grid place-items-center w-[18px] h-[18px] rounded-[5px] bg-tint/15 text-tint t-cap2 font-bold">{i + 1}</span>
                    <span className="t-cap2 text-label-2 uppercase font-semibold">{p.section} · {p.year}</span>
                  </div>
                  <div className="t-foot font-medium line-clamp-3">{p.title}</div>
                  <div className="mt-2"><StudyTag type={p.study_type} /></div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* evidence panel */}
      {t.status !== "retrieving" && (t.panel?.consensus.length || t.lit.length > 0) ? (
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          {t.panel && t.panel.consensus.length > 0 && (
            <div className="bg-bg-2 rounded-[20px] p-4">
              <div className="t-foot font-semibold text-label-2 mb-3">What the corpus says overall</div>
              <div className="space-y-4">
                {t.panel.consensus.slice(0, 3).map((c) => (
                  <Link key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} className="block pressable rounded-lg -m-1 p-1">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="t-sub font-medium">{c.label}</div>
                      <Tag tone={c.status === "contradictory" ? "red" : c.status === "consensus" ? "green" : "gray"}>
                        {c.status === "contradictory" ? "Conflicting" : c.status === "consensus" ? "Consensus" : "Emerging"}
                      </Tag>
                    </div>
                    <VoteBar votes={c.votes} height={8} />
                    <div className="mt-1.5"><StrengthBadge s={c.strength} /></div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {t.lit.length > 0 && (
            <div className="bg-bg-2 rounded-[20px] p-4">
              <div className="t-foot font-semibold text-label-2 mb-3">Concepts in these sources</div>
              <div className="flex flex-wrap gap-1.5">
                {t.lit.slice(0, 24).map((e) => (
                  <Chip key={e} href={`/graph?focus=${encodeURIComponent(e)}`} color={TYPE_META[e.split(":")[0]]?.color}
                    active={t.entities.includes(e)}>{label(e)}</Chip>
                ))}
              </div>
              <Link href={`/graph?focus=${encodeURIComponent(t.entities[0] ?? t.lit[0])}&lit=${encodeURIComponent(t.lit.join(","))}`}
                className="inline-flex items-center gap-1 t-foot text-tint mt-3">
                <Icon name="graph" size={15} /> Show on knowledge graph
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {t.findings.length > 0 && t.status === "done" && (
        <div className="mt-3">
          <button onClick={() => setShowFindings(!showFindings)} className="flex items-center gap-1 t-foot text-tint px-1">
            <Icon name={showFindings ? "chevronDown" : "chevron"} size={13} stroke={2.4} />
            {showFindings ? "Hide" : "Show"} {t.findings.length} structured findings
          </button>
          {showFindings && (
            <div className="group mt-2">
              {t.findings.map((f) => (
                <Link key={f.id} href={`/papers/${f.paper_id}`} className="row pressable items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                      <span className="t-sub font-medium">{f.labels.outcome}</span>
                      <DirectionGlyph d={f.direction} />
                      <span className="t-cap text-label-2">{[f.labels.stressor, f.labels.organism, f.labels.tissue].filter(Boolean).join(" · ")}</span>
                    </div>
                    <div className="t-foot text-label-2 line-clamp-2">“{f.evidence_quote}”</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {t.status === "done" && t.entities.length > 0 && (
        <FollowUps entities={t.entities} onAsk={onAsk} />
      )}
    </article>
  );
}

function FollowUps({ entities, onAsk }: { entities: string[]; onAsk: (q: string) => void }) {
  const { label } = useEntities();
  const e = entities.map((x) => ({ id: x, type: x.split(":")[0], l: label(x).toLowerCase() }));
  const outcome = e.find((x) => x.type === "outcome" || x.type === "tissue");
  const qs = [
    outcome && `What countermeasures reduce ${outcome.l} changes in spaceflight?`,
    outcome && `Do ground analogs reproduce spaceflight effects on ${outcome.l}?`,
    e[0] && `Where is the evidence on ${e[0].l} weakest?`,
  ].filter(Boolean) as string[];
  if (!qs.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar mt-3 -mx-4 px-4">
      {qs.map((q) => (
        <button key={q} onClick={() => onAsk(q)} className="shrink-0 t-foot bg-fill rounded-full px-3 h-8 btn-press">{q}</button>
      ))}
    </div>
  );
}

function SourceDetail({ p }: { p?: Passage }) {
  const { label } = useEntities();
  if (!p) return null;
  return (
    <div className="space-y-4">
      <div>
        <div className="t-title3">{p.title}</div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <StudyTag type={p.study_type} />
          <Tag>{p.section}</Tag>
          <span className="t-foot text-label-2">{p.year} · {p.paper_id}</span>
        </div>
      </div>
      <div className="bg-bg-2 rounded-2xl p-4"><Quote>{p.text}</Quote></div>
      {p.entities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.entities.map((e) => <Chip key={e} href={`/graph?focus=${encodeURIComponent(e)}`} color={TYPE_META[e.split(":")[0]]?.color}>{label(e)}</Chip>)}
        </div>
      )}
      <div className="group">
        <Link href={`/papers/${p.paper_id}`} className="row pressable"><span className="flex-1 text-tint">Open paper summary</span><Icon name="chevron" size={14} className="text-label-3" /></Link>
        <a href={p.url} target="_blank" rel="noreferrer" className="row pressable"><span className="flex-1 text-tint">Read full text on PubMed Central</span><Icon name="arrowUpRight" size={15} className="text-label-3" /></a>
      </div>
    </div>
  );
}

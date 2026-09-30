"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnswerText } from "@/components/Answer";
import { VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { PERSONAS, usePrefs } from "@/components/prefs";
import { Chip, DirectionGlyph, Quote, Segmented, Sheet, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { API, api, Confidence, Filters, Finding, Passage, qs, Strength, Support } from "@/lib/api";
import { TYPE_META, useEntities } from "@/lib/entities";

type Panel = { consensus: { id: string; status: string; majority: string; agreement: number; n_papers: number; votes: Record<string, number>; strength: Strength; label: string }[]; risks: string[] };
type Turn = {
  id: number; q: string; persona: string; text: string; status: "retrieving" | "streaming" | "done" | "error";
  passages: Passage[]; entities: string[]; lit: string[]; findings: Finding[]; panel?: Panel;
  mode?: string; refused?: boolean; citations?: number[]; invalid?: number[]; citedPapers?: string[];
  support?: Support[]; confidence?: Confidence; disclaimer?: string; retrievalQuery?: string; sides?: string[] | null;
  latency?: number; filters: Filters;
};

const SCOPE = [
  { value: "", label: "All studies" },
  { value: "flight,both", label: "Orbital flight" },
  { value: "short_ug", label: "Drop tower / parabolic" },
  { value: "ground,computational", label: "1g lab / model" },
];

const HIST_CHARS = 1200; // per earlier answer sent back as follow-up context

export default function AskPage() {
  return <Suspense><Ask /></Suspense>;
}

function Ask() {
  const params = useSearchParams();
  const { persona, setPersona } = usePrefs();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [filters, setFilters] = useState<Filters>({});
  const [showFilters, setShowFilters] = useState(false);
  const scope = filters.study_type ?? "";
  const setScope = (v: string) => setFilters((f) => ({ ...f, study_type: v || undefined }));
  const nFilters = [filters.fuel, filters.condition, filters.geometry, filters.year_min, filters.year_max].filter(Boolean).length;
  const [source, setSource] = useState<{ turn: Turn; n: number } | null>(null);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  useEffect(() => { turnsRef.current = turns; }, [turns]);

  const update = (id: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)));

  const ask = useCallback((q: string, f: Filters = filters) => {
    q = q.trim();
    if (q.length < 3) return;
    esRef.current?.close();
    const id = Date.now();
    const history = turnsRef.current.filter((t) => t.status === "done" && !t.refused).slice(-4)
      .map((t) => ({ q: t.q, a: t.text.slice(0, HIST_CHARS) }));
    setTurns((ts) => [...ts, { id, q, persona, text: "", status: "retrieving", passages: [], entities: [], lit: [], findings: [], filters: f }]);
    setInput("");
    const url = `${API}/api/ask${qs({ q, persona, ...f, history: history.length ? JSON.stringify(history) : "" })}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.addEventListener("retrieval", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      update(id, { passages: d.passages, entities: d.entities, lit: d.lit, findings: d.findings, panel: d.panel, status: "streaming",
                   retrievalQuery: d.retrieval_query, sides: d.sides });
    });
    es.addEventListener("token", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      update(id, (t) => ({ text: t.text + d.text }));
    });
    es.addEventListener("done", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      update(id, { status: "done", mode: d.mode, refused: d.refused, citations: d.citations, invalid: d.invalid_citations,
                   citedPapers: d.cited_papers, support: d.support, confidence: d.confidence, disclaimer: d.disclaimer, latency: d.latency_ms });
      es.close();
    });
    es.onerror = () => {
      update(id, (t) => (t.status === "done" ? {} : { status: t.text ? "done" : "error" }));
      es.close();
    };
  }, [persona, filters]);

  useEffect(() => {
    const q = params.get("q");
    if (q && !started.current) {
      started.current = true;
      const f: Filters = {};
      for (const k of ["study_type", "fuel", "condition", "geometry"] as const) if (params.get(k)) f[k] = params.get(k)!;
      for (const k of ["year_min", "year_max"] as const) if (params.get(k)) f[k] = +params.get(k)!;
      setFilters(f);
      if (Object.keys(f).some((k) => k !== "study_type")) setShowFilters(true);
      ask(q, f);
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
          <Segmented size="sm" className="w-[340px] max-w-[62vw]" value={persona} onChange={setPersona}
            options={PERSONAS.map((p) => ({ value: p.id, label: p.short }))} />
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-[860px] px-4 lg:px-8 pt-4">
        {turns.length === 0 && <Intro onAsk={ask} />}
        {turns.map((t, i) => <TurnView key={t.id} t={t} followUp={i > 0} onCite={(n) => setSource({ turn: t, n })} onAsk={ask} />)}
        <div ref={bottom} className="h-40" />
      </div>

      {/* composer */}
      <div className="no-print sticky bottom-[calc(50px+env(safe-area-inset-bottom))] lg:bottom-0 z-20 pt-2 pb-3 bg-gradient-to-t from-bg via-bg/95 to-transparent">
        <div className="mx-auto max-w-[860px] px-4 lg:px-8">
          <div className="flex gap-1.5 mb-2 overflow-x-auto no-scrollbar">
            {SCOPE.map((s) => <Chip key={s.value} active={scope === s.value} onClick={() => setScope(s.value)}>{s.label}</Chip>)}
            <Chip active={showFilters || nFilters > 0} onClick={() => setShowFilters(!showFilters)}>
              <span className="inline-flex items-center gap-1"><Icon name="filter" size={13} />Filters{nFilters ? ` · ${nFilters}` : ""}</span>
            </Chip>
            {turns.length > 0 && <Chip onClick={() => { esRef.current?.close(); setTurns([]); }}>New conversation</Chip>}
          </div>
          {showFilters && <FilterPanel value={filters} onChange={setFilters} />}
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex items-end gap-2 bg-bg-2 rounded-[22px] pl-4 pr-1.5 py-1.5 shadow-[var(--shadow)] border border-sep">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Ask a question about freefall fire safety"
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
    "How does flame spread over thin fuels change in microgravity?",
    "What did the Saffire experiments learn about large spacecraft fires?",
    "Does elevated oxygen make cabin materials more flammable?",
    "How do fuel droplets burn without gravity?",
    "Is water mist or CO₂ better at suppressing fires in microgravity?",
    "How does reduced pressure change flammability limits?",
  ];
  return (
    <div className="pt-10 pb-6 text-center">
      <div className="mx-auto w-16 h-16 rounded-[18px] grid place-items-center text-white mb-4" style={{ background: "linear-gradient(145deg,#5e5ce6,#007aff)" }}>
        <Icon name="sparkles" size={34} />
      </div>
      <h1 className="t-title1">Ask the literature</h1>
      <p className="t-sub text-label-2 mt-2 max-w-[520px] mx-auto">
        Every answer is grounded in retrieved passages from NASA microgravity combustion and fire-safety reports. Tap a citation to read the exact source.
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

function TurnView({ t, onCite, onAsk, followUp }: { t: Turn; onCite: (n: number) => void; onAsk: (q: string) => void; followUp: boolean }) {
  const { label } = useEntities();
  const [showFindings, setShowFindings] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
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
            {t.status === "retrieving" ? "Searching reports…" : t.status === "streaming" ? `Reading ${t.passages.length} sources…` : t.status === "error" ? "Something went wrong" : `Answer · ${t.passages.length} sources`}
          </div>
          {t.mode && <Tag tone={t.mode === "extractive" ? "gray" : "purple"}>{t.mode === "gemini" ? "Gemini" : t.mode === "claude" ? "Claude" : "Extractive"}</Tag>}
        </div>
        {t.retrievalQuery && t.retrievalQuery !== t.q && (
          <div className="t-cap text-label-2 -mt-1 mb-3">
            {followUp ? "Follow-up read as" : "Searched for"}: <span className="text-label">{t.retrievalQuery}</span>
            {t.sides && <> · comparing <b>{t.sides[0]}</b> vs <b>{t.sides[1]}</b></>}
          </div>
        )}

        {t.status === "retrieving" && <div className="space-y-2"><div className="skeleton h-4 w-[90%]" /><div className="skeleton h-4 w-[75%]" /><div className="skeleton h-4 w-[60%]" /></div>}
        {t.status === "error" && <p className="t-sub text-label-2">Couldn&apos;t reach Emberfall. Check that the API is running and try again.</p>}
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

        {t.status === "done" && t.confidence && !t.refused && (
          <ConfidenceBox c={t.confidence} support={t.support ?? []} open={showSupport} onToggle={() => setShowSupport(!showSupport)} onCite={onCite} />
        )}
        {t.status === "done" && <ActionBar t={t} />}

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
                    <span className="t-cap2 text-label-2 uppercase font-semibold truncate">{p.section} · {p.year}</span>
                  </div>
                  {p.side && <div className="t-cap2 font-semibold text-indigo mb-1 truncate">{p.side}</div>}
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
                      <span className="t-cap text-label-2">{[f.labels.condition, f.labels.fuel, f.labels.geometry].filter(Boolean).join(" · ")}</span>
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
  const outcome = e.find((x) => x.type === "outcome" || x.type === "geometry");
  const qs = [
    outcome && `Which countermeasures limit ${outcome.l} in microgravity fires?`,
    outcome && `Do drop-tower and 1g tests reproduce orbital results on ${outcome.l}?`,
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
        <Link href={`/papers/${p.paper_id}?hl=${encodeURIComponent(p.chunk_id)}`} className="row pressable"><span className="flex-1 text-tint">Open paper summary</span><Icon name="chevron" size={14} className="text-label-3" /></Link>
        <a href={p.url} target="_blank" rel="noreferrer" className="row pressable"><span className="flex-1 text-tint">Read the report on NASA NTRS</span><Icon name="arrowUpRight" size={15} className="text-label-3" /></a>
      </div>
    </div>
  );
}

const CONF_TONE = { high: "green", medium: "orange", low: "red", none: "gray" } as const;

function ConfidenceBox({ c, support, open, onToggle, onCite }: {
  c: Confidence; support: Support[]; open: boolean; onToggle: () => void; onCite: (n: number) => void;
}) {
  const checked = support.filter((s) => s.score !== null);
  const weak = checked.filter((s) => (s.score ?? 0) < 0.5).length;
  return (
    <div className="mt-3 rounded-xl bg-bg-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={CONF_TONE[c.label]}>{c.label === "none" ? "No confidence" : `${c.label[0].toUpperCase()}${c.label.slice(1)} confidence`}</Tag>
        <span className="t-cap text-label-2 flex-1 min-w-[180px]">{c.reasons.join(" · ")}</span>
        {checked.length > 0 && (
          <button onClick={onToggle} className="t-cap text-tint inline-flex items-center gap-1">
            <Icon name={open ? "chevronDown" : "chevron"} size={12} stroke={2.4} />
            {open ? "Hide" : "Check"} {checked.length} claims{weak ? ` · ${weak} weakly supported` : ""}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-3 space-y-2">
          {checked.map((s, i) => {
            const v = s.score ?? 0;
            const tone = v >= 0.7 ? "text-green" : v >= 0.5 ? "text-orange" : "text-red";
            return (
              <li key={i} className="flex gap-2 items-start t-foot">
                <span className={`${tone} mt-0.5 shrink-0`}><Icon name={v >= 0.5 ? "checkCircle" : "warn"} size={14} stroke={2.2} /></span>
                <span className="flex-1">
                  {s.sentence.replace(/\s*\[\d{1,2}\]/g, "")}{" "}
                  {s.citations.map((n) => <button key={n} onClick={() => onCite(n)} className="t-cap2 font-bold text-tint mx-0.5">[{n}]</button>)}
                  <span className="t-cap2 text-label-2 ml-1">{Math.round(v * 100)}% overlap with source</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActionBar({ t }: { t: Turn }) {
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const [copied, setCopied] = useState("");
  const rate = (rating: "up" | "down") => {
    setRated(rating);
    api("/feedback", { method: "POST", body: JSON.stringify({ q: t.q, rating, persona: t.persona, mode: t.mode ?? "",
      citations: t.citations ?? [], cited_papers: t.citedPapers ?? [] }) }).catch(() => setRated(null));
  };
  const copy = async (what: "link" | "answer") => {
    const text = what === "link" ? `${location.origin}/ask${qs({ q: t.q, ...t.filters })}`
      : `Q: ${t.q}\n\n${t.text}\n\nSources:\n${t.passages.map((p, i) => `[${i + 1}] ${p.title} (${p.year}) ${p.url}`).join("\n")}`;
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1500); } catch {}
  };
  const btn = "inline-flex items-center gap-1 h-7 px-2 rounded-full t-cap btn-press hover:bg-fill";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1 text-label-2">
        <button className={`${btn} ${rated === "up" ? "text-green" : ""}`} onClick={() => rate("up")} disabled={!!rated} aria-label="Helpful">
          <Icon name="check" size={14} stroke={2.4} />{rated === "up" ? "Thanks" : "Helpful"}
        </button>
        <button className={`${btn} ${rated === "down" ? "text-red" : ""}`} onClick={() => rate("down")} disabled={!!rated} aria-label="Not helpful">
          <Icon name="xmark" size={14} stroke={2.4} />{rated === "down" ? "Noted" : "Wrong or unhelpful"}
        </button>
        <button className={btn} onClick={() => copy("link")}><Icon name="link" size={14} />{copied === "link" ? "Link copied" : "Share link"}</button>
        <button className={btn} onClick={() => copy("answer")}><Icon name="doc" size={14} />{copied === "answer" ? "Copied" : "Copy with sources"}</button>
        {t.latency != null && <span className="t-cap2 ml-auto">{(t.latency / 1000).toFixed(1)} s</span>}
      </div>
      {t.disclaimer && <p className="t-cap2 text-label-3 mt-2">{t.disclaimer}</p>}
    </div>
  );
}

const YEARS = Array.from({ length: 2026 - 1960 + 1 }, (_, i) => 2026 - i);

function FilterPanel({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const { entities } = useEntities();
  const set = (k: keyof Filters, v: string) => onChange({ ...value, [k]: k.startsWith("year") ? (v ? +v : undefined) : v || undefined });
  const opts = (type: string) => entities.filter((e) => e.type === type && e.papers > 0).sort((a, b) => b.papers - a.papers);
  const sel = "h-8 rounded-lg bg-bg-2 border border-sep px-2 t-foot min-w-0";
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2 p-2 rounded-xl bg-bg-2 border border-sep">
      {(["fuel", "condition", "geometry"] as const).map((k) => (
        <select key={k} aria-label={k} className={sel} value={value[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
          <option value="">Any {TYPE_META[k].label.toLowerCase()}</option>
          {opts(k).map((e) => <option key={e.id} value={e.id}>{e.label} ({e.papers})</option>)}
        </select>
      ))}
      <select aria-label="From year" className={sel} value={value.year_min ?? ""} onChange={(e) => set("year_min", e.target.value)}>
        <option value="">From any year</option>
        {YEARS.map((y) => <option key={y} value={y}>From {y}</option>)}
      </select>
      <select aria-label="To year" className={sel} value={value.year_max ?? ""} onChange={(e) => set("year_max", e.target.value)}>
        <option value="">To any year</option>
        {YEARS.map((y) => <option key={y} value={y}>To {y}</option>)}
      </select>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useState } from "react";
import { Meter } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { Page, Row, Section, Segmented, Skeleton, Stat, Tag } from "@/components/ui";
import { Stats } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type EvalRow = {
  q: string; type: "answerable" | "unanswerable"; refused: boolean; correct_refusal: boolean; latency_s: number;
  n_citations: number; invalid_citations: number; answer_preview: string;
  "hit@1"?: boolean; "hit@5"?: boolean; rr?: number; top_titles?: string[];
};
type Eval = {
  generated_at: string; mode: string; dense_retrieval: boolean; n_questions: number; n_answerable: number; n_unanswerable: number;
  metrics: Record<string, number | null>; rows: EvalRow[];
  baselines?: Record<string, Record<string, number>>;
  extraction?: { status: "unlabelled" | "labelled"; n_sampled: number; fields?: Record<string, { precision: number; n: number } | null> } | null;
};

const STAGE: Record<string, string> = { bm25: "BM25 keywords", dense: "Dense embeddings", hybrid: "Hybrid (RRF + boosts)", rerank: "Hybrid + cross-encoder" };

const METRICS: { k: string; label: string; help: string }[] = [
  { k: "hit@5", label: "Relevant paper in top 5", help: "Share of answerable questions where a topically relevant publication is among the first five retrieved." },
  { k: "mrr", label: "Mean reciprocal rank", help: "1 / rank of the first relevant paper, averaged. 1.0 means it is always first." },
  { k: "answer_rate", label: "Answers in-domain questions", help: "Answerable questions that were answered instead of refused." },
  { k: "refusal_accuracy", label: "Refuses off-topic questions", help: "Questions outside space biology that were correctly declined instead of answered." },
  { k: "citation_validity", label: "Citations point to real sources", help: "Every [n] marker must refer to a passage that was actually retrieved." },
  { k: "faithfulness", label: "Claim support (faithfulness)", help: "Average lexical overlap between each answer sentence and the passage it cites. A proxy: high overlap means the claim is stated in the source." },
  { k: "supported_sentences", label: "Sentences backed by their citation", help: "Share of cited answer sentences whose cited passage covers at least half of their content words." },
  { k: "quote_guard", label: "Findings quoted verbatim", help: "Extracted findings whose evidence sentence was found word-for-word in the paper." },
];

export default function EvalPage() {
  const { data, error } = useApi<Eval>("/eval");
  const { data: s } = useApi<Stats>("/stats");
  const [filter, setFilter] = useState<"all" | "miss">("all");
  const rows = (data?.rows ?? []).filter((r) => filter === "all" || (r.type === "answerable" ? !r["hit@5"] || !r.correct_refusal : !r.correct_refusal));

  return (
    <Page title="Trust & Evaluation" subtitle="How the engine is checked: a fixed question set scored on retrieval, refusal and citation accuracy, plus safeguards on every answer.">
      <Section header="Safeguards on every answer">
        <Row icon="quote" iconBg="var(--indigo)" title="Grounded in retrieved passages" subtitle="Answers are built only from passages retrieved from the corpus, each cited as [n] and tappable." />
        <Row icon="checkCircle" iconBg="var(--green)" title="Citation check" subtitle="After each answer, every citation is verified against the retrieved sources; invalid ones are struck through in red." />
        <Row icon="split" iconBg="var(--red)" title="Conflicts surfaced, not hidden" subtitle="When papers disagree, the answer shows the vote split and likely reasons alongside it." />
        <Row icon="warn" iconBg="var(--orange)" title="Refuses when evidence is thin" subtitle="Low-coverage or off-topic questions get an explicit 'not enough evidence' reply instead of a guess." />
        <Row icon="target" iconBg="var(--purple)" title="Claim-by-claim support and a confidence label" subtitle="Each answer sentence is checked against the passage it cites; weakly supported claims are flagged, and a high / medium / low confidence label explains why." />
        <Row icon="person" iconBg="var(--pink)" title="Feedback and audit log" subtitle="Every answer can be rated; questions, retrieved passages and citations are logged to data/logs for review." />
        <Row icon="seal" iconBg="var(--teal)" title="Verbatim evidence quotes" subtitle={s ? `${s.quote_guard.rules_verified ?? 0} of ${s.quote_guard.rules_total ?? 0} extracted findings carry a sentence found word-for-word in the source paper.` : "Each finding carries a sentence found word-for-word in the source paper."} />
      </Section>

      {error ? (
        <div className="bg-bg-2 rounded-2xl p-4 mb-8 flex gap-3">
          <span className="text-orange"><Icon name="info" /></span>
          <div>
            <div className="t-headline">No evaluation run yet</div>
            <div className="t-foot text-label-2 mt-1">From <code className="font-mono">backend/</code> run <code className="font-mono">uv run python -m eval.run_eval</code> (or <code className="font-mono">make eval</code>), then reload.</div>
          </div>
        </div>
      ) : !data ? <Skeleton h={220} /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3 t-foot text-label-2">
            <Tag tone={data.mode === "claude" ? "purple" : "gray"}>{data.mode === "claude" ? "Claude answers" : "Extractive answers"}</Tag>
            <Tag tone={data.dense_retrieval ? "blue" : "gray"}>{data.dense_retrieval ? "Hybrid BM25 + embeddings" : "BM25 only"}</Tag>
            {data.n_answerable} in-domain + {data.n_unanswerable} off-topic questions · run {data.generated_at}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
            {METRICS.map((m) => {
              const v = data.metrics[m.k];
              return (
                <div key={m.k} className="bg-bg-2 rounded-2xl p-4" title={m.help}>
                  <div className="text-[28px] leading-none font-bold tabular-nums">{v == null ? "—" : m.k === "mrr" ? v.toFixed(2) : `${Math.round(v * 100)}%`}</div>
                  <div className="t-foot text-label-2 mt-2 mb-3">{m.label}</div>
                  <Meter value={v ?? 0} color="var(--series-1)" label={m.label} />
                </div>
              );
            })}
          </div>
          <p className="t-cap text-label-2 mb-8">
            Relevance is judged by a topic pattern over paper titles, so these are lenient topical-retrieval scores rather than exact-paper recall. Median answer latency {data.metrics.latency_p50_s}s.
          </p>

          {data.baselines && Object.keys(data.baselines).length > 0 && (
            <Section header="Retrieval by pipeline stage" footer="Same questions, each retrieval stage on its own. Shows what each component adds.">
              <div className="row block overflow-x-auto">
                <table className="w-full t-foot tabular-nums">
                  <thead><tr className="text-label-2 text-left"><th className="font-medium py-1">Stage</th><th className="font-medium">Hit@1</th><th className="font-medium">Hit@5</th><th className="font-medium">Hit@10</th><th className="font-medium">MRR</th></tr></thead>
                  <tbody>
                    {Object.entries(data.baselines).map(([k, b]) => (
                      <tr key={k} className="hairline-t"><td className="py-1.5">{STAGE[k] ?? k}</td><td>{b["hit@1"]}</td><td>{b["hit@5"]}</td><td>{b["hit@10"]}</td><td>{b.rr}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section header="Extraction accuracy (human-labelled)"
            footer={<>Labels have to come from people. Run <code className="font-mono">make label</code>, fill the y/n columns in <code className="font-mono">backend/eval/extraction_labels.csv</code>, then <code className="font-mono">make eval</code>.</>}>
            {data.extraction?.status === "labelled" && data.extraction.fields ? (
              Object.entries(data.extraction.fields).map(([f, v]) => (
                <div key={f} className="row"><span className="flex-1 t-sub capitalize">{f}</span>
                  <span className="t-foot text-label-2 tabular-nums">{v ? `${Math.round(v.precision * 100)}% correct · n=${v.n}` : "not labelled"}</span></div>
              ))
            ) : (
              <div className="row t-sub text-label-2">
                {data.extraction ? `${data.extraction.n_sampled} findings sampled, waiting for labels.` : "No labelled sample yet, so extraction precision is not reported."}
              </div>
            )}
          </Section>

          <div className="flex items-center justify-between mb-2">
            <div className="section-header !p-0">Question by question</div>
            <Segmented size="sm" className="w-[180px]" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "miss", label: "Misses" }]} />
          </div>
          <div className="group mb-10">
            {rows.length === 0 && <div className="row t-sub text-label-2">No misses.</div>}
            {rows.map((r) => {
              const ok = r.type === "answerable" ? !!r["hit@5"] && r.correct_refusal : r.correct_refusal;
              return (
                <details key={r.q} className="row block">
                  <summary className="list-none cursor-pointer flex items-start gap-3">
                    <span style={{ color: ok ? "var(--status-good)" : "var(--status-critical)" }} className="mt-0.5"><Icon name={ok ? "checkCircle" : "warn"} size={18} stroke={2.2} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="t-sub">{r.q}</div>
                      <div className="t-cap text-label-2 mt-0.5">
                        {r.type === "unanswerable" ? (r.refused ? "Correctly refused" : "Answered an off-topic question") :
                          `${r.refused ? "Refused · " : ""}${r.rr ? `first relevant paper at rank ${Math.round(1 / r.rr)}` : "no relevant paper in top 10"} · ${r.n_citations} citations${r.invalid_citations ? ` · ${r.invalid_citations} invalid` : ""}`}
                      </div>
                    </div>
                    <Link href={`/ask?q=${encodeURIComponent(r.q)}`} className="t-foot text-tint shrink-0">Try</Link>
                  </summary>
                  <div className="mt-2 pl-[30px] t-foot text-label-2 space-y-1">
                    {r.top_titles?.map((t, i) => <div key={i} className="line-clamp-1">{i + 1}. {t}</div>)}
                    <div className="text-label line-clamp-3 mt-1">{r.answer_preview}</div>
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}

      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          <Stat value={s.papers} label="publications indexed" icon="books" color="var(--orange)" />
          <Stat value={s.chunks.toLocaleString()} label="passages searchable" icon="search" color="var(--tint)" />
          <Stat value={s.findings.toLocaleString()} label="structured findings" icon="quote" color="var(--indigo)" />
          <Stat value={s.llm_papers} label="papers processed by Claude" icon="sparkles" color="var(--purple)" />
        </div>
      )}
    </Page>
  );
}

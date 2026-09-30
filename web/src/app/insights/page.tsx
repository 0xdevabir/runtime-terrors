"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { DirectionGlyph, Empty, ErrorNote, LoadingList, Page, Quote, SearchField, Segmented, Sheet, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { Consensus, DIRECTION_LABEL } from "@/lib/api";
import { useEntities } from "@/lib/entities";
import { useApi } from "@/lib/useApi";

type Status = "contradictory" | "consensus" | "emerging";
const INFO: Record<Status, { label: string; blurb: string; icon: "split" | "checkCircle" | "sparkles"; color: string }> = {
  contradictory: { label: "Conflicts", icon: "split", color: "var(--red)", blurb: "Several reports find opposite effects for the same condition and outcome. Each card lists the likely reasons — fuel, freefall time, platform — so you can tell a real contradiction from a difference in setup." },
  consensus: { label: "Consensus", icon: "checkCircle", color: "var(--green)", blurb: "Findings replicated across independent reports with most of them agreeing on direction." },
  emerging: { label: "Emerging", icon: "sparkles", color: "var(--indigo)", blurb: "Effects seen in only a few reports so far — promising, not yet established." },
};

export default function InsightsPage() {
  return <Suspense><Insights /></Suspense>;
}

function Insights() {
  const sp = useSearchParams();
  const router = useRouter();
  const openId = sp.get("id");
  const [status, setStatus] = useState<Status>("contradictory");
  const [q, setQ] = useState("");
  const { data, error } = useApi<Consensus[]>("/consensus");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data?.forEach((x) => { c[x.status] = (c[x.status] ?? 0) + 1; });
    return c;
  }, [data]);
  const rows = (data ?? []).filter((c) => c.status === status && (!q || c.label.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.n_papers - a.n_papers);

  return (
    <Page title="Consensus & Conflicts" subtitle="Where independent studies agree, and where they don't — with the evidence side by side."
      toolbar={
        <div className="space-y-3">
          <Segmented value={status} onChange={setStatus}
            options={(Object.keys(INFO) as Status[]).map((s) => ({ value: s, label: <>{INFO[s].label}{counts[s] ? <span className="text-label-2 font-normal"> {counts[s]}</span> : null}</> }))} />
          <SearchField value={q} onChange={setQ} placeholder="Filter by condition, outcome, geometry" />
        </div>
      }>
      <p className="t-foot text-label-2 mb-4 flex gap-2"><span style={{ color: INFO[status].color }}><Icon name={INFO[status].icon} size={16} /></span>{INFO[status].blurb}</p>
      {error ? <ErrorNote error={error} /> : !data ? <LoadingList rows={6} /> : rows.length === 0 ? <Empty title="Nothing here" text="No groups match this filter." /> : (
        <div className="grid md:grid-cols-2 gap-3 mb-10">
          {rows.map((c) => (
            <button key={c.id} onClick={() => router.push(`/insights?id=${encodeURIComponent(c.id)}`, { scroll: false })}
              className="text-left bg-bg-2 rounded-2xl p-4 pressable btn-press">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="t-headline">{c.label}</div>
                <Icon name="chevron" size={14} stroke={2.4} className="text-label-3 mt-1 shrink-0" />
              </div>
              <VoteBar votes={c.votes} />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 t-foot text-label-2">
                <span>{c.n_papers} papers</span>
                <StrengthBadge s={c.strength} compact />
                {c.status !== "contradictory" && c.majority && <DirectionGlyph d={c.majority} />}
              </div>
              {c.explanations.length > 0 && (
                <div className="mt-2 t-foot text-label-2 line-clamp-2"><span className="font-semibold text-label">Why they may differ: </span>{c.explanations.join("; ")}</div>
              )}
            </button>
          ))}
        </div>
      )}
      <Sheet wide open={!!openId} onClose={() => router.push("/insights", { scroll: false })} title="Evidence side by side">
        {openId && <Detail id={openId} />}
      </Sheet>
    </Page>
  );
}

function Detail({ id }: { id: string }) {
  const { data: c, error } = useApi<Consensus>(`/consensus/${encodeURIComponent(id)}`);
  const { label } = useEntities();
  if (error) return <ErrorNote error={error} />;
  if (!c) return <LoadingList rows={4} />;
  const sides = Object.entries(c.sides ?? {}).sort((a, b) => b[1].length - a[1].length);
  const q = `What does the evidence say about ${c.label.replace(/ · /g, " and ").toLowerCase()}? Why might studies disagree?`;
  return (
    <div>
      <div className="t-title3 mb-1">{c.label}</div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tag tone={c.status === "contradictory" ? "red" : c.status === "consensus" ? "green" : "purple"}>{INFO[c.status].label}</Tag>
        <StrengthBadge s={c.strength} />
        <span className="t-foot text-label-2">{c.n_papers} papers · {Math.round(c.agreement * 100)}% agree on direction</span>
      </div>
      <div className="bg-bg-2 rounded-2xl p-4 mb-4"><VoteBar votes={c.votes} height={12} /></div>

      {(c.timeline?.length ?? 0) > 1 && (
        <div className="bg-bg-2 rounded-2xl p-4 mb-4">
          <div className="t-foot font-semibold text-label-2 mb-2">How the evidence accumulated</div>
          <div className="space-y-1">
            {c.timeline!.map(({ year, ...votes }) => {
              const n = Object.values(votes).reduce((a, b) => a + (b ?? 0), 0);
              return (
                <div key={year} className="flex items-center gap-2">
                  <span className="w-9 t-cap text-label-2 tabular-nums">{year}</span>
                  <div className="flex-1" style={{ maxWidth: `${Math.max(12, (100 * n) / c.n_papers)}%` }}>
                    <VoteBar votes={votes as Record<string, number>} height={8} legend={false} />
                  </div>
                  <span className="t-cap2 text-label-2 tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
          <div className="t-cap2 text-label-3 mt-2">Cumulative reports per direction by publication year.</div>
        </div>
      )}

      {c.explanations.length > 0 && (
        <div className="bg-bg-2 rounded-2xl p-4 mb-5">
          <div className="t-headline mb-2 flex items-center gap-2"><span className="text-orange"><Icon name="info" size={18} /></span>Possible reasons for disagreement</div>
          <ul className="list-disc pl-5 t-sub space-y-1">{c.explanations.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <Link href={`/ask?q=${encodeURIComponent(q)}`} className="flex-1 h-11 rounded-xl bg-tint text-white t-headline grid place-items-center btn-press">Ask about this</Link>
        <Link href={`/graph?focus=${encodeURIComponent(c.outcome)}&lit=${encodeURIComponent([c.condition, c.outcome, c.geometry].filter(Boolean).join(","))}`}
          className="h-11 px-4 rounded-xl bg-fill text-tint t-headline grid place-items-center btn-press">Graph</Link>
      </div>

      {sides.map(([dir, items]) => (
        <div key={dir} className="mb-6">
          <div className="section-header flex items-center gap-2"><DirectionGlyph d={dir} /><span>· {items.length} report{items.length > 1 ? "s" : ""}</span></div>
          <div className="space-y-2">
            {items.map((s) => (
              <Link key={s.paper_id + s.quote.slice(0, 20)} href={`/papers/${s.paper_id}`} className="block bg-bg-2 rounded-2xl p-3.5 pressable">
                <Quote>{s.quote}</Quote>
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <StudyTag type={s.study_type} />
                  {s.fuel && <Tag>{label(s.fuel)}</Tag>}
                  {s.duration_seconds != null && <Tag>{s.duration_seconds < 120 ? `${s.duration_seconds} s` : `${Math.round(s.duration_seconds / 60)} min`} freefall</Tag>}
                  <span className="t-cap text-label-2">{s.year}</span>
                </div>
                <div className="t-cap text-label-2 mt-1.5 line-clamp-1">{s.title}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
      <p className="t-cap text-label-2">Directions: {Object.entries(DIRECTION_LABEL).map(([, v]) => v).join(" / ")} relative to normal gravity or the stated baseline, as reported in each study.</p>
    </div>
  );
}

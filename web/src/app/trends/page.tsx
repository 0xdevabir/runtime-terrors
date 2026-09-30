"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Columns, Legend, LineChart } from "@/components/charts";
import { DirectionGlyph, ErrorNote, Page, Quote, Section, Segmented, Skeleton, StudyTag } from "@/components/ui";
import { Novelty, STUDY_TYPE_LABEL } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type TSeries = { key: string; label: string; total: number; counts: number[] };
type Trends = { years: number[]; per_year: number[]; series: Record<string, TSeries[]>; study_type: Record<string, number[]>; novelty?: Novelty[] };
type Dim = "condition" | "fuel_group" | "geometry";

const DIMS: { value: Dim; label: string }[] = [
  { value: "condition", label: "Conditions" }, { value: "fuel_group", label: "Fuels" }, { value: "geometry", label: "Geometries" },
];
const MAX_SERIES = 6;
const ST_ORDER = ["flight", "both", "short_ug", "ground", "computational", "review"];

export default function TrendsPage() {
  const { data, error } = useApi<Trends>("/trends");
  const [dim, setDim] = useState<Dim>("condition");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"count" | "cum">("count");

  // colour follows the entity: slot fixed by rank in the full list, never re-assigned when toggled
  const all = useMemo(() => (data?.series[dim] ?? []).slice(0, MAX_SERIES).map((s, i) => ({
    ...s, color: `var(--series-${i + 1})`,
    counts: mode === "cum" ? s.counts.reduce<number[]>((a, v) => [...a, (a.at(-1) ?? 0) + v], []) : s.counts,
  })), [data, dim, mode]);
  const shown = all.filter((s) => !hidden.has(s.key));
  const toggle = (k: string) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const growth = useMemo(() => {
    if (!data) return [];
    const half = Math.floor(data.years.length / 2);
    return (data.series[dim] ?? []).filter((s) => s.total >= 8).map((s) => {
      const early = s.counts.slice(0, half).reduce((a, b) => a + b, 0), late = s.counts.slice(half).reduce((a, b) => a + b, 0);
      return { ...s, early, late, share: late / (early + late) };
    }).sort((a, b) => b.share - a.share);
  }, [data, dim]);

  return (
    <Page wide title="Research Trends" subtitle="How the focus of microgravity combustion and fire-safety research has shifted over time.">
      {error ? <ErrorNote error={error} /> : !data ? <Skeleton h={360} /> : (
        <>
          <div className="grid lg:grid-cols-3 gap-4 mb-8">
            <div className="bg-bg-2 rounded-2xl p-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <div className="t-headline">Reports per year by {DIMS.find((d) => d.value === dim)!.label.toLowerCase()}</div>
                  <div className="t-foot text-label-2">Top {MAX_SERIES} by total · tap legend to hide</div>
                </div>
                <div className="flex gap-2">
                  <Segmented size="sm" className="w-[260px]" value={dim} onChange={(v) => { setDim(v); setHidden(new Set()); }} options={DIMS} />
                  <Segmented size="sm" className="w-[150px]" value={mode} onChange={setMode} options={[{ value: "count", label: "Yearly" }, { value: "cum", label: "Cumulative" }]} />
                </div>
              </div>
              <div className="mb-3"><Legend items={all} onToggle={toggle} hidden={hidden} /></div>
              {shown.length ? <LineChart years={data.years} series={shown} height={300} /> : <div className="h-[300px] grid place-items-center t-sub text-label-2">All series hidden</div>}
              {data.years.at(-1)! >= 2025 && <div className="t-cap text-label-2 mt-2">The final year is partial — the corpus snapshot ends mid-year.</div>}
            </div>
            <div className="bg-bg-2 rounded-2xl p-4">
              <div className="t-headline">All reports</div>
              <div className="t-foot text-label-2 mb-4">{data.per_year.reduce((a, b) => a + b, 0)} reports, {data.years[0]}–{data.years.at(-1)}</div>
              <Columns labels={data.years.map((y) => `'${String(y).slice(2)}`)} values={data.per_year} height={220} />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-x-6">
            <Section header="Study design over time" footer="Share of each year's reports. Orbital flight = burns on the Shuttle, ISS or Cygnus; drop tower / parabolic = seconds of freefall.">
              <div className="row block">
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                  {ST_ORDER.map((k, i) => <span key={k} className="inline-flex items-center gap-1.5 t-foot text-label-2"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: `var(--series-${i + 1})` }} />{STUDY_TYPE_LABEL[k]}</span>)}
                </div>
                <div className="space-y-[2px]">
                  {data.years.map((y, yi) => {
                    const tot = ST_ORDER.reduce((s, k) => s + (data.study_type[k]?.[yi] ?? 0), 0) || 1;
                    return (
                      <div key={y} className="flex items-center gap-2">
                        <span className="w-9 t-cap text-label-2 tabular-nums">{y}</span>
                        <div className="flex-1 flex gap-[2px] h-[14px]" title={ST_ORDER.map((k) => `${STUDY_TYPE_LABEL[k]} ${data.study_type[k]?.[yi] ?? 0}`).join(" · ")}>
                          {ST_ORDER.map((k, i) => {
                            const v = data.study_type[k]?.[yi] ?? 0;
                            return v ? <div key={k} className="first:rounded-l-[4px] last:rounded-r-[4px]" style={{ width: `${(v / tot) * 100}%`, background: `var(--series-${i + 1})` }} /> : null;
                          })}
                        </div>
                        <span className="w-7 text-right t-cap text-label-2 tabular-nums">{tot}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Section>

            <Section header="Rising and fading topics" footer={`Share of each topic's papers published in ${data.years[Math.floor(data.years.length / 2)]} or later.`}>
              {growth.slice(0, 10).map((g) => (
                <div key={g.key} className="row">
                  <div className="flex-1 min-w-0">
                    <div className="t-sub truncate">{g.label}</div>
                    <div className="t-cap text-label-2 tabular-nums">{g.early} → {g.late} papers</div>
                  </div>
                  <div className="w-[120px] h-[6px] rounded-full bg-fill overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${g.share * 100}%`, background: g.share >= 0.6 ? "var(--series-1)" : "var(--label-3)" }} />
                  </div>
                  <span className="w-10 text-right t-foot tabular-nums font-medium">{Math.round(g.share * 100)}%</span>
                </div>
              ))}
            </Section>
          </div>

          {(data.novelty?.length ?? 0) > 0 && (
            <Section header="New findings that challenge the consensus"
              footer="Recent reports finding the opposite direction to an established majority. Worth a closer look: a new fuel, longer freefall time or better diagnostics can overturn older results.">
              {data.novelty!.slice(0, 10).map((n) => (
                <Link key={n.paper_id + n.consensus_id} href={`/insights?id=${encodeURIComponent(n.consensus_id)}`} className="row pressable block">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="t-sub font-medium">{n.consensus_id.split("|").map((x) => x.split(":")[1]?.replace(/_/g, " ")).filter(Boolean).join(" · ")}</span>
                    <span className="t-cap text-label-2 inline-flex items-center gap-1">majority of {n.n_papers} papers: <DirectionGlyph d={n.majority} /> · this paper: <DirectionGlyph d={n.direction} /></span>
                  </div>
                  <Quote>{n.quote}</Quote>
                  <div className="flex items-center gap-2 mt-1.5 t-cap text-label-2"><StudyTag type={n.study_type} />{n.year} · <span className="line-clamp-1">{n.title}</span></div>
                </Link>
              ))}
            </Section>
          )}
        </>
      )}
    </Page>
  );
}


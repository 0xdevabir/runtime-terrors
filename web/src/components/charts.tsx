"use client";
/* Hand-built SVG/HTML charts following the data-viz method:
   thin marks, 2px surface gaps, 4px rounded data-ends, recessive axes,
   legends for >=2 series, text in ink tokens (never series colour), hover tooltips. */
import { useMemo, useRef, useState } from "react";

export const DIR_COLOR: Record<string, string> = {
  decrease: "var(--series-1)", increase: "var(--series-8)", mixed: "var(--series-4)", no_change: "var(--label-3)",
};
const DIR_ORDER = ["decrease", "increase", "mixed", "no_change"];
const DIR_TEXT: Record<string, string> = { decrease: "Decrease", increase: "Increase", mixed: "Mixed", no_change: "No change" };

/* ---------------------------------------------------------- stacked vote bar */
export function VoteBar({ votes, height = 10, legend = true }: { votes: Record<string, number>; height?: number; legend?: boolean }) {
  const total = Object.values(votes).reduce((a, b) => a + b, 0) || 1;
  const parts = DIR_ORDER.filter((k) => votes[k]);
  return (
    <div>
      <div className="flex w-full gap-[2px]" style={{ height }} role="img"
        aria-label={parts.map((k) => `${DIR_TEXT[k]} ${votes[k]}`).join(", ")}>
        {parts.map((k, i) => (
          <div key={k} title={`${DIR_TEXT[k]}: ${votes[k]} paper${votes[k] > 1 ? "s" : ""}`}
            style={{ width: `${(votes[k] / total) * 100}%`, background: DIR_COLOR[k],
              borderRadius: `${i === 0 ? 4 : 0}px ${i === parts.length - 1 ? 4 : 0}px ${i === parts.length - 1 ? 4 : 0}px ${i === 0 ? 4 : 0}px` }} />
        ))}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {parts.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 t-cap text-label-2">
              <span className="w-2 h-2 rounded-[2px]" style={{ background: DIR_COLOR[k] }} />{DIR_TEXT[k]} <b className="text-label font-semibold tabular-nums">{votes[k]}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- horizontal meter */
export function Meter({ value, color = "var(--series-1)", height = 6, label }: { value: number; color?: string; height?: number; label?: string }) {
  return (
    <div className="w-full rounded-full bg-fill overflow-hidden" style={{ height }} role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(2, value * 100)}%`, background: color }} />
    </div>
  );
}

/* ---------------------------------------------------------- multi-line chart */
export type Series = { key: string; label: string; counts: number[]; color: string };

export function LineChart({ years, series, height = 260, yLabel = "papers" }: { years: number[]; series: Series[]; height?: number; yLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, m = { t: 12, r: 96, b: 26, l: 34 };
  const max = Math.max(1, ...series.flatMap((s) => s.counts));
  const step = niceStep(max);
  const yMax = Math.ceil(max / step) * step;
  const x = (i: number) => m.l + (i / Math.max(1, years.length - 1)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - v / yMax) * (H - m.t - m.b);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, i) => i * step);

  // direct end labels, nudged apart to avoid collisions
  const ends = useMemo(() => {
    const e = series.map((s) => ({ key: s.key, label: s.label, y: y(s.counts[s.counts.length - 1] ?? 0) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < e.length; i++) if (e[i].y - e[i - 1].y < 13) e[i].y = e[i - 1].y + 13;
    return e;
  }, [series, yMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - m.l) / (W - m.l - m.r)) * (years.length - 1));
    setHover(i >= 0 && i < years.length ? i : null);
  };

  return (
    <div ref={ref} className="relative select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={`Line chart of ${yLabel} per year`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
            <text x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--label-2)" className="tabular-nums">{t}</text>
          </g>
        ))}
        {years.map((yr, i) => (i % Math.ceil(years.length / 8) === 0 || i === years.length - 1) && (
          <text key={yr} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--label-2)" className="tabular-nums">{yr}</text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <path d={s.counts.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(s.counts.length - 1)} cy={y(s.counts[s.counts.length - 1] ?? 0)} r={4} fill={s.color} stroke="var(--viz-surface)" strokeWidth={2} />
          </g>
        ))}
        {series.length <= 4 && ends.map((e) => (
          <text key={e.key} x={W - m.r + 8} y={e.y} dy="0.32em" fontSize="11" fill="var(--label-2)">{e.label.length > 15 ? e.label.slice(0, 14) + "…" : e.label}</text>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke="var(--viz-axis)" strokeWidth={1} />
            {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(s.counts[hover])} r={4} fill={s.color} stroke="var(--viz-surface)" strokeWidth={2} />)}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="absolute top-2 pointer-events-none bg-bg-2 rounded-xl shadow-[var(--shadow)] px-3 py-2 t-foot min-w-[160px] z-10 border border-sep"
          style={{ left: `${Math.min(70, (x(hover) / W) * 100 + 2)}%` }}>
          <div className="font-semibold mb-1 tabular-nums">{years[hover]}</div>
          {[...series].sort((a, b) => b.counts[hover] - a.counts[hover]).map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className="w-2.5 h-[2px] rounded" style={{ background: s.color }} />
              <span className="flex-1 text-label-2 truncate max-w-[150px]">{s.label}</span>
              <span className="tabular-nums font-medium">{s.counts[hover]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ items, onToggle, hidden }: { items: { key: string; label: string; color: string }[]; onToggle?: (k: string) => void; hidden?: Set<string> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <button key={it.key} onClick={() => onToggle?.(it.key)} disabled={!onToggle}
          className={`inline-flex items-center gap-1.5 t-foot ${hidden?.has(it.key) ? "text-label-3" : "text-label-2"}`}>
          <span className="w-3 h-[3px] rounded-full" style={{ background: hidden?.has(it.key) ? "var(--fill-2)" : it.color }} />
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------- column chart (single series) */
export function Columns({ labels, values, color = "var(--series-1)", height = 160, format = (v: number) => String(v) }: {
  labels: (string | number)[]; values: number[]; color?: string; height?: number; format?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...values);
  const peak = values.indexOf(max);
  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {values.map((v, i) => (
          <div key={i} className="flex-1 h-full flex flex-col justify-end items-center min-w-0 cursor-default"
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            {(i === peak || i === hover) && <div className="t-cap2 text-label-2 mb-1 tabular-nums">{format(v)}</div>}
            <div className="w-full max-w-[24px] rounded-t-[4px] transition-opacity" style={{ height: `${(v / max) * 82}%`, minHeight: v ? 2 : 0, background: color, opacity: hover == null || hover === i ? 1 : 0.55 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1.5 border-t border-[var(--viz-axis)] pt-1">
        {labels.map((l, i) => (
          <div key={i} className="flex-1 text-center t-cap2 text-label-2 tabular-nums min-w-0">
            {labels.length > 10 && i % 3 !== 0 && i !== labels.length - 1 ? "" : l}
          </div>
        ))}
      </div>
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

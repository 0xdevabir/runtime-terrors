"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorNote, Page, Quote, Section, Skeleton, Tag } from "@/components/ui";
import { api } from "@/lib/api";

type PredictMeta = {
  model: {
    type: string;
    n_train: number;
    cv_accuracy: number;
    features: string[];
    classes: string[];
    materials: string[];
  };
  ranges: Record<string, { min: number; max: number }>;
  material_labels: Record<string, string>;
  class_labels: Record<string, string>;
  regime_counts: Record<string, number>;
  measured_o2_rows: number;
};

type Nearest = {
  report_id: string;
  title: string;
  year: number | string | null;
  oxygen_pct: number;
  pressure_kpa: number;
  flow_cm_s: number;
  material: string;
  outcome: string;
  direction: string;
  study_type: string;
  quote: string;
  source_url: string;
  o2_source: string;
};

type PredictOut = {
  inputs: { oxygen_pct: number; pressure_kpa: number; flow_cm_s: number; material: string };
  in_training_range: boolean;
  out_of_range_reasons: string[];
  prediction: string | null;
  probabilities: Record<string, number> | null;
  model: { type: string; n_train: number; cv_accuracy: number; features: string[] };
  nearest_experiments: Nearest[];
  explanation: string;
};

type Sweep = {
  points: {
    oxygen_pct: number;
    in_training_range: boolean;
    prediction: string | null;
    probabilities: Record<string, number> | null;
  }[];
};

const REGIME_COLOR: Record<string, string> = {
  no_spread: "var(--status-good)",
  marginal_spread: "var(--status-warning)",
  spread: "var(--status-critical)",
};

const DEFAULTS = {
  oxygen_pct: 21,
  pressure_kpa: 101.3,
  flow_cm_s: 5,
  material: "fuel:pmma",
};

export default function ExplorerPage() {
  const [meta, setMeta] = useState<PredictMeta | null>(null);
  const [metaErr, setMetaErr] = useState<unknown>(null);
  const [inputs, setInputs] = useState(DEFAULTS);
  const [pred, setPred] = useState<PredictOut | null>(null);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const [error, setError] = useState<unknown>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api<PredictMeta>("/predict/meta").then(setMeta).catch(setMetaErr);
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setError(null);
      api<PredictOut>("/predict", { method: "POST", body: JSON.stringify(inputs) })
        .then(setPred)
        .catch(setError);
      const qs = new URLSearchParams({
        material: inputs.material,
        pressure_kpa: String(inputs.pressure_kpa),
        flow_cm_s: String(inputs.flow_cm_s),
        o2_min: "15",
        o2_max: "40",
      });
      api<Sweep>(`/predict/sweep?${qs}`).then(setSweep).catch(() => setSweep(null));
    }, 180);
    return () => clearTimeout(timer.current);
  }, [inputs]);

  const materials = useMemo(() => {
    if (!meta) return [];
    return meta.model.materials.map((id) => ({ id, label: meta.material_labels[id] ?? id }));
  }, [meta]);

  const set = <K extends keyof typeof DEFAULTS>(k: K, v: (typeof DEFAULTS)[K]) =>
    setInputs((p) => ({ ...p, [k]: v }));

  const demoLowO2 = () => setInputs((p) => ({ ...p, oxygen_pct: 17, pressure_kpa: 101.3, flow_cm_s: 5, material: "fuel:pmma" }));
  const demoCabin = () => setInputs((p) => ({ ...p, oxygen_pct: 21, pressure_kpa: 101.3, flow_cm_s: 5, material: "fuel:pmma" }));
  const demoArtemis = () => setInputs((p) => ({ ...p, oxygen_pct: 34, pressure_kpa: 56.5, flow_cm_s: 5, material: "fuel:fabric" }));

  return (
    <Page
      title="Flammability Explorer"
      subtitle="Slide cabin conditions. A model trained on published microgravity tests predicts the flame-spread regime and cites the nearest NTRS experiments."
      trailing={
        meta ? (
          <span className="t-foot text-label-2 tabular-nums hidden sm:inline">
            CV {Math.round(meta.model.cv_accuracy * 100)}% · n={meta.model.n_train}
          </span>
        ) : null
      }
    >
      {metaErr ? <ErrorNote error={metaErr} /> : !meta ? <Skeleton h={320} /> : (
        <>
          <Section
            header="Cabin conditions"
            footer="Killer demo: drag oxygen from 21% → 17% and watch the regime and nearest experiments update. Out-of-envelope inputs are refused — fire-safety tools must not extrapolate silently."
          >
            <div className="flex flex-wrap gap-2 mb-3">
              <button type="button" onClick={demoCabin} className="px-3 h-8 rounded-full bg-fill t-foot font-medium btn-press">21% O₂ cabin</button>
              <button type="button" onClick={demoLowO2} className="px-3 h-8 rounded-full bg-fill t-foot font-medium btn-press">17% O₂ boundary</button>
              <button type="button" onClick={demoArtemis} className="px-3 h-8 rounded-full bg-fill t-foot font-medium btn-press">Artemis 34% / 56.5 kPa</button>
            </div>

            <label className="block mb-4">
              <div className="flex justify-between t-body mb-2">
                <span>Cabin oxygen</span>
                <span className="tabular-nums text-label-2">{inputs.oxygen_pct}% O₂</span>
              </div>
              <input type="range" className="w-full accent-[var(--tint)]" min={15} max={40} step={0.5}
                value={inputs.oxygen_pct} onChange={(e) => set("oxygen_pct", +e.target.value)} />
            </label>
            <label className="block mb-4">
              <div className="flex justify-between t-body mb-2">
                <span>Cabin pressure</span>
                <span className="tabular-nums text-label-2">{inputs.pressure_kpa} kPa · {(inputs.pressure_kpa / 6.895).toFixed(1)} psia</span>
              </div>
              <input type="range" className="w-full accent-[var(--tint)]" min={40} max={120} step={0.5}
                value={inputs.pressure_kpa} onChange={(e) => set("pressure_kpa", +e.target.value)} />
            </label>
            <label className="block mb-4">
              <div className="flex justify-between t-body mb-2">
                <span>Forced flow</span>
                <span className="tabular-nums text-label-2">{inputs.flow_cm_s} cm/s</span>
              </div>
              <input type="range" className="w-full accent-[var(--tint)]" min={0} max={30} step={0.5}
                value={inputs.flow_cm_s} onChange={(e) => set("flow_cm_s", +e.target.value)} />
            </label>
            <label className="block">
              <div className="t-body mb-2">Material</div>
              <select
                className="w-full h-11 rounded-2xl bg-bg-2 ring-[0.5px] ring-sep px-3 t-body"
                value={inputs.material}
                onChange={(e) => set("material", e.target.value)}
              >
                {materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </Section>

          {error ? <ErrorNote error={error} /> : !pred ? <Skeleton h={200} /> : (
            <Section header="Prediction">
              {!pred.in_training_range ? (
                <div className="rounded-2xl p-4 bg-[color-mix(in_oklab,var(--status-critical)_12%,transparent)] ring-[0.5px] ring-[color-mix(in_oklab,var(--status-critical)_35%,transparent)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--status-critical)]">
                    <Icon name="warn" size={18} /> Outside published envelope — no prediction
                  </div>
                  <ul className="mt-2 space-y-1 t-body text-label-2">
                    {pred.out_of_range_reasons.map((r) => <li key={r}>· {r}</li>)}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <div>
                      <div className="t-foot uppercase tracking-wide text-label-2 font-semibold">Predicted regime</div>
                      <div className="text-[28px] font-bold leading-tight" style={{ color: REGIME_COLOR[pred.prediction ?? ""] }}>
                        {(meta.class_labels[pred.prediction ?? ""] ?? pred.prediction)?.replaceAll("_", " ")}
                      </div>
                    </div>
                    <Tag>{pred.model.type} · CV {Math.round(pred.model.cv_accuracy * 100)}%</Tag>
                  </div>
                  <div className="space-y-2 mb-4">
                    {(["no_spread", "marginal_spread", "spread"] as const).map((k) => {
                      const v = pred.probabilities?.[k] ?? 0;
                      return (
                        <div key={k}>
                          <div className="flex justify-between t-foot mb-1">
                            <span>{meta.class_labels[k] ?? k}</span>
                            <span className="tabular-nums">{Math.round(v * 100)}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-fill overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${v * 100}%`, background: REGIME_COLOR[k] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              <p className="t-body text-label-2">{pred.explanation}</p>
            </Section>
          )}

          {sweep && (
            <Section header="Oxygen sweep" footer="Probability of each regime as cabin O₂ changes, holding pressure, flow and material fixed. Vertical mark = your current slider.">
              <OxygenSweepChart sweep={sweep} current={inputs.oxygen_pct} labels={meta.class_labels} />
            </Section>
          )}

          {pred && (
            <Section header="Nearest published experiments" footer="Feature-space neighbours from the extracted NTRS experiment table. Click through to the report.">
              <div className="space-y-3">
                {pred.nearest_experiments.map((n) => (
                  <div key={n.report_id + n.quote.slice(0, 24)} className="rounded-2xl p-4 bg-bg-2 ring-[0.5px] ring-sep">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/papers?q=${encodeURIComponent(n.report_id)}`} className="t-sub font-semibold hover:text-tint">
                          {n.title || `NTRS ${n.report_id}`}
                        </Link>
                        <div className="t-foot text-label-2 mt-1 tabular-nums">
                          NTRS {n.report_id} · {n.year ?? "—"} · {n.oxygen_pct}% O₂ · {n.pressure_kpa} kPa · {n.outcome.replaceAll("_", " ")}
                          {n.o2_source === "imputed" ? " · O₂ imputed from condition" : ""}
                        </div>
                      </div>
                      <a href={n.source_url} target="_blank" rel="noreferrer" className="shrink-0 text-tint" aria-label="Open on NTRS">
                        <Icon name="arrowUpRight" size={18} />
                      </a>
                    </div>
                    {n.quote && <div className="mt-3"><Quote>{n.quote}</Quote></div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section header="Model card">
            <div className="grid sm:grid-cols-3 gap-3 t-body">
              <Stat label="Training rows" value={String(meta.model.n_train)} />
              <Stat label="Measured O₂ rows" value={String(meta.measured_o2_rows)} />
              <Stat label="Cross-val accuracy" value={`${Math.round(meta.model.cv_accuracy * 100)}%`} />
            </div>
            <p className="t-foot text-label-2 mt-3">
              Features: {meta.model.features.join(", ")}. Regime labels are derived from quote-verified findings
              (spread / extinction / flammability directions) across the Emberfall NTRS corpus. Deterministic code
              computes the prediction; the explanation only narrates the returned object.
            </p>
          </Section>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-3 bg-bg-2 ring-[0.5px] ring-sep">
      <div className="t-foot text-label-2">{label}</div>
      <div className="text-[22px] font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function OxygenSweepChart({
  sweep, current, labels,
}: {
  sweep: Sweep;
  current: number;
  labels: Record<string, string>;
}) {
  const W = 640;
  const H = 220;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const pts = sweep.points.filter((p) => p.probabilities);
  if (!pts.length) return <div className="t-body text-label-2">No in-range points for this sweep.</div>;
  const x0 = Math.min(...pts.map((p) => p.oxygen_pct));
  const x1 = Math.max(...pts.map((p) => p.oxygen_pct));
  const x = (o2: number) => pad.l + ((o2 - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const series = (["no_spread", "marginal_spread", "spread"] as const).map((k) => ({
    key: k,
    color: REGIME_COLOR[k],
    d: pts.map((p, i) => `${i ? "L" : "M"}${x(p.oxygen_pct).toFixed(1)},${y(p.probabilities![k]).toFixed(1)}`).join(" "),
  }));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px] h-auto" role="img" aria-label="Oxygen sweep probabilities">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-[var(--label-2)]" fontSize={10}>{Math.round(v * 100)}%</text>
          </g>
        ))}
        {series.map((s) => (
          <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" />
        ))}
        <line x1={x(current)} x2={x(current)} y1={pad.t} y2={H - pad.b} stroke="var(--label)" strokeDasharray="4 3" strokeWidth={1.5} />
        <text x={x(current)} y={H - 8} textAnchor="middle" className="fill-[var(--label)]" fontSize={11}>{current}% O₂</text>
        <text x={pad.l} y={H - 8} className="fill-[var(--label-2)]" fontSize={10}>{x0}%</text>
        <text x={W - pad.r} y={H - 8} textAnchor="end" className="fill-[var(--label-2)]" fontSize={10}>{x1}%</text>
      </svg>
      <div className="flex flex-wrap gap-3 mt-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 t-foot text-label-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
            {labels[s.key] ?? s.key}
          </span>
        ))}
      </div>
    </div>
  );
}

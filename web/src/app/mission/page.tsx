"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Meter } from "@/components/charts";
import { Icon, IconName } from "@/components/Icon";
import { DirectionGlyph, ErrorNote, Page, Quote, Section, Segmented, Skeleton, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { api, Mission, MissionProfile, MissionRisk } from "@/lib/api";
import { useEntities } from "@/lib/entities";

type Preset = "iss" | "artemis" | "mars" | "custom";
const GRAD: Record<string, string> = {
  iss: "linear-gradient(145deg,#3e6b70,#2f3737)", artemis: "linear-gradient(145deg,#5a5f5c,#1b1b1b)",
  mars: "linear-gradient(145deg,#b5653a,#6e2f22)", custom: "linear-gradient(145deg,#5f7a57,#2f3737)",
};
const TIER: Record<MissionRisk["tier"], { label: string; color: string; icon: IconName }> = {
  high: { label: "High priority", color: "var(--status-critical)", icon: "warn" },
  medium: { label: "Medium priority", color: "var(--status-warning)", icon: "circle" },
  low: { label: "Lower priority", color: "var(--status-good)", icon: "checkCircle" },
};
const DEFAULT_CUSTOM: MissionProfile = {
  name: "Custom mission", destination: "Mars", duration_days: 500, microgravity_days: 300, partial_gravity_days: 200,
  o2_percent: 30, pressure_kpa: 70.3, comm_delay_min: 10, crew: 4,
};

export default function MissionPage() {
  return <Suspense><MissionView /></Suspense>;
}

function MissionView() {
  const sp = useSearchParams();
  const router = useRouter();
  const preset = (sp.get("preset") as Preset) || "mars";
  const [custom, setCustom] = useState<MissionProfile>(DEFAULT_CUSTOM);
  const [data, setData] = useState<Mission | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setError(null);
    if (preset !== "custom") {
      setData(null);
      api<Mission>(`/mission/${preset}`).then(setData).catch(setError);
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api<Mission>("/mission", { method: "POST", body: JSON.stringify(custom) }).then(setData).catch(setError);
    }, 250);
  }, [preset, custom]);

  const setP = (p: Preset) => router.replace(`/mission?preset=${p}`, { scroll: false });
  const prof = data?.profile;

  return (
    <Page title="Mission Briefing" subtitle="Fire risks for your mission, most urgent first."
      trailing={<button onClick={() => window.print()} className="flex items-center gap-1 t-body btn-press" aria-label="Export PDF"><Icon name="printer" size={20} /><span className="hidden sm:inline">PDF</span></button>}
      toolbar={<Segmented value={preset} onChange={setP} options={[{ value: "iss", label: "ISS" }, { value: "artemis", label: "Artemis" }, { value: "mars", label: "Mars" }, { value: "custom", label: "Custom" }]} />}>

      {preset === "custom" && <CustomEditor p={custom} onChange={setCustom} />}
      {error ? <ErrorNote error={error} /> : !data || !prof ? <div className="space-y-3"><Skeleton h={180} /><Skeleton h={80} /><Skeleton h={80} /></div> : (
        <>
          {/* Hero */}
          <div className="rounded-3xl p-5 text-white mb-6 print:!text-black print:border print:border-black/20" style={{ background: GRAD[preset] }}>
            <div className="flex items-center gap-2 opacity-90 t-foot font-semibold uppercase tracking-wide"><Icon name="rocket" size={16} />{prof.destination}</div>
            <div className="text-[28px] leading-tight font-bold mt-1">{prof.name}</div>
            {prof.blurb && <div className="t-sub opacity-90 mt-1 max-w-[600px]">{prof.blurb}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              {[
                [prof.duration_days, "days"], [`${data.atmosphere.o2_percent}%`, "cabin O₂"],
                [`${data.atmosphere.pressure_kpa} kPa`, `cabin pressure · ${data.atmosphere.pressure_psia} psia`], [prof.partial_gravity_days, "days partial g"],
              ].map(([v, l]) => (
                <div key={l as string} className="rounded-2xl bg-white/15 backdrop-blur px-3 py-2.5">
                  <div className="text-[22px] font-bold tabular-nums leading-none">{typeof v === "number" ? v.toLocaleString() : v}</div>
                  <div className="t-cap opacity-85 mt-1">{l}</div>
                </div>
              ))}
            </div>
          </div>

          <Section header="Briefing">
            <div className="row block t-body whitespace-pre-line">{data.summary}</div>
          </Section>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 t-foot text-label-2">
            {(Object.keys(TIER) as MissionRisk["tier"][]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span style={{ color: TIER[t].color }}><Icon name={TIER[t].icon} size={15} stroke={2.2} /></span>{TIER[t].label} · {data.risks.filter((r) => r.tier === t).length}
              </span>
            ))}
          </div>

          <div className="space-y-3 mb-8">
            {data.risks.map((r, i) => (
              <RiskCard key={r.id} r={r} rank={i + 1} open={open === r.id || undefined} onToggle={() => setOpen(open === r.id ? null : r.id)} />
            ))}
          </div>

          <Section header="How priority is computed" footer="Evidence comes only from the indexed NTRS reports. This is a research-prioritization aid, not a certified fire hazard analysis.">
            <div className="row block t-foot text-label-2 space-y-1.5">
              <p><b className="text-label">Relevance</b> = hazard severity × how much of the relevant conditions (freefall, partial gravity, elevated O₂, reduced pressure) this mission involves.</p>
              <p><b className="text-label">Uncertainty</b> falls as evidence gets stronger, tests real spacecraft materials, and comes from orbital burns rather than drop-tower or 1g tests.</p>
              <p><b className="text-label">Priority</b> = relevance × (½ + ½ × uncertainty) — high-exposure risks with weak evidence rise to the top.</p>
            </div>
          </Section>
        </>
      )}
    </Page>
  );
}

function RiskCard({ r, rank, open, onToggle }: { r: MissionRisk; rank: number; open?: boolean; onToggle: () => void }) {
  const t = TIER[r.tier];
  const { label } = useEntities();
  return (
    <div className="bg-bg-2 rounded-2xl overflow-hidden print:break-inside-avoid">
      <button onClick={onToggle} className="w-full text-left p-4 pressable">
        <div className="flex items-start gap-3">
          <span className="t-title3 tabular-nums text-label-3 w-6 shrink-0">{rank}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="t-headline">{r.name}</div>
              <span className="inline-flex items-center gap-1 t-foot font-medium text-label-2">
                <span style={{ color: t.color }}><Icon name={t.icon} size={15} stroke={2.2} /></span>{t.label}
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-x-4 gap-y-2 mt-3">
              <Metric label="Priority" v={r.priority} color="var(--series-1)" />
              <Metric label="Exposure" v={r.exposure} color="var(--series-7)" />
              <Metric label="Evidence uncertainty" v={r.uncertainty} color="var(--series-4)" />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 t-foot text-label-2">
              <StrengthBadge s={r.evidence.strength} />
              <span>{r.evidence.n_papers} reports · {r.evidence.n_flight} orbital · {r.evidence.n_material} spacecraft materials</span>
              {r.contradictions.length > 0 && <span className="inline-flex items-center gap-1"><Icon name="split" size={13} />{r.contradictions.length} conflicts</span>}
              {r.readiness && (
                <span className="inline-flex items-center gap-1.5" title="Evidence readiness: transparent checklist, not a NASA readiness level">
                  <span className="flex gap-[2px]">{Array.from({ length: r.readiness.of }, (_, i) => (
                    <span key={i} className="w-2 h-2 rounded-[2px]" style={{ background: i < r.readiness!.level ? "var(--green)" : "var(--fill-2)" }} />
                  ))}</span>
                  Evidence readiness: {r.readiness.label}
                </span>
              )}
            </div>
          </div>
          <Icon name="chevronDown" size={14} stroke={2.4} className={`text-label-3 mt-1.5 transition-transform no-print ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      <div className={`px-4 pb-4 pl-[52px] ${open ? "anim-fade" : "hidden print:block"}`}>
        {r.readiness && (
          <>
            <div className="t-foot font-semibold text-label-2 uppercase mb-2">Evidence readiness for this mission · {r.readiness.level}/{r.readiness.of}</div>
            <ul className="space-y-1 mb-4">
              {r.readiness.checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 t-sub">
                  <span className={`mt-0.5 ${c.ok ? "text-green" : "text-orange"}`}><Icon name={c.ok ? "checkCircle" : "warn"} size={15} stroke={2.2} /></span>
                  <span><span className="font-medium">{c.label}</span> <span className="text-label-2">· {c.detail}</span></span>
                </li>
              ))}
            </ul>
          </>
        )}
        {r.key_findings.length > 0 && (
          <>
            <div className="t-foot font-semibold text-label-2 uppercase mb-2">Key evidence</div>
            <div className="space-y-2.5 mb-4">
              {r.key_findings.slice(0, 4).map((f) => (
                <Link key={f.id} href={`/papers/${f.paper_id}`} className="block rounded-xl bg-fill p-3 pressable">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <DirectionGlyph d={f.direction} /><StudyTag type={f.study_type} />
                    <span className="t-cap text-label-2">{[f.labels.outcome, f.labels.fuel, f.year].filter(Boolean).join(" · ")}</span>
                  </div>
                  <Quote>{f.evidence_quote}</Quote>
                </Link>
              ))}
            </div>
          </>
        )}
        {r.countermeasures.length > 0 && (
          <>
            <div className="t-foot font-semibold text-label-2 uppercase mb-2">Countermeasures studied</div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {r.countermeasures.map((c) => (
                <Tag key={c.id} tone={c.effective > c.ineffective ? "green" : c.ineffective ? "orange" : "gray"}>
                  {c.label} · {c.effective}✓{c.ineffective ? ` ${c.ineffective}✗` : ""}
                </Tag>
              ))}
            </div>
          </>
        )}
        {r.contradictions.length > 0 && (
          <>
            <div className="t-foot font-semibold text-label-2 uppercase mb-2">Conflicting evidence</div>
            <div className="flex flex-col gap-1 mb-4">
              {r.contradictions.map((c) => <Link key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} className="t-sub text-tint">{c.label}</Link>)}
            </div>
          </>
        )}
        {r.gaps.length > 0 && (
          <>
            <div className="t-foot font-semibold text-label-2 uppercase mb-2">Knowledge gaps</div>
            <ul className="list-disc pl-5 t-sub space-y-1 mb-4">{r.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          </>
        )}
        {Object.keys(r.evidence.by_condition).length > 0 && (
          <div className="t-cap text-label-2">Evidence by condition: {Object.entries(r.evidence.by_condition).map(([k, v]) => `${label(k)} ${v}`).join(" · ")}</div>
        )}
        <Link href={`/ask?q=${encodeURIComponent(`What are the main findings about ${r.name.toLowerCase()} in microgravity and which countermeasures work?`)}`}
          className="no-print inline-flex items-center gap-1.5 h-9 px-4 mt-4 rounded-full bg-tint text-on-tint t-sub font-semibold btn-press">
          <Icon name="sparkles" size={15} />Ask about this risk
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, v, color }: { label: string; v: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between t-cap text-label-2 mb-1"><span>{label}</span><span className="tabular-nums text-label font-semibold">{Math.round(v * 100)}</span></div>
      <Meter value={v} color={color} label={label} />
    </div>
  );
}

function CustomEditor({ p, onChange }: { p: MissionProfile; onChange: (p: MissionProfile) => void }) {
  const set = <K extends keyof MissionProfile>(k: K, v: MissionProfile[K]) => {
    const n = { ...p, [k]: v };
    if (k === "duration_days" || k === "partial_gravity_days") n.microgravity_days = Math.max(0, n.duration_days - n.partial_gravity_days);
    if (n.partial_gravity_days > n.duration_days) { n.partial_gravity_days = n.duration_days; n.microgravity_days = 0; }
    onChange(n);
  };
  const sliders: { k: keyof MissionProfile; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
    { k: "duration_days", label: "Duration", min: 7, max: 1200, step: 1, fmt: (v) => `${v} days` },
    { k: "partial_gravity_days", label: "Time on a surface (partial g)", min: 0, max: p.duration_days, step: 1, fmt: (v) => `${v} days` },
    { k: "o2_percent", label: "Cabin oxygen", min: 15, max: 40, step: 0.5, fmt: (v) => `${v}% O₂` },
    { k: "pressure_kpa", label: "Cabin pressure", min: 50, max: 105, step: 0.5, fmt: (v) => `${v} kPa · ${(v / 6.895).toFixed(1)} psia` },
    { k: "comm_delay_min", label: "One-way communication delay", min: 0, max: 24, step: 0.5, fmt: (v) => `${v} min` },
  ];
  return (
    <Section header="Mission profile" footer={`Microgravity time is the remainder: ${p.microgravity_days} days. Reference: ISS 21% O₂ at 101.3 kPa (14.7 psia); Artemis exploration atmosphere 34% O₂ at 56.5 kPa (8.2 psia).`}>
      <div className="row">
        <span className="flex-1 t-body">Destination</span>
        <Segmented size="sm" className="w-[168px] sm:w-[220px] shrink-0" value={p.destination} onChange={(v) => set("destination", v)} options={["LEO", "Moon", "Mars"].map((d) => ({ value: d, label: d }))} />
      </div>
      {sliders.map((s) => (
        <label key={s.k} className="row block">
          <div className="flex justify-between t-body mb-2"><span>{s.label}</span><span className="text-label-2 tabular-nums">{s.fmt(p[s.k] as number)}</span></div>
          <input type="range" className="w-full accent-[var(--tint)]" min={s.min} max={s.max} step={s.step} value={p[s.k] as number}
            onChange={(e) => set(s.k, +e.target.value as never)} />
        </label>
      ))}
    </Section>
  );
}

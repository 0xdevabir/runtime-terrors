"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { NAV } from "@/components/Shell";
import { PERSONAS, usePrefs } from "@/components/prefs";
import { ErrorNote, Page, Row, Section, Segmented, Skeleton, Stat, Tag } from "@/components/ui";
import { Stats } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const SUGGESTED: Record<string, string[]> = {
  scientist: [
    "How does spaceflight affect bone density in mice?",
    "What gene expression changes occur in Arabidopsis roots in microgravity?",
    "Does simulated microgravity increase bacterial virulence?",
    "How does space radiation damage the central nervous system?",
  ],
  manager: [
    "Where is the evidence on muscle atrophy countermeasures weakest?",
    "What do we know about immune dysregulation during spaceflight?",
    "Which spaceflight effects on the heart are well established?",
    "How strong is the evidence on radiation and cancer risk?",
  ],
  architect: [
    "What countermeasures protect bone during long-duration missions?",
    "What are the risks of space radiation for a Mars mission crew?",
    "How does partial gravity affect the musculoskeletal system?",
    "Can crops be grown reliably in spaceflight conditions?",
  ],
};

export default function Home() {
  const { persona, setPersona } = usePrefs();
  const { data: s, error } = useApi<Stats>("/stats");
  const [q, setQ] = useState("");
  const router = useRouter();
  const go = (text: string) => text.trim() && router.push(`/ask?q=${encodeURIComponent(text.trim())}`);
  const p = PERSONAS.find((x) => x.id === persona)!;

  return (
    <Page title="Space Biology" subtitle={<>A knowledge engine over {s ? s.papers : "600+"} NASA-funded space biology publications — ask, explore, and see where the evidence is strong, conflicting, or missing.</>}>
      {/* Ask bar */}
      <form onSubmit={(e) => { e.preventDefault(); go(q); }}
        className="flex items-center gap-2 bg-bg-2 rounded-2xl pl-4 pr-2 h-14 shadow-[var(--shadow)] mb-3">
        <span className="text-indigo"><Icon name="sparkles" size={22} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about spaceflight biology…"
          className="flex-1 bg-transparent outline-none t-body placeholder:text-label-2 min-w-0" />
        <button type="submit" disabled={!q.trim()} aria-label="Ask"
          className="grid place-items-center w-10 h-10 rounded-full bg-tint text-white disabled:opacity-30 btn-press">
          <Icon name="arrowUp" size={20} stroke={2.4} />
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-6">
        {SUGGESTED[persona].map((t) => (
          <button key={t} onClick={() => go(t)} className="shrink-0 max-w-[280px] text-left bg-bg-2 rounded-xl px-3.5 py-2.5 t-sub pressable btn-press">
            {t}
          </button>
        ))}
      </div>

      {/* Persona */}
      <Section header="Viewing as" footer={p.blurb}>
        <div className="p-2"><Segmented value={persona} onChange={setPersona} options={PERSONAS.map((x) => ({ value: x.id, label: x.label }))} /></div>
      </Section>

      {error ? <ErrorNote error={error} /> : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {s ? (
          <>
            <Stat icon="books" value={s.papers} label={`publications · ${s.full_text} full text`} color="var(--orange)" />
            <Stat icon="quote" value={s.findings.toLocaleString()} label="evidence-quoted findings" color="var(--indigo)" />
            <Stat icon="split" value={s.contradictions} label="open contradictions" color="var(--red)" />
            <Stat icon="database" value={s.osdr_linked} label="linked to OSDR datasets" color="var(--teal)" />
          </>
        ) : Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-bg-2 rounded-2xl p-4 space-y-3"><Skeleton h={22} w={22} /><Skeleton h={28} w="50%" /><Skeleton h={12} /></div>)}
      </div>

      <div className="grid md:grid-cols-2 gap-x-6">
        {/* Contradictions preview */}
        <Section header="Where studies disagree" footer={<Link className="text-tint" href="/insights">See all contradictions</Link>}>
          {s?.contradictions_preview.map((c) => (
            <Row key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} icon="split" iconBg="var(--red)" title={c.label}
              subtitle={`${c.n_papers} papers · ${Object.entries(c.votes).map(([k, v]) => `${v} ${k.replace("_", " ")}`).join(" · ")}`} />
          )) ?? <div className="row"><Skeleton h={14} /></div>}
        </Section>

        {/* Hypotheses preview */}
        <Section header="Untested connections" footer={<Link className="text-tint" href="/hypotheses">Explore hypotheses</Link>}>
          {s?.hypotheses_preview.map((h) => (
            <Row key={h.id} href={`/hypotheses#${encodeURIComponent(h.id)}`} icon="bulb" iconBg="var(--yellow)"
              title={<span className="line-clamp-2">{h.text.split(" — ")[0]}</span>} subtitle={`${h.bridges.length} bridging concepts · score ${h.score}`} />
          )) ?? <div className="row"><Skeleton h={14} /></div>}
        </Section>
      </div>

      {/* Mission shortcuts */}
      <div className="section-header">Mission briefings</div>
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { id: "iss", t: "ISS", d: "180 days · LEO", g: "linear-gradient(145deg,#30b0c7,#007aff)" },
          { id: "artemis", t: "Artemis", d: "45 days · Moon", g: "linear-gradient(145deg,#8e8e93,#48484a)" },
          { id: "mars", t: "Mars", d: "~1000 days", g: "linear-gradient(145deg,#ff9500,#ff3b30)" },
        ].map((m) => (
          <Link key={m.id} href={`/mission?preset=${m.id}`} className="rounded-2xl p-4 text-white btn-press min-h-[104px] flex flex-col justify-between" style={{ background: m.g }}>
            <Icon name="rocket" size={22} />
            <div>
              <div className="t-headline">{m.t}</div>
              <div className="t-cap opacity-85">{m.d}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Everything */}
      <div className="lg:hidden">
        {NAV.slice(1).map((g) => (
          <Section key={g.title} header={g.title}>
            {g.items.map((it) => <Row key={it.href} href={it.href} icon={it.icon} iconBg={it.color} title={it.label} />)}
          </Section>
        ))}
      </div>

      {s && (
        <p className="t-foot text-label-2 pb-6 flex flex-wrap items-center gap-2">
          <Tag tone={s.llm ? "purple" : "gray"}>{s.llm ? "Claude answers on" : "Extractive mode"}</Tag>
          Corpus {s.years[0]}–{s.years[1]} · {s.chunks.toLocaleString()} passages indexed · {s.nodes} entities · {s.edges} relations ·
          quote-verified findings {s.quote_guard.rules_verified ?? 0}/{s.quote_guard.rules_total ?? 0}
        </p>
      )}
    </Page>
  );
}

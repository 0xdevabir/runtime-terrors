"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { PRIMARY } from "@/components/Shell";
import { usePrefs } from "@/components/prefs";
import { ErrorNote, Page, Row, Section, Skeleton } from "@/components/ui";
import { Stats } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const SUGGESTED: Record<string, string[]> = {
  scientist: [
    "How does flame spread change in microgravity?",
    "What happens to soot formation at reduced gravity?",
    "How do radiative extinctions differ between 1g and µg flames?",
  ],
  manager: [
    "Where is the evidence on spacecraft fire detection weakest?",
    "Which microgravity combustion effects are well established?",
    "How strong is the evidence on oxygen and flame spread?",
  ],
  architect: [
    "What countermeasures reduce fire risk on long missions?",
    "What are the fire risks for a Mars habitat atmosphere?",
    "Which materials are safest for spacecraft interiors?",
  ],
  student: [
    "Why do flames look different in space?",
    "Can a fire start on the ISS?",
    "How do astronauts put out a fire in freefall?",
  ],
};

const EXPLORE = PRIMARY.filter((p) => ["/graph", "/papers", "/insights", "/mission"].includes(p.href));

export default function Home() {
  const { persona } = usePrefs();
  const { data: s, error } = useApi<Stats>("/stats");
  const [q, setQ] = useState("");
  const router = useRouter();
  const go = (text: string) => text.trim() && router.push(`/ask?q=${encodeURIComponent(text.trim())}`);

  return (
    <Page brand title="Emberfall" subtitle="Ask what decades of NASA fire research say about flames in space.">
      {/* Ask bar */}
      <form onSubmit={(e) => { e.preventDefault(); go(q); }}
        className="flex items-center gap-2 bg-bg-2 rounded-[22px] pl-5 pr-2 h-[60px] shadow-[var(--shadow)] ring-[0.5px] ring-sep mb-3 anim-rise">
        <span className="text-tint"><Icon name="sparkles" size={22} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about fire in space…"
          className="flex-1 bg-transparent outline-none t-body placeholder:text-label-3 min-w-0" />
        <button type="submit" disabled={!q.trim()} aria-label="Ask"
          className="grid place-items-center w-11 h-11 rounded-full bg-tint text-on-tint disabled:opacity-25 btn-press">
          <Icon name="arrowUp" size={20} stroke={2.4} />
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-10">
        {SUGGESTED[persona].map((t) => (
          <button key={t} onClick={() => go(t)}
            className="text-left rounded-full px-3.5 py-1.5 t-foot text-label-2 bg-fill hover:text-label hover:bg-fill-2 transition-colors btn-press">
            {t}
          </button>
        ))}
      </div>

      {error ? <div className="mb-8"><ErrorNote error={error} /></div> : null}

      {/* What's inside, as a flow: reports → findings → connected concepts */}
      <div className="bg-bg-2 rounded-[22px] ring-[0.5px] ring-sep p-5 mb-10">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
          {[
            { v: s?.papers, l: "NASA reports" },
            { v: s?.findings, l: "quoted findings" },
            { v: s?.nodes, l: "linked concepts" },
          ].flatMap((x, i) => [
            ...(i ? [<Icon key={`a${i}`} name="chevron" size={16} stroke={2.4} className="text-label-3" />] : []),
            <div key={x.l} className="min-w-0">
              {x.v != null
                ? <div className="text-[30px] leading-none font-bold tracking-tight tabular-nums">{x.v.toLocaleString()}</div>
                : <Skeleton h={30} w="60%" className="mx-auto" />}
              <div className="t-foot text-label-2 mt-1.5">{x.l}</div>
            </div>,
          ])}
        </div>
      </div>

      {/* Explore */}
      <div className="section-header">Explore</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        {EXPLORE.map((it, i) => (
          <Link key={it.href} href={it.href} style={{ animationDelay: `${i * 40}ms` }}
            className="group anim-rise bg-bg-2 rounded-[22px] ring-[0.5px] ring-sep p-4 min-h-[128px] flex flex-col justify-between btn-press hover:shadow-[var(--shadow)] transition-shadow">
            <span className="grid place-items-center w-10 h-10 rounded-[12px] bg-accent/35 text-tint">
              <Icon name={it.icon} size={21} />
            </span>
            <div>
              <div className="t-headline flex items-center gap-1">{it.label}
                <Icon name="chevron" size={12} stroke={2.6} className="text-label-3 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="t-foot text-label-2">{it.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-x-6">
        <Section header="Where studies disagree" footer={<Link className="text-tint font-medium" href="/insights">See all</Link>}>
          {s?.contradictions_preview.slice(0, 3).map((c) => (
            <Row key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} title={<span className="t-sub font-medium">{c.label}</span>}
              detail={<span className="t-foot">{c.n_papers}</span>}>
              <div className="mt-2 max-w-[260px]"><VoteBar votes={c.votes} height={5} legend={false} /></div>
            </Row>
          )) ?? <div className="row"><Skeleton h={14} /></div>}
        </Section>

        <Section header="Ideas nobody has tested" footer={<Link className="text-tint font-medium" href="/hypotheses">See all</Link>}>
          {s?.hypotheses_preview.slice(0, 3).map((h) => (
            <Row key={h.id} href={`/hypotheses#${encodeURIComponent(h.id)}`} icon="bulb" iconBg="var(--yellow)"
              title={<span className="t-sub line-clamp-2">{h.text.split(" — ")[0]}</span>} />
          )) ?? <div className="row"><Skeleton h={14} /></div>}
        </Section>
      </div>

      {s && (
        <p className="t-cap text-label-3 pb-6">
          {s.llm ? `Answers written by ${s.llm_provider === "gemini" ? "Gemini" : s.llm_provider === "groq" ? "Groq" : "Claude"}` : "Extractive answers"} · every claim cited · data {s.years[0]}–{s.years[1]}
        </p>
      )}
    </Page>
  );
}

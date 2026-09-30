"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Columns, VoteBar } from "@/components/charts";
import { Icon } from "@/components/Icon";
import { ErrorNote, LoadingList, Page, Row, Section, StrengthBadge, StudyTag, Tag } from "@/components/ui";
import { Takeaway, Takeaways, Topic } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const KIND = {
  consensus: { icon: "checkCircle", color: "var(--green)", label: "Established" },
  conflict: { icon: "split", color: "var(--red)", label: "Disputed" },
  gap: { icon: "warn", color: "var(--orange)", label: "Gap" },
} as const;

export default function TopicsPage() {
  return <Suspense><Topics /></Suspense>;
}

function Topics() {
  const id = useSearchParams().get("id");
  return id ? <TopicView id={id} /> : <TopicList />;
}

function TopicList() {
  const { data, error } = useApi<Takeaways>("/takeaways");
  const rows = Object.entries(data ?? {}).sort((a, b) => b[1].n_papers - a[1].n_papers);
  return (
    <Page title="Topics" subtitle="What the corpus establishes, disputes and leaves open for each flame geometry, generated from the evidence groups.">
      {error ? <ErrorNote error={error} /> : !data ? <LoadingList rows={6} /> : (
        <div className="grid md:grid-cols-2 gap-3 pb-10">
          {rows.map(([tid, t]) => (
            <Link key={tid} href={`/topics?id=${encodeURIComponent(tid)}`} className="bg-bg-2 rounded-2xl p-4 pressable block">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="t-headline">{t.label}</span>
                <span className="t-cap text-label-2">{t.n_papers} papers</span>
              </div>
              <TakeawayList items={t.items.slice(0, 3)} />
              {t.items.length > 3 && <div className="t-cap text-tint mt-2">+{t.items.length - 3} more</div>}
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}

function TakeawayList({ items }: { items: Takeaway[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const k = KIND[it.kind];
        return (
          <li key={i} className="flex gap-2 items-start t-foot">
            <span className="mt-0.5 shrink-0" style={{ color: k.color }}><Icon name={k.icon} size={15} stroke={2.2} /></span>
            <span>{it.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function TopicView({ id }: { id: string }) {
  const { data: t, error } = useApi<Topic>(`/topic/${encodeURIComponent(id)}`);
  if (error) return <Page title="Topic" back={{ href: "/topics", label: "Topics" }}><ErrorNote error={error} /></Page>;
  if (!t) return <Page title="Topic" back={{ href: "/topics", label: "Topics" }}><LoadingList rows={6} /></Page>;
  return (
    <Page title={t.label} back={{ href: "/topics", label: "Topics" }}
      subtitle={`${t.n_papers} papers · ${t.n_findings} evidence-quoted findings`}
      trailing={<Link href={`/ask?q=${encodeURIComponent(`What is known about ${t.label.toLowerCase()} in microgravity?`)}`} className="t-sub text-tint">Ask</Link>}>
      <div className="bg-bg-2 rounded-2xl p-4 mb-6">
        <div className="t-headline mb-3">Key takeaways</div>
        {t.takeaways.length ? <TakeawayList items={t.takeaways} /> : <p className="t-sub text-label-2">Not enough grouped evidence yet.</p>}
      </div>
      {t.by_year.length > 1 && (
        <div className="bg-bg-2 rounded-2xl p-4 mb-6">
          <div className="t-foot font-semibold text-label-2 mb-2">Papers per year</div>
          <Columns labels={t.by_year.map(([y]) => String(y))} values={t.by_year.map(([, n]) => n)} height={120} />
        </div>
      )}
      <Section header={`Evidence groups (${t.consensus.length})`}>
        {t.consensus.slice(0, 15).map((c) => (
          <Link key={c.id} href={`/insights?id=${encodeURIComponent(c.id)}`} className="row pressable block">
            <div className="flex justify-between gap-2 mb-1.5">
              <span className="t-sub font-medium">{c.label}</span>
              <Tag tone={c.status === "contradictory" ? "red" : c.status === "consensus" ? "green" : "gray"}>{c.status}</Tag>
            </div>
            <VoteBar votes={c.votes} height={6} legend={false} />
            <div className="mt-1.5"><StrengthBadge s={c.strength} compact /></div>
          </Link>
        ))}
      </Section>
      <Section header="Most informative papers">
        {t.papers.map((p) => (
          <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub font-medium line-clamp-2">{p.title}</span>}
            subtitle={<span className="flex items-center gap-2 mt-1"><StudyTag type={p.study_type} />{p.year} · {p.n_findings} findings</span>} />
        ))}
      </Section>
    </Page>
  );
}

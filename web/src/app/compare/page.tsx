"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Icon } from "@/components/Icon";
import { DirectionGlyph, ErrorNote, LoadingList, Page, Row, SearchField, Section, StudyTag, Tag } from "@/components/ui";
import { api, Finding, PaperCard, PaperDetail } from "@/lib/api";
import { useBookmarks } from "@/lib/bookmarks";
import { useApi } from "@/lib/useApi";

type Item = PaperCard & Pick<PaperDetail, "duration" | "summary" | "atmosphere" | "limitations"> & { findings: Finding[] };
type Cmp = {
  items: Item[]; shared: Record<string, string[]>; labels: Record<string, string>;
  agreement: { condition: string; outcome: string; directions: string[]; agree: boolean }[];
};

const FIELDS = [["fuels", "Fuels"], ["conditions", "Conditions"], ["geometries", "Geometries"], ["platforms", "Platforms"]] as const;

export default function ComparePage() {
  return <Suspense><Compare /></Suspense>;
}

function Compare() {
  const ids = (useSearchParams().get("ids") ?? "").split(",").filter(Boolean);
  const router = useRouter();
  const setIds = (next: string[]) => router.replace(next.length ? `/compare?ids=${next.join(",")}` : "/compare");
  const { data, error } = useApi<Cmp>(ids.length >= 2 ? `/compare?ids=${ids.join(",")}` : null);
  return (
    <Page wide title="Compare reports" subtitle="Pick reports and see them side by side.">
      <Picker ids={ids} onChange={setIds} />
      {ids.length < 2 ? null : error ? <ErrorNote error={error} /> : !data ? <LoadingList rows={6} /> : <Table d={data} onRemove={(id) => setIds(ids.filter((x) => x !== id))} />}
    </Page>
  );
}

function Picker({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PaperCard[]>([]);
  const { saved } = useBookmarks();
  const search = () => q.trim() && api<{ items: PaperCard[] }>(`/papers?q=${encodeURIComponent(q.trim())}&limit=6`).then((r) => setHits(r.items)).catch(() => setHits([]));
  const add = (id: string) => { if (!ids.includes(id) && ids.length < 4) onChange([...ids, id]); setHits([]); setQ(""); };
  const suggestions = saved.filter((s) => !ids.includes(s));
  return (
    <div className="mb-6 no-print">
      <div className="flex flex-col md:flex-row gap-2 md:items-center">
        <div className="flex-1"><SearchField value={q} onChange={setQ} onSubmit={search} placeholder={ids.length >= 4 ? "Up to 4 reports" : "Add a report: search title or NTRS ID"} /></div>
        {suggestions.length > 0 && ids.length < 4 && (
          <button onClick={() => onChange([...ids, ...suggestions].slice(0, 4))} className="t-sub text-tint shrink-0">Add saved reports ({suggestions.length})</button>
        )}
      </div>
      {hits.length > 0 && (
        <div className="group mt-2">
          {hits.map((p) => <Row key={p.id} onClick={() => add(p.id)} title={<span className="t-sub line-clamp-1">{p.title}</span>} subtitle={`${p.year} · ${p.id}`} detail={<Icon name="check" size={16} />} chevron={false} />)}
        </div>
      )}
      {ids.length < 2 && <p className="t-foot text-label-2 mt-3">Pick at least two reports. You can also save reports from the Reports list and compare them from there.</p>}
    </div>
  );
}

function Table({ d, onRemove }: { d: Cmp; onRemove: (id: string) => void }) {
  const lab = (id: string) => d.labels[id] ?? id;
  const cols = `grid gap-3`;
  const style = { gridTemplateColumns: `repeat(${d.items.length}, minmax(240px, 1fr))` };
  return (
    <div className="pb-10">
      <div className="overflow-x-auto -mx-4 px-4">
        <div className={cols} style={style}>
          {d.items.map((p) => (
            <div key={p.id} className="bg-bg-2 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <Link href={`/papers/${p.id}`} className="t-headline line-clamp-3 flex-1 hover:text-tint">{p.title}</Link>
                <button onClick={() => onRemove(p.id)} aria-label="Remove" className="text-label-3 hover:text-label no-print"><Icon name="xmark" size={16} /></button>
              </div>
              <div className="t-cap text-label-2">{p.authors[0]}{p.n_authors > 1 ? " et al." : ""} · {p.year}{p.journal ? ` · ${p.journal}` : p.center ? ` · ${p.center}` : ""}</div>
              <div className="flex flex-wrap gap-1.5">
                <StudyTag type={p.study_type} />
                {p.duration && <Tag>{p.duration.value} {p.duration.unit}</Tag>}
                {p.n_tests ? <Tag>{p.n_tests} tests</Tag> : null}
                {p.atmosphere && <Tag tone="red">{p.atmosphere}</Tag>}
                {p.experiments.map((x) => <Tag key={x} tone="teal">{x}</Tag>)}
                {p.missions?.map((m) => <Tag key={m} tone="purple">{m}</Tag>)}
              </div>
              <p className="t-foot">{p.summary.l1}</p>
              {FIELDS.map(([f, name]) => (p[f] as string[]).length > 0 && (
                <div key={f}>
                  <div className="t-cap2 uppercase font-semibold text-label-2 mb-1">{name}</div>
                  <div className="flex flex-wrap gap-1">
                    {(p[f] as string[]).map((e) => <Tag key={e} tone={d.shared[f]?.includes(e) ? "blue" : "gray"}>{lab(e)}</Tag>)}
                  </div>
                </div>
              ))}
              <div>
                <div className="t-cap2 uppercase font-semibold text-label-2 mb-1">Findings ({p.findings.length})</div>
                <ul className="space-y-1.5">
                  {p.findings.map((f) => (
                    <li key={f.id} className="flex items-center gap-1.5 t-cap"><DirectionGlyph d={f.direction} />{f.labels.outcome}{f.labels.geometry ? ` · ${f.labels.geometry}` : ""}</li>
                  ))}
                </ul>
              </div>
              {(p.limitations?.length ?? 0) > 0 && (
                <div>
                  <div className="t-cap2 uppercase font-semibold text-label-2 mb-1">Stated limitations</div>
                  <p className="t-cap text-label-2 line-clamp-4">{p.limitations![0]}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="t-cap text-label-2 mt-2">Blue tags are shared by every report.</p>
      <Section header="Effects measured in every report" footer={d.agreement.length ? "Directions in report order." : undefined}>
        {d.agreement.length === 0 && <div className="row t-sub text-label-2">These reports don&apos;t measure a common condition–outcome pair.</div>}
        {d.agreement.map((a) => (
          <div key={a.condition + a.outcome} className="row">
            <span className="flex-1 t-sub">{a.condition} → {a.outcome}</span>
            <span className="flex gap-1">{a.directions.map((x, i) => <DirectionGlyph key={i} d={x} />)}</span>
            <Tag tone={a.agree ? "green" : "red"}>{a.agree ? "Agree" : "Disagree"}</Tag>
          </div>
        ))}
      </Section>
    </div>
  );
}

"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Chip, Empty, ErrorNote, LoadingList, Page, Row, SearchField, Segmented, StudyTag, Tag } from "@/components/ui";
import { API, api, PaperCard } from "@/lib/api";
import { useBookmarks } from "@/lib/bookmarks";
import { useEntities } from "@/lib/entities";

const TYPES = [
  { v: "", l: "All" }, { v: "flight,both", l: "Orbital flight" }, { v: "short_ug", l: "Drop tower / parabolic" },
  { v: "ground", l: "1g lab" }, { v: "computational", l: "Models" }, { v: "review", l: "Reviews" },
];
const PAGE = 40;

export default function PapersPage() {
  return <Suspense><Papers /></Suspense>;
}

function Papers() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [applied, setApplied] = useState(sp.get("q") ?? "");
  const [type, setType] = useState("");
  const [experiment, setExperiment] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const { saved, has, toggle } = useBookmarks();
  const [sort, setSort] = useState<"year" | "findings" | "title">("year");
  const [facet, setFacet] = useState<{ fuel?: string; condition?: string; geometry?: string }>({
    fuel: sp.get("fuel") ?? undefined, condition: sp.get("condition") ?? undefined, geometry: sp.get("geometry") ?? undefined,
  });
  const [items, setItems] = useState<PaperCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const { entities, label } = useEntities();

  const qs = (offset: number) => {
    const p = new URLSearchParams({ sort, offset: String(offset), limit: String(PAGE) });
    if (applied) p.set("q", applied);
    if (type) p.set("study_type", type);
    if (experiment) p.set("experiment", "true");
    if (onlySaved) p.set("ids", saved.join(",") || "none");
    Object.entries(facet).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  };

  useEffect(() => {
    setItems(null); setError(null);
    api<{ total: number; items: PaperCard[] }>(`/papers?${qs(0)}`).then((r) => { setItems(r.items); setTotal(r.total); }).catch(setError);
  }, [applied, type, experiment, sort, facet, onlySaved, onlySaved && saved.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = () => api<{ total: number; items: PaperCard[] }>(`/papers?${qs(items!.length)}`).then((r) => setItems((x) => [...(x ?? []), ...r.items]));
  const top = (t: string) => entities.filter((e) => e.type === t && e.papers > 0).sort((a, b) => b.papers - a.papers).slice(0, 10);
  const setF = (k: "fuel" | "condition" | "geometry", v?: string) => setFacet((f) => ({ ...f, [k]: f[k] === v ? undefined : v }));
  const active = Object.entries(facet).filter(([, v]) => v) as ["fuel" | "condition" | "geometry", string][];

  return (
    <Page title="Reports" subtitle="Every NASA NTRS report in the microgravity combustion and fire-safety corpus, searchable by meaning and filterable by what was burned and how."
      trailing={<a href={`${API}/api/export/papers?format=csv`} className="t-sub text-tint" title="Download all reports as CSV">Export CSV</a>}
      toolbar={
        <div className="space-y-3">
          <SearchField value={q} onChange={(v) => { setQ(v); if (!v) setApplied(""); }} onSubmit={() => setApplied(q.trim())} placeholder="Search titles and full text" />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
            {TYPES.map((t) => <Chip key={t.l} active={type === t.v} onClick={() => setType(t.v)}>{t.l}</Chip>)}
            <Chip active={experiment} onClick={() => setExperiment(!experiment)}><Icon name="database" size={14} />Named flight experiment</Chip>
            <Chip active={onlySaved} onClick={() => setOnlySaved(!onlySaved)}><Icon name="check" size={14} />Saved{saved.length ? ` · ${saved.length}` : ""}</Chip>
          </div>
          <details className="group/f">
            <summary className="list-none cursor-pointer t-sub text-tint inline-flex items-center gap-1">
              <Icon name="filter" size={16} />Filter by fuel, condition, flame geometry
              <Icon name="chevronDown" size={14} className="transition-transform group-open/f:rotate-180" />
            </summary>
            <div className="mt-3 space-y-3">
              {(["fuel", "condition", "geometry"] as const).map((t) => (
                <div key={t}>
                  <div className="t-cap uppercase text-label-2 mb-1.5">{t}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {top(t).map((e) => (
                      <Chip key={e.id} active={facet[t] === e.id} onClick={() => setF(t, e.id)}>
                        {e.label} <span className="opacity-60 tabular-nums">{e.papers}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      }>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="t-foot text-label-2 flex flex-wrap items-center gap-2">
          {items ? `${total} report${total === 1 ? "" : "s"}` : "Searching…"}
          {active.map(([k, v]) => (
            <button key={k} onClick={() => setF(k, v)} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-tint/12 text-tint t-cap font-semibold">
              {label(v)}<Icon name="xmark" size={10} stroke={3} />
            </button>
          ))}
        </div>
        <Segmented size="sm" className="w-[210px] shrink-0" value={sort} onChange={setSort}
          options={[{ value: "year", label: "Newest" }, { value: "findings", label: "Findings" }, { value: "title", label: "A–Z" }]} />
      </div>

      {onlySaved && saved.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 t-foot">
          <span className="text-label-2">Saved papers:</span>
          {(["bibtex", "ris", "csv"] as const).map((f) => (
            <a key={f} className="text-tint" href={`${API}/api/export/papers?format=${f}&ids=${saved.join(",")}`}>{f === "bibtex" ? "BibTeX" : f.toUpperCase()}</a>
          ))}
          {saved.length >= 2 && <Link className="text-tint" href={`/compare?ids=${saved.slice(0, 4).join(",")}`}>Compare {Math.min(saved.length, 4)} side by side</Link>}
        </div>
      )}
      {error ? <ErrorNote error={error} /> : !items ? <LoadingList rows={8} /> : items.length === 0 ? (
        <Empty title="No reports" text={onlySaved ? "Save reports with the bookmark on each report page." : "Try a broader search or remove a filter."} />
      ) : (
        <>
          <div className="group mb-4">
            {items.map((p) => (
              <Row key={p.id} href={`/papers/${p.id}`}
                detail={<span role="button" tabIndex={0} aria-label={has(p.id) ? "Remove from saved" : "Save paper"}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(p.id); }}
                  className={`grid place-items-center w-8 h-8 rounded-full hover:bg-fill ${has(p.id) ? "text-tint" : "text-label-3"}`}>
                  <Icon name={has(p.id) ? "checkCircle" : "circle"} size={18} />
                </span>}
                title={<span className="line-clamp-2 font-medium">{p.title}</span>}
                subtitle={
                  <span className="block">
                    <span className="block truncate">{p.authors.slice(0, 2).join(", ")}{p.n_authors > 2 ? " et al." : ""} · {p.year}{p.journal ? ` · ${p.journal}` : p.center ? ` · ${p.center}` : ""}</span>
                    {p.key_finding && <span className="block line-clamp-2 mt-1 text-label">{p.key_finding}</span>}
                    <span className="flex flex-wrap gap-1.5 mt-2">
                      <StudyTag type={p.study_type} />
                      {p.fuels.slice(0, 2).map((o) => <Tag key={o}>{label(o)}</Tag>)}
                      {p.experiments.slice(0, 2).map((x) => <Tag key={x} tone="teal">{x}</Tag>)}
                      {!p.full_text && <Tag tone="orange">Abstract only</Tag>}
                      {p.n_tests ? <Tag>{p.n_tests} tests</Tag> : null}
                      {p.missions?.slice(0, 2).map((m) => <Tag key={m} tone="purple">{m}</Tag>)}
                    </span>
                  </span>
                } />
            ))}
          </div>
          {items.length < total && (
            <button onClick={more} className="w-full h-11 rounded-xl bg-bg-2 text-tint t-headline mb-10 btn-press">Show more ({total - items.length} left)</button>
          )}
        </>
      )}
    </Page>
  );
}

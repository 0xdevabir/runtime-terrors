"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { ErrorNote, LoadingList, Page, Row, Section, Segmented, Sheet, Skeleton, StudyTag } from "@/components/ui";
import { api, GapMatrix, PaperCard } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type Dim = "organism" | "tissue" | "outcome";
const DIM_LABEL: Record<Dim, string> = { organism: "Organisms", tissue: "Tissues", outcome: "Outcomes" };
// bin edges for the sequential ramp (0 is its own "no study" state)
const BINS = [1, 2, 4, 8, 16, 32, 64];
const bin = (n: number) => (n <= 0 ? 0 : Math.min(7, BINS.findIndex((b) => n < b) === -1 ? 7 : BINS.findIndex((b) => n < b)));

export default function GapsPage() {
  const { data, error } = useApi<Record<Dim, GapMatrix>>("/gaps");
  const [dim, setDim] = useState<Dim>("organism");
  const [flight, setFlight] = useState(false);
  const [cell, setCell] = useState<{ r: string; c: string } | null>(null);
  const [hover, setHover] = useState<{ r: string; c: string } | null>(null);
  const m = data?.[dim];

  const count = (k: string) => {
    const c = m?.cells[k];
    return c ? (flight ? c.flight : c.papers.length) : 0;
  };

  // Gaps = cells far below what row/column totals would predict
  const ranked = useMemo(() => {
    if (!m) return [];
    const rt: Record<string, number> = {}, ct: Record<string, number> = {};
    let g = 0;
    for (const r of m.rows) for (const c of m.cols) {
      const n = count(`${r.id}|${c.id}`);
      rt[r.id] = (rt[r.id] ?? 0) + n; ct[c.id] = (ct[c.id] ?? 0) + n; g += n;
    }
    const out: { r: typeof m.rows[0]; c: typeof m.cols[0]; n: number; exp: number }[] = [];
    for (const r of m.rows) for (const c of m.cols) {
      const exp = g ? (rt[r.id] * ct[c.id]) / g : 0;
      const n = count(`${r.id}|${c.id}`);
      if (exp >= 2 && n <= exp * 0.25) out.push({ r, c, n, exp });
    }
    return out.sort((a, b) => b.exp - b.n - (a.exp - a.n)).slice(0, 8);
  }, [m, flight]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!m) return [];
    return [...m.rows].map((r) => ({ ...r, total: m.cols.reduce((s, c) => s + count(`${r.id}|${c.id}`), 0) }))
      .filter((r) => r.total > 0 || !flight).sort((a, b) => b.total - a.total);
  }, [m, flight]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (id: string) => m?.rows.find((r) => r.id === id)?.label ?? m?.cols.find((c) => c.id === id)?.label ?? id;

  return (
    <Page wide title="Evidence Gaps" subtitle="How many publications study each combination. Empty and pale cells are where the literature is thin — candidates for the next experiment."
      toolbar={
        <div className="flex flex-wrap items-center gap-3">
          <Segmented className="w-[300px]" value={dim} onChange={setDim} options={(Object.keys(DIM_LABEL) as Dim[]).map((d) => ({ value: d, label: DIM_LABEL[d] }))} />
          <Segmented className="w-[240px]" value={flight ? "f" : "a"} onChange={(v) => setFlight(v === "f")} options={[{ value: "a", label: "All studies" }, { value: "f", label: "Spaceflight only" }]} />
        </div>
      }>
      {error ? <ErrorNote error={error} /> : !m ? <Skeleton h={420} /> : (
        <>
          <div className="bg-bg-2 rounded-2xl p-3 md:p-4 mb-3 overflow-x-auto">
            <table className="border-separate border-spacing-[2px] mx-auto">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-bg-2 z-10" />
                  {m.cols.map((c) => (
                    <th key={c.id} className="h-[128px] align-bottom p-0 font-normal">
                      <div className={`w-[44px] t-cap text-left whitespace-nowrap origin-bottom-left translate-x-[26px] -rotate-45 ${hover?.c === c.id ? "text-label font-semibold" : "text-label-2"}`}>
                        {c.label.length > 22 ? c.label.slice(0, 21) + "…" : c.label}
                      </div>
                    </th>
                  ))}
                  <th className="t-cap text-label-2 font-normal align-bottom pl-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th className={`sticky left-0 bg-bg-2 z-10 text-right pr-2 t-foot font-normal whitespace-nowrap max-w-[190px] truncate ${hover?.r === r.id ? "text-label font-semibold" : "text-label-2"}`}>{r.label}</th>
                    {m.cols.map((c) => {
                      const k = `${r.id}|${c.id}`, n = count(k), b = bin(n);
                      return (
                        <td key={c.id} className="p-0">
                          <button onClick={() => n && setCell({ r: r.id, c: c.id })}
                            onPointerEnter={() => setHover({ r: r.id, c: c.id })} onPointerLeave={() => setHover(null)}
                            aria-label={`${r.label} × ${c.label}: ${n} papers`}
                            className={`w-[44px] h-[30px] rounded-[4px] t-cap2 font-semibold tabular-nums transition-transform ${n ? "hover:scale-110 cursor-pointer" : "cursor-default"} ${hover?.r === r.id && hover?.c === c.id ? "ring-2 ring-label" : ""}`}
                            style={n ? { background: `var(--seq-${b})`, color: `var(--seq-ink-${b})` } : { background: "repeating-linear-gradient(135deg, var(--fill) 0 3px, transparent 3px 7px)", color: "var(--label-3)" }}>
                            {n || "–"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="pl-2 t-foot text-label-2 tabular-nums">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 mb-8 t-cap text-label-2">
            <span className="inline-flex items-center gap-1.5"><span className="w-4 h-3 rounded-[3px]" style={{ background: "repeating-linear-gradient(135deg, var(--fill-2) 0 3px, transparent 3px 7px)" }} />No study</span>
            <span className="inline-flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((b) => <span key={b} className="w-5 h-3 first:rounded-l-[3px] last:rounded-r-[3px]" style={{ background: `var(--seq-${b})` }} />)}
            </span>
            <span>1 → 64+ papers</span>
            <span className="ml-auto">{hover ? `${label(hover.r)} × ${label(hover.c)}: ${count(`${hover.r}|${hover.c}`)} papers` : "Tap a cell to see its papers"}</span>
          </div>

          <Section header="Most conspicuous gaps" footer="Combinations with far fewer studies than their row and column totals would predict. These are the least-explored pairings among well-studied subjects.">
            {ranked.length === 0 && <div className="row t-sub text-label-2">No striking gaps in this view.</div>}
            {ranked.map((g) => (
              <Row key={g.r.id + g.c.id} icon="target" iconBg="var(--orange)" onClick={() => g.n ? setCell({ r: g.r.id, c: g.c.id }) : undefined}
                title={<>{g.r.label} <span className="text-label-2">×</span> {g.c.label}</>}
                subtitle={`${g.n} ${g.n === 1 ? "study" : "studies"} vs ~${Math.round(g.exp)} expected`}
                detail={<Link href={`/ask?q=${encodeURIComponent(`What is known about ${g.c.label.toLowerCase()} effects on ${g.r.label.toLowerCase()}?`)}`} onClick={(e) => e.stopPropagation()} className="text-tint t-foot">Ask</Link>} />
            ))}
          </Section>
        </>
      )}

      <Sheet open={!!cell} onClose={() => setCell(null)} title={cell ? `${label(cell.r)} × ${label(cell.c)}` : ""}>
        {cell && m && <CellPapers ids={m.cells[`${cell.r}|${cell.c}`]?.papers ?? []} flight={m.cells[`${cell.r}|${cell.c}`]?.flight ?? 0} />}
      </Sheet>
    </Page>
  );
}

function CellPapers({ ids, flight }: { ids: string[]; flight: number }) {
  const [items, setItems] = useState<PaperCard[] | null>(null);
  useEffect(() => {
    setItems(null);
    api<{ items: PaperCard[] }>(`/papers?limit=200&ids=${ids.join(",")}`).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [ids]);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-bg-2 rounded-2xl p-3"><div className="t-title2 tabular-nums">{ids.length}</div><div className="t-foot text-label-2">publications</div></div>
        <div className="bg-bg-2 rounded-2xl p-3"><div className="t-title2 tabular-nums">{flight}</div><div className="t-foot text-label-2 flex items-center gap-1"><Icon name="rocket" size={13} />from spaceflight</div></div>
      </div>
      {!items ? <LoadingList rows={5} /> : (
        <div className="group">
          {items.map((p) => (
            <Row key={p.id} href={`/papers/${p.id}`} title={<span className="t-sub font-medium line-clamp-2">{p.title}</span>}
              subtitle={<span className="flex items-center gap-2 mt-1">{p.year}<StudyTag type={p.study_type} /></span>} />
          ))}
        </div>
      )}
    </>
  );
}

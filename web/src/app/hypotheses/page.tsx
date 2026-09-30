"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Chip, ErrorNote, LoadingList, Page } from "@/components/ui";
import { Hypothesis } from "@/lib/api";
import { TYPE_META } from "@/lib/entities";
import { useApi } from "@/lib/useApi";

const typeOf = (id: string) => id.split(":")[0];

export default function HypothesesPage() {
  const { data, error } = useApi<Hypothesis[]>("/hypotheses");
  const [type, setType] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h && data) {
      setOpen(h);
      requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: "center" }));
    }
  }, [data]);

  const types = [...new Set((data ?? []).map((h) => typeOf(h.a)))];
  const rows = (data ?? []).filter((h) => !type || typeOf(h.a) === type);
  const max = Math.max(1, ...(data ?? []).map((h) => h.score));

  return (
    <Page title="Hypotheses" subtitle={<>Connections the literature implies but never tests. If A is linked to B in some papers, and B to C in others, but no paper studies A with C, that A–C link is a candidate experiment.</>}
      toolbar={
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
          <Chip active={!type} onClick={() => setType("")}>All</Chip>
          {types.map((t) => <Chip key={t} active={type === t} onClick={() => setType(t)} color={type === t ? undefined : TYPE_META[t]?.color}>{TYPE_META[t]?.label ?? t}</Chip>)}
        </div>
      }>
      <div className="bg-bg-2 rounded-2xl p-4 mb-6 flex gap-3 t-foot text-label-2">
        <span className="text-yellow shrink-0"><Icon name="warn" size={18} /></span>
        These are generated from co-occurrence patterns in the knowledge graph (literature-based discovery), not from any study. Treat them as leads to check, not findings.
      </div>
      {error ? <ErrorNote error={error} /> : !data ? <LoadingList rows={6} /> : (
        <div className="space-y-3 mb-10">
          {rows.map((h, i) => {
            const isOpen = open === h.id;
            return (
              <div key={h.id} id={h.id} className={`bg-bg-2 rounded-2xl overflow-hidden transition-shadow ${isOpen ? "ring-2 ring-tint/40" : ""}`}>
                <button onClick={() => setOpen(isOpen ? null : h.id)} className="w-full text-left p-4 pressable">
                  <div className="flex items-start gap-3">
                    <span className="grid place-items-center w-7 h-7 rounded-full bg-yellow/20 text-yellow t-foot font-bold shrink-0 tabular-nums">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <Node id={h.a} label={h.a_label} />
                        <Icon name="arrowUpRight" size={14} className="text-label-3 rotate-45" />
                        <Node id={h.c} label={h.c_label} />
                      </div>
                      <div className="t-sub">{h.text}</div>
                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="w-24 h-[5px] rounded-full bg-fill overflow-hidden"><div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${(h.score / max) * 100}%` }} /></div>
                        <span className="t-cap text-label-2">support {h.score} · {h.bridges.length} bridges</span>
                      </div>
                    </div>
                    <Icon name="chevronDown" size={14} stroke={2.4} className={`text-label-3 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 anim-fade">
                    <div className="section-header !px-0">Bridging concepts</div>
                    <div className="space-y-2 mb-4">
                      {h.bridges.map((b) => (
                        <div key={b.b} className="rounded-xl bg-fill p-3 t-foot">
                          <div className="flex flex-wrap items-center gap-1.5 font-medium">
                            {h.a_label} <span className="text-label-3">—</span>
                            <Link href={`/graph?focus=${encodeURIComponent(b.b)}&lit=${encodeURIComponent([h.a, b.b, h.c].join(","))}`} className="text-tint">{b.label}</Link>
                            <span className="text-label-3">—</span> {h.c_label}
                          </div>
                          <div className="text-label-2 mt-1 flex flex-wrap gap-x-3">
                            <span>{b.ab_papers.length} paper{b.ab_papers.length === 1 ? "" : "s"} link {h.a_label} ↔ {b.label}{b.ab_papers[0] && <> (<Link className="text-tint" href={`/papers/${b.ab_papers[0]}`}>e.g.</Link>)</>}</span>
                            <span>{b.bc_papers.length} link {b.label} ↔ {h.c_label}{b.bc_papers[0] && <> (<Link className="text-tint" href={`/papers/${b.bc_papers[0]}`}>e.g.</Link>)</>}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Link href={`/ask?q=${encodeURIComponent(`Is there evidence linking ${h.a_label} and ${h.c_label} in spaceflight?`)}`}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-tint text-white t-sub font-semibold btn-press">
                      <Icon name="sparkles" size={15} />Check the literature
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function Node({ id, label }: { id: string; label: string }) {
  const t = TYPE_META[typeOf(id)];
  return (
    <span className="inline-flex items-center gap-1.5 h-[24px] px-2 rounded-full bg-fill t-foot font-semibold">
      <span className="w-2 h-2 rounded-full" style={{ background: t?.color }} />{label}
    </span>
  );
}

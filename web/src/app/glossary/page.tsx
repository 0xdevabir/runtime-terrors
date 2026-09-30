"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorNote, LoadingList, Page, SearchField } from "@/components/ui";
import { GlossaryTerm } from "@/lib/api";
import { useApi } from "@/lib/useApi";

export default function GlossaryPage() {
  const { data, error } = useApi<GlossaryTerm[]>("/glossary");
  const [q, setQ] = useState("");
  const rows = (data ?? []).filter((t) => !q || `${t.term} ${t.definition}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Glossary" subtitle="Plain-language definitions of the terms used across space biology papers. The Student view links these in answers."
      toolbar={<SearchField value={q} onChange={setQ} placeholder="Find a term" />}>
      {error ? <ErrorNote error={error} /> : !data ? <LoadingList rows={8} /> : (
        <div className="group mb-10">
          {rows.map((t) => (
            <div key={t.term} id={t.term} className="row block">
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-headline capitalize">{t.term}</span>
                <Link href={`/ask?q=${encodeURIComponent(`What is ${t.term} and how does spaceflight affect it?`)}`} className="t-cap text-tint shrink-0">Ask about it</Link>
              </div>
              <p className="t-sub text-label-2 mt-1">{t.definition}</p>
            </div>
          ))}
          {rows.length === 0 && <div className="row t-sub text-label-2">No matching terms.</div>}
        </div>
      )}
    </Page>
  );
}

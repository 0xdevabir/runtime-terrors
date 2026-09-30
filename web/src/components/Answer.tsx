"use client";
import { Fragment } from "react";

/* Minimal, safe markdown for answers: paragraphs, "- " bullets, **bold**, _italic_,
   and [n] citation markers rendered as tappable chips. */
export function AnswerText({ text, onCite, streaming, valid }: { text: string; onCite: (n: number) => void; streaming?: boolean; valid?: number }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={`prose-answer t-body ${streaming ? "caret" : ""}`}>
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}><Inline s={l.replace(/^\s*[-•*]\s+/, "")} onCite={onCite} valid={valid} /></li>)}</ul>;
        }
        return (
          <Fragment key={i}>
            {lines.map((l, j) => /^\s*[-•*]\s+/.test(l)
              ? <ul key={j}><li><Inline s={l.replace(/^\s*[-•*]\s+/, "")} onCite={onCite} valid={valid} /></li></ul>
              : <p key={j}><Inline s={l} onCite={onCite} valid={valid} /></p>)}
          </Fragment>
        );
      })}
    </div>
  );
}

function Inline({ s, onCite, valid }: { s: string; onCite: (n: number) => void; valid?: number }) {
  const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_|\[\d{1,2}\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
        if (/^_[^_]+_$/.test(p)) return <em key={i} className="text-label-2">{p.slice(1, -1)}</em>;
        const m = p.match(/^\[(\d{1,2})\]$/);
        if (m) {
          const n = +m[1];
          const ok = !valid || n <= valid;
          return (
            <button key={i} onClick={() => ok && onCite(n)} title={ok ? `Show source ${n}` : "Citation not in retrieved sources"}
              className={`inline-grid place-items-center min-w-[18px] h-[18px] px-1 mx-[1px] rounded-[5px] t-cap2 font-bold align-[2px] btn-press ${ok ? "bg-tint/15 text-tint" : "bg-red/15 text-red line-through"}`}>
              {n}
            </button>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

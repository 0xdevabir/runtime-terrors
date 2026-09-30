"""Citation and dataset export: BibTeX, RIS, CSV."""
from __future__ import annotations

import csv
import io
import re

from pipeline import ontology as O


def _key(p: dict) -> str:
    first = (p["authors"][0].split()[-1] if p.get("authors") and p["authors"][0].split() else "anon")
    word = next((w for w in re.findall(r"[A-Za-z]{4,}", p["title"]) if w.lower() not in {"with", "from", "that", "this", "during"}), "paper")
    return re.sub(r"[^A-Za-z0-9]", "", f"{first}{p.get('year') or ''}{word.lower()}")


def _tex(s: str) -> str:
    return re.sub(r"([&%$#_{}])", r"\\\1", s or "")


def bibtex(papers: list[dict]) -> str:
    out = []
    for p in papers:
        fields = {"title": "{" + _tex(p["title"]) + "}", "author": " and ".join(_tex(a) for a in p.get("authors", [])),
                  "journal": _tex(p.get("journal") or ""), "year": str(p.get("year") or ""), "doi": p.get("doi") or "",
                  "url": p["url"], "note": f"PMCID: {p['id']}"}
        body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields.items() if v)
        out.append(f"@article{{{_key(p)},\n{body}\n}}")
    return "\n\n".join(out) + "\n"


def ris(papers: list[dict]) -> str:
    out = []
    for p in papers:
        lines = ["TY  - JOUR", f"TI  - {p['title']}"] + [f"AU  - {a}" for a in p.get("authors", [])]
        for tag, val in (("JO", p.get("journal")), ("PY", p.get("year")), ("DO", p.get("doi")), ("UR", p["url"]),
                         ("AB", p.get("abstract")), ("N1", f"PMCID: {p['id']}")):
            if val:
                lines.append(f"{tag}  - {val}")
        lines.append("ER  - ")
        out.append("\n".join(lines))
    return "\n\n".join(out) + "\n"


def _csv(rows: list[dict], cols: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=cols, extrasaction="ignore")
    w.writeheader()
    for r in rows:
        w.writerow({k: "; ".join(map(str, v)) if isinstance(v, (list, tuple)) else v for k, v in r.items()})
    return buf.getvalue()


def papers_csv(papers: list[dict]) -> str:
    lab = lambda ids: [O.BY_ID[i].label for i in ids or [] if i in O.BY_ID]
    rows = [p | {"authors": p.get("authors", []), "organisms": lab(p.get("organisms")), "stressors": lab(p.get("stressors")),
                 "tissues": lab(p.get("tissues")), "platforms": lab(p.get("platforms")),
                 "duration_days": (p.get("duration") or {}).get("days"), "key_finding": p["summary"]["key_finding"]} for p in papers]
    return _csv(rows, ["id", "title", "year", "journal", "doi", "url", "authors", "study_type", "organisms", "stressors", "tissues",
                       "platforms", "duration_days", "sample_size", "missions", "dose", "osdr_ids", "n_findings", "key_finding"])


def findings_csv(findings: list[dict]) -> str:
    return _csv(findings, ["id", "paper_id", "year", "study_type", "organism", "stressor", "tissue", "outcome", "direction",
                           "countermeasure", "countermeasure_effect", "genes", "confidence", "method", "section", "evidence_quote"])


def consensus_csv(cons: list[dict]) -> str:
    rows = [c | {f"votes_{d}": c["votes"].get(d, 0) for d in ("increase", "decrease", "no_change", "mixed")} |
            {"strength": c["strength"]["label"], "explanations": c["explanations"]} for c in cons]
    return _csv(rows, ["id", "stressor", "outcome", "tissue", "status", "majority", "agreement", "n_papers", "votes_increase",
                       "votes_decrease", "votes_no_change", "votes_mixed", "strength", "explanations"])

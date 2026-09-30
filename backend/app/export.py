"""Citation and dataset export: BibTeX, RIS, CSV."""
from __future__ import annotations

import csv
import io
import re

from pipeline import ontology as O


def _key(p: dict) -> str:
    a = (p.get("authors") or [""])[0].strip()
    first = (a.split(",")[0] if "," in a else (a.split() or ["anon"])[-1]) or "anon"
    word = next((w for w in re.findall(r"[A-Za-z]{4,}", p["title"]) if w.lower() not in {"with", "from", "that", "this", "during"}), "paper")
    return re.sub(r"[^A-Za-z0-9]", "", f"{first}{p.get('year') or ''}{word.lower()}")


def _tex(s: str) -> str:
    return re.sub(r"([&%$#_{}])", r"\\\1", s or "")


def bibtex(papers: list[dict]) -> str:
    out = []
    for p in papers:
        fields = {"title": "{" + _tex(p["title"]) + "}", "author": " and ".join(_tex(a) for a in p.get("authors", [])),
                  "journal": _tex(p.get("journal") or ""), "year": str(p.get("year") or ""), "doi": p.get("doi") or "",
                  "institution": _tex(p.get("center") or ""), "url": p["url"], "note": f"NTRS ID: {p['id']}"}
        body = ",\n".join(f"  {k} = {{{v}}}" for k, v in fields.items() if v)
        out.append(f"@{'article' if p.get('journal') else 'techreport'}{{{_key(p)},\n{body}\n}}")
    return "\n\n".join(out) + "\n"


def ris(papers: list[dict]) -> str:
    out = []
    for p in papers:
        lines = [f"TY  - {'JOUR' if p.get('journal') else 'RPRT'}", f"TI  - {p['title']}"] + [f"AU  - {a}" for a in p.get("authors", [])]
        for tag, val in (("JO", p.get("journal")), ("PY", p.get("year")), ("DO", p.get("doi")), ("UR", p["url"]),
                         ("PB", p.get("center")), ("AB", p.get("abstract")), ("N1", f"NTRS ID: {p['id']}")):
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
    rows = [p | {"authors": p.get("authors", []), "fuels": lab(p.get("fuels")), "conditions": lab(p.get("conditions")),
                 "geometries": lab(p.get("geometries")), "platforms": lab(p.get("platforms")),
                 "duration_seconds": (p.get("duration") or {}).get("seconds"), "key_finding": p["summary"]["key_finding"]} for p in papers]
    return _csv(rows, ["id", "title", "year", "center", "report_type", "doi", "url", "authors", "study_type", "fuels", "conditions",
                       "geometries", "platforms", "duration_seconds", "n_tests", "missions", "experiments", "atmosphere", "n_findings",
                       "key_finding"])


def findings_csv(findings: list[dict]) -> str:
    return _csv(findings, ["id", "paper_id", "year", "study_type", "fuel", "condition", "geometry", "outcome", "direction",
                           "countermeasure", "countermeasure_effect", "species", "confidence", "method", "section", "evidence_quote"])


def consensus_csv(cons: list[dict]) -> str:
    rows = [c | {f"votes_{d}": c["votes"].get(d, 0) for d in ("increase", "decrease", "no_change", "mixed")} |
            {"strength": c["strength"]["label"], "explanations": c["explanations"]} for c in cons]
    return _csv(rows, ["id", "condition", "outcome", "geometry", "status", "majority", "agreement", "n_papers", "votes_increase",
                       "votes_decrease", "votes_no_change", "votes_mixed", "strength", "explanations"])

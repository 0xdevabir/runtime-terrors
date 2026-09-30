"""Step 2 - clean NTRS records + extracted text into papers + sections + retrieval chunks.

Reads  data/processed/papers.csv            NTRS metadata (`python -m pipeline.ntrs meta`)
       data/raw/ntrs/fulltext/<id>.txt      NTRS-extracted report text (`python -m pipeline.ntrs fulltext`)
       data/processed/text/<id>.txt         optional PDF text fallback (`python -m pipeline.ntrs text`)
Writes data/kb/papers_raw.json  one record per report (metadata, abstract, section text, flags)
       data/kb/chunks.jsonl     ~150-250 word passages, never crossing a section boundary

NTRS text is OCR/PDF-extracted and unstructured, so sections are recovered from
heading lines (Abstract, Introduction, Experimental, Results, ...) and reading
stops at References / Bibliography.
"""
from __future__ import annotations

import csv
import html
import json
import re

from pipeline.ntrs import FULLTEXT_DIR, PAPERS_CSV, TEXT_DIR
from pipeline.paths import KB_DIR

SECTION_LABEL = {
    "ABSTRACT": "Abstract", "INTRO": "Introduction", "METHODS": "Methods", "RESULTS": "Results",
    "DISCUSS": "Discussion", "CONCL": "Conclusion", "FIG": "Figure caption",
}
WORDS_PER_CHUNK = 180
MAX_WORDS = 15000  # cap long reports (proceedings volumes, bibliographies) so one document cannot flood retrieval

# in-text reference markers and figure/table pointers: noise for retrieval and evidence quotes
CITE_NUM = re.compile(r"\s?\[\d{1,3}(?:\s?[-–,]\s?\d{1,3})*\]")
CITE_AUTHOR = re.compile(r"\s?\((?:(?:see |e\.g\., ?)?[A-Z][\w'\-]+(?: et al\.?| and [A-Z][\w'\-]+| & [A-Z][\w'\-]+)?,? (?:19|20)\d{2}[a-z]?(?:, ?(?:19|20)\d{2}[a-z]?)*;?\s?)+\)")
_FIG = r"(?:Supplementary |Suppl\.? )?(?:Fig(?:ure)?s?|Tables?)\.?\s?S?\d+[A-Za-z]?(?:\s?[,–\-]\s?S?\d*[A-Za-z]?)*"
FIG_REF = re.compile(r"\s?\((?:see )?" + _FIG + r"(?:\s?[;,]\s?(?:and )?" + _FIG + r")*\)")

# a heading line: optional numbering ("2.", "II.", "3.1") then a known section word, nothing much after
HEADING = re.compile(
    r"^\s*(?:(?:\d{1,2}(?:\.\d{1,2})*|[IVX]{1,4})[.)]?\s+)?"
    r"(abstract|summary|introduction|background|nomenclature|"
    r"experimental(?: (?:setup|set-up|apparatus|methods?|procedures?|hardware|approach))?|"
    r"(?:experiment|test) (?:description|setup|set-up|apparatus|hardware|procedures?)|apparatus|hardware|"
    r"(?:materials? and )?methods?|methodology|approach|numerical (?:model|method)s?|(?:the )?model|"
    r"results?(?: and discussion)?|discussion|observations|"
    r"conclusions?|concluding remarks|summary and conclusions?|"
    r"references|bibliography|literature cited|acknowledge?ments?)\s*:?\s*$",
    re.I,
)
STOP = ("references", "bibliography", "literature cited")
FIG_LINE = re.compile(r"^\s*(?:Fig(?:ure)?\.?|Table)\s*\d+[.:]", re.I)
TOC_LINE = re.compile(r"\.{5,}|(?:\. ){5,}")


def _section_type(head: str) -> str | None:
    h = head.lower()
    if h.startswith(STOP) or h.startswith("acknow") or h.startswith("nomenclature"):
        return None
    if "result" in h:
        return "RESULTS"
    if h.startswith("abstract") or h == "summary":
        return "ABSTRACT"
    if "conclu" in h:
        return "CONCL"
    if "discussion" in h or "observation" in h:
        return "DISCUSS"
    if h.startswith(("introduction", "background")):
        return "INTRO"
    return "METHODS"


def _clean(t: str) -> str:
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _clean_body(t: str) -> str:
    """_clean, plus strip reference markers and figure/table pointers from running text."""
    t = FIG_REF.sub("", CITE_AUTHOR.sub("", CITE_NUM.sub("", _clean(t))))
    return re.sub(r"\s+([.,;:])", r"\1", t).strip()


def parse_text(raw: str) -> list[dict]:
    """Recover (type, text) sections from report text. Paragraphs are blank-line separated."""
    raw = re.sub(r"(\w)-\n(\w)", r"\1\2", raw.replace("\r", ""))  # re-join words hyphenated across lines
    sections: list[dict] = []
    cur, saw_heading, words = "BODY", False, 0
    for block in re.split(r"\n\s*\n", raw):
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        if not lines:
            continue
        m = HEADING.match(lines[0]) if len(lines[0]) < 70 else None
        if m:
            head = m.group(1).lower()
            if head.startswith(STOP) and words > 300:
                break
            cur, saw_heading = _section_type(head) or "SKIP", True
            lines = lines[1:]
            if not lines:
                continue
        text = " ".join(lines)
        if TOC_LINE.search(text) or len(text) < 40:
            continue
        # mostly digits/symbols -> table residue or page furniture
        if sum(c.isalpha() for c in text) < 0.6 * len(text.replace(" ", "")):
            continue
        typ = "FIG" if FIG_LINE.match(text) else cur
        if typ == "SKIP":
            continue
        clean = _clean(text) if typ == "FIG" else _clean_body(text)
        sections.append({"type": typ, "text": clean})
        words += len(clean.split())
        if words >= MAX_WORDS:
            break
    # unheaded text: before the first heading it is front matter/introduction; with no headings at all
    # it is the whole report body, which still carries the findings
    for s in sections:
        if s["type"] == "BODY":
            s["type"] = "INTRO" if saw_heading else "DISCUSS"
    # reviews, briefings and OCR-garbled reports often have no results/conclusion heading: past the opening
    # paragraphs their running text is where the claims are
    if not any(s["type"] in ("RESULTS", "DISCUSS", "CONCL") for s in sections):
        body = [s for s in sections if s["type"] == "INTRO"]
        for s in body[2:]:
            s["type"] = "DISCUSS"
    return sections


def chunk_sections(pid: str, sections: list[dict]) -> list[dict]:
    chunks, buf, cur_type = [], [], None

    def flush():
        if buf:
            text = " ".join(buf)
            chunks.append({"id": f"{pid}#{len(chunks)}", "paper_id": pid, "section": cur_type, "text": text})

    for s in sections:
        if s["type"] != cur_type:
            flush()
            buf, cur_type = [], s["type"]
        words = s["text"].split()
        # split very long paragraphs on sentence boundaries
        if len(words) > WORDS_PER_CHUNK * 1.6:
            sents = re.split(r"(?<=[.!?])\s+(?=[A-Z])", s["text"])
            for sent in sents:
                if sum(len(b.split()) for b in buf) + len(sent.split()) > WORDS_PER_CHUNK:
                    flush()
                    buf = []
                buf.append(sent)
            continue
        if sum(len(b.split()) for b in buf) + len(words) > WORDS_PER_CHUNK * 1.3:
            flush()
            buf = []
        buf.append(s["text"])
    flush()
    return chunks


def _surname(author: str) -> str:
    """NTRS names come as 'Olson, Sandra L.' or 'Sandra Olson'."""
    a = author.strip()
    return (a.split(",")[0] if "," in a else (a.split() or [""])[-1]).lower()


def mark_duplicates(papers: list[dict]) -> int:
    """Flag near-duplicate versions: same DOI, or titles >= 95% similar with the same first author
    (NTRS often holds a conference paper, its presentation and a journal reprint).
    The richest version (full text, most words) is kept as the original."""
    from rapidfuzz import fuzz

    norm = lambda t: re.sub(r"[^a-z0-9 ]", "", (t or "").lower())
    first = lambda p: _surname(p["authors"][0]) if p["authors"] else ""
    kept: list[dict] = []
    for p in sorted(papers, key=lambda p: (not p["full_text"], -(p["word_count"] or 0))):
        dup = next((q for q in kept if (p["doi"] and p["doi"] == q["doi"]) or
                    (first(p) == first(q) and fuzz.token_sort_ratio(norm(p["title"]), norm(q["title"])) >= 95)), None)
        if dup:
            p["duplicate_of"] = dup["id"]
        else:
            kept.append(p)
    return len(papers) - len(kept)


def read_rows() -> list[dict]:
    with PAPERS_CSV.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main() -> None:
    KB_DIR.mkdir(parents=True, exist_ok=True)
    papers, chunks = [], []
    for row in read_rows():
        pid = row["id"]
        src = next((d / f"{pid}.txt" for d in (FULLTEXT_DIR, TEXT_DIR) if (d / f"{pid}.txt").exists()), None)
        body = parse_text(src.read_text(errors="ignore")) if src else []
        abstract = _clean_body(row["abstract"] or "")
        if abstract:  # the curated NTRS abstract beats an OCR'd one
            body = [s for s in body if s["type"] != "ABSTRACT"]
        sections = ([{"type": "ABSTRACT", "text": abstract}] if abstract else []) + body
        if not sections:
            sections = [{"type": "ABSTRACT", "text": _clean(row["title"])}]
        text_all = " ".join(s["text"] for s in sections)
        paper = {
            "id": pid, "ntrs_id": pid, "url": row["ntrs_url"] or f"https://ntrs.nasa.gov/citations/{pid}",
            "title": _clean(row["title"]), "year": int(row["year"]) if row["year"].isdigit() else None,
            "doi": row["doi"] or None, "authors": [a.strip() for a in row["authors"].split(";") if a.strip()],
            "journal": None, "center": row["center"] or None, "report_type": row["sti_type"] or None,
            "pdf_url": row["pdf_url"] or None,
            "keywords": [q.strip() for q in row["queries"].split("|") if q.strip()],
            "abstract": abstract, "full_text": len(text_all) > max(len(abstract), 400) * 2,
            "word_count": len(text_all.split()),
            "sections": sections,
        }
        papers.append(paper)
        chunks += chunk_sections(pid, sections)

    dups = mark_duplicates(papers)
    print(f"[process] {dups} near-duplicate reports flagged (kept for browsing, excluded from findings)")
    (KB_DIR / "papers_raw.json").write_text(json.dumps(papers))
    with open(KB_DIR / "chunks.jsonl", "w") as f:
        for c in chunks:
            f.write(json.dumps(c) + "\n")
    ft = sum(p["full_text"] for p in papers)
    print(f"[process] {len(papers)} reports ({ft} full text, {len(papers) - ft} abstract-only), {len(chunks)} chunks")


if __name__ == "__main__":
    main()

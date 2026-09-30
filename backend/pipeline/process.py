"""Step 2 - clean raw downloads into papers + sections + retrieval chunks.

Outputs (data/kb/):
  papers.json   one record per paper (metadata, abstract, section text, flags)
  chunks.jsonl  ~150-250 word passages, never crossing a section boundary
"""
from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET

import httpx

from pipeline.fetch import read_list
from pipeline.paths import KB_DIR, RAW_DIR

KEEP = {"TITLE", "ABSTRACT", "INTRO", "METHODS", "RESULTS", "DISCUSS", "CONCL", "FIG", "CASE"}
SECTION_LABEL = {
    "ABSTRACT": "Abstract", "INTRO": "Introduction", "METHODS": "Methods", "RESULTS": "Results",
    "DISCUSS": "Discussion", "CONCL": "Conclusion", "FIG": "Figure caption", "CASE": "Case report",
}
WORDS_PER_CHUNK = 180


def _clean(t: str) -> str:
    t = html.unescape(t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def parse_bioc(d: dict) -> dict:
    doc = d["bioc"]["documents"][0]
    front = doc["passages"][0]["infons"]
    authors = []
    for k in sorted((k for k in front if k.startswith("name_")), key=lambda k: int(k.split("_")[1])):
        parts = dict(p.split(":", 1) for p in front[k].split(";") if ":" in p)
        authors.append(f"{parts.get('given-names', '')} {parts.get('surname', '')}".strip())
    sections: list[dict] = []
    for p in doc["passages"]:
        st = p["infons"].get("section_type", "")
        typ = p["infons"].get("type", "")
        if st not in KEEP or st == "TITLE" or not p.get("text"):
            continue
        if typ.startswith("title") or typ.endswith("title_1") or typ in ("fig_title_caption",):
            continue
        sections.append({"type": st, "text": _clean(p["text"])})
    title = _clean(doc["passages"][0]["text"]) if doc["passages"] else d["row"]["title"]
    return {
        "title": title or d["row"]["title"],
        "year": int(front["year"]) if str(front.get("year", "")).isdigit() else None,
        "doi": front.get("article-id_doi"),
        "pmid": front.get("article-id_pmid"),
        "authors": authors,
        "keywords": [k.strip() for k in re.split(r"[;,]", front.get("kwd", "")) if k.strip()],
        "sections": sections,
        "full_text": True,
    }


def parse_xml(d: dict) -> dict:
    x = d["xml"]
    x = re.sub(r"<!DOCTYPE[^>]*>", "", x)
    root = ET.fromstring(x)

    def txt(el):
        return _clean("".join(el.itertext())) if el is not None else ""

    art = root.find(".//article")
    art = art if art is not None else root
    meta = art.find(".//article-meta")
    year = None
    for pd in meta.findall(".//pub-date") if meta is not None else []:
        y = pd.findtext("year")
        if y and y.isdigit():
            year = int(y)
            break
    ids = {i.get("pub-id-type"): i.text for i in (meta.findall("article-id") if meta is not None else [])}
    authors = []
    for c in art.findall(".//contrib[@contrib-type='author']"):
        n = c.find("name")
        if n is not None:
            authors.append(f"{n.findtext('given-names', '')} {n.findtext('surname', '')}".strip())
    sections = []
    for ab in art.findall(".//abstract"):
        if ab.get("abstract-type") in ("graphical", "teaser"):
            continue
        paras = [txt(p) for p in ab.iter("p")] or [txt(ab)]
        sections += [{"type": "ABSTRACT", "text": p} for p in paras if p]
    body = art.find(".//body")
    if body is not None:
        for sec in body.findall("sec"):
            head = (sec.findtext("title") or "").lower()
            st = ("METHODS" if "method" in head or "material" in head else "RESULTS" if "result" in head
                  else "DISCUSS" if "discussion" in head else "CONCL" if "conclu" in head else "INTRO")
            sections += [{"type": st, "text": txt(p)} for p in sec.iter("p") if txt(p)]
    return {
        "title": txt(art.find(".//article-title")) or d["row"]["title"],
        "year": year,
        "doi": ids.get("doi"),
        "pmid": ids.get("pmid"),
        "authors": authors,
        "keywords": [txt(k) for k in art.findall(".//kwd")],
        "journal": txt(art.find(".//journal-title")) or None,
        "sections": sections,
        "full_text": body is not None,
    }


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


def fetch_journals(pmids: list[str]) -> dict[str, str]:
    """One-shot esummary call for journal names (BioC lacks them)."""
    out: dict[str, str] = {}
    try:
        for i in range(0, len(pmids), 200):
            r = httpx.post("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
                           data={"db": "pubmed", "id": ",".join(pmids[i:i + 200]), "retmode": "json"}, timeout=60)
            res = r.json()["result"]
            for uid in res.get("uids", []):
                out[uid] = res[uid].get("fulljournalname") or res[uid].get("source")
    except Exception as exc:  # network optional
        print(f"[process] journal lookup skipped: {exc}")
    return out


def main() -> None:
    KB_DIR.mkdir(parents=True, exist_ok=True)
    rows = read_list()
    papers, chunks = [], []
    for row in rows:
        f = RAW_DIR / f"{row['pmcid']}.json"
        if not f.exists():
            continue
        d = json.loads(f.read_text())
        try:
            p = parse_bioc(d) if d["kind"] == "bioc" else parse_xml(d)
        except Exception as exc:
            print(f"[process] {row['pmcid']} parse error: {exc}")
            continue
        pid = row["pmcid"]
        abstract = " ".join(s["text"] for s in p["sections"] if s["type"] == "ABSTRACT")
        text_all = " ".join(s["text"] for s in p["sections"])
        paper = {
            "id": pid, "pmcid": pid, "url": row["link"], "title": p["title"], "year": p["year"],
            "doi": p["doi"], "pmid": p["pmid"], "authors": p["authors"], "journal": p.get("journal"),
            "keywords": p["keywords"], "abstract": abstract, "full_text": p["full_text"] and len(text_all) > len(abstract) * 2,
            "osdr_ids": sorted(set(m.upper().replace(" ", "") for m in re.findall(r"\b(?:GLDS|OSD)-\d{1,4}\b", text_all, re.I))),
            "word_count": len(text_all.split()),
            "sections": p["sections"],
        }
        papers.append(paper)
        chunks += chunk_sections(pid, [{"type": "ABSTRACT", "text": p["title"]}] + p["sections"] if not abstract else p["sections"])

    missing = [p["pmid"] for p in papers if p["pmid"] and not p["journal"]]
    journals = fetch_journals(missing) if missing else {}
    for p in papers:
        if not p["journal"] and p["pmid"] in journals:
            p["journal"] = journals[p["pmid"]]

    (KB_DIR / "papers_raw.json").write_text(json.dumps(papers))
    with open(KB_DIR / "chunks.jsonl", "w") as f:
        for c in chunks:
            f.write(json.dumps(c) + "\n")
    ft = sum(p["full_text"] for p in papers)
    print(f"[process] {len(papers)} papers ({ft} full text, {len(papers) - ft} abstract-only), {len(chunks)} chunks")


if __name__ == "__main__":
    main()

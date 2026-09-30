"""NTRS (NASA Technical Reports Server) combustion literature dataset.

    uv run python -m pipeline.ntrs meta    # search API -> data/raw/ntrs/metadata/*.json -> data/processed/papers.csv
    uv run python -m pipeline.ntrs fulltext  # NTRS-extracted text -> data/raw/ntrs/fulltext/<id>.txt (used by process)
    uv run python -m pipeline.ntrs pdfs    # download PDFs -> data/raw/ntrs/pdfs/<id>.pdf (large; optional)
    uv run python -m pipeline.ntrs text    # PDF text -> data/processed/text/<id>.txt
    uv run python -m pipeline.ntrs audit   # counts -> data/processed/ntrs_audit.json
    uv run python -m pipeline.ntrs all

Public API, no login. Every step is cached on disk and skips work already done.
Note: the API ignores `page.number`; paging uses `page.from` (a record offset).
"""
from __future__ import annotations

import csv
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import httpx

from pipeline.paths import DATA, RAW_DIR

API = "https://ntrs.nasa.gov"
QUERIES = [
    "microgravity combustion",
    "flame spread microgravity",
    "Saffire spacecraft fire",
    "spacecraft fire safety",
    "flammability oxygen concentration",
    "droplet combustion microgravity",
    "SoFIE solid fuel ignition extinction",
]
PAGE_SIZE = 100
DELAY = 1.0  # seconds between requests (be polite)
MAX_PDF_BYTES = 1_000_000_000  # stop and ask before the PDF cache grows past 1 GB

NTRS_DIR = RAW_DIR / "ntrs"
META_DIR = NTRS_DIR / "metadata"
PDF_DIR = NTRS_DIR / "pdfs"
FULLTEXT_DIR = NTRS_DIR / "fulltext"
FAIL_LOG = NTRS_DIR / "failures.log"
PROC_DIR = DATA / "processed"
TEXT_DIR = PROC_DIR / "text"
PAPERS_CSV = PROC_DIR / "papers.csv"
AUDIT_JSON = PROC_DIR / "ntrs_audit.json"

_last = 0.0
_lock = threading.Lock()
FULLTEXT_WORKERS = 6  # NTRS takes 10s-2min to serve one text file; overlap a few (request starts stay 1/s)


def _get(client: httpx.Client, url: str, **kw) -> httpx.Response:
    """GET with a 1 req/s throttle and retries on network errors / 429 / 5xx."""
    global _last
    for attempt in range(5):
        with _lock:  # paces request starts across threads
            wait = DELAY - (time.monotonic() - _last)
            if wait > 0:
                time.sleep(wait)
            _last = time.monotonic()
        try:
            r = client.get(url, **kw)
            if r.status_code == 429 or r.status_code >= 500:
                raise httpx.HTTPStatusError(f"HTTP {r.status_code}", request=r.request, response=r)
            return r
        except httpx.HTTPError as e:
            if attempt == 4:
                raise
            print(f"  retry {attempt + 1} {url}: {e}", file=sys.stderr)
            time.sleep(2 ** (attempt + 1))
    raise RuntimeError("unreachable")


def _log_failure(rid, url: str, reason: str) -> None:
    FAIL_LOG.parent.mkdir(parents=True, exist_ok=True)
    with FAIL_LOG.open("a") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat()}\t{rid}\t{url}\t{reason}\n")


def _slug(q: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", q.lower()).strip("_")


# ---------- 1. metadata ----------

def fetch_meta(client: httpx.Client) -> None:
    META_DIR.mkdir(parents=True, exist_ok=True)
    for q in QUERIES:
        offset = 0
        while True:
            out = META_DIR / f"{_slug(q)}__from{offset:05d}.json"
            if out.exists():
                d = json.loads(out.read_text())
            else:
                r = _get(client, f"{API}/api/citations/search",
                         params={"q": q, "page.size": PAGE_SIZE, "page.from": offset})
                r.raise_for_status()
                d = r.json()
                out.write_text(json.dumps({"query": q, "from": offset, "fetched": datetime.now(timezone.utc).isoformat(),
                                           "response": d}))
                d = {"response": d}
            resp = d["response"]
            n = len(resp.get("results", []))
            total = resp.get("stats", {}).get("total", 0)
            print(f"  {q!r} from={offset}: {n} results (total {total})")
            offset += n
            if n == 0 or offset >= total:
                break


def _pdf_link(rec: dict) -> str | None:
    for d in rec.get("downloads") or []:
        link = (d.get("links") or {}).get("pdf")
        if link and (d.get("mimetype") == "application/pdf" or link.lower().endswith(".pdf")):
            return API + link
    return None


def load_records() -> dict[str, dict]:
    """Deduplicate all cached search pages by NTRS record id; remember which queries hit each.

    Ids are ints for NTRS submissions and strings for CHORUS-linked journal articles, so key by str.
    """
    recs: dict[str, dict] = {}
    for f in sorted(META_DIR.glob("*.json")):
        d = json.loads(f.read_text())
        for r in d["response"].get("results", []):
            rec = recs.setdefault(str(r["id"]), {**r, "_queries": []})
            if d["query"] not in rec["_queries"]:
                rec["_queries"].append(d["query"])
    return recs


def _year(rec: dict) -> str:
    for p in rec.get("publications") or []:
        for k in ("publicationDate", "issuePublicationDate"):
            if p.get(k):
                return p[k][:4]
    return ""  # unknown publication year: left blank, not guessed from submission date


def write_papers_csv(recs: dict[str, dict]) -> None:
    PROC_DIR.mkdir(parents=True, exist_ok=True)
    cols = ["id", "title", "year", "authors", "abstract", "center", "pdf_url", "has_pdf",
            "sti_type", "disseminated", "doi", "source_index", "ntrs_url", "queries"]
    with PAPERS_CSV.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for rid in sorted(recs):
            r = recs[rid]
            authors = [a["meta"]["author"]["name"] for a in sorted(r.get("authorAffiliations") or [],
                                                                    key=lambda a: a.get("sequence", 0))
                       if a.get("meta", {}).get("author", {}).get("name")]
            pdf = _pdf_link(r)
            w.writerow({
                "id": rid,
                "title": (r.get("title") or "").strip(),
                "year": _year(r),
                "authors": "; ".join(authors),
                "abstract": " ".join((r.get("abstract") or "").split()),
                "center": (r.get("center") or {}).get("code", ""),
                "pdf_url": pdf or "",
                "has_pdf": bool(pdf),
                "sti_type": r.get("stiType", ""),
                "disseminated": r.get("disseminated", ""),
                "doi": next((p["doi"] for p in r.get("publications") or [] if p.get("doi")), ""),
                "source_index": (r.get("index") or "").split("-")[0],  # "submissions" or "chorus"
                "ntrs_url": f"{API}/citations/{rid}",
                "queries": " | ".join(r["_queries"]),
            })
    print(f"  wrote {PAPERS_CSV} ({len(recs)} unique records)")


# ---------- 2. full text ----------

def _fulltext_link(rec: dict) -> str | None:
    for d in rec.get("downloads") or []:
        link = (d.get("links") or {}).get("fulltext")
        if link:
            return API + link
    return None


def fetch_fulltext(client: httpx.Client) -> None:
    """NTRS serves its own extracted text per document: far smaller than the PDFs, and it covers scans."""
    FULLTEXT_DIR.mkdir(parents=True, exist_ok=True)
    todo = [(rid, link) for rid, r in sorted(load_records().items())
            if (link := _fulltext_link(r)) and not (FULLTEXT_DIR / f"{rid}.txt").exists()]
    done = 0

    def one(item: tuple[str, str]) -> None:
        nonlocal done
        rid, url = item
        out = FULLTEXT_DIR / f"{rid}.txt"
        try:
            r = _get(client, quote(url, safe=":/%"), follow_redirects=True, timeout=300)
            if r.status_code != 200:
                _log_failure(rid, url, f"fulltext HTTP {r.status_code}")
                return
            tmp = out.with_suffix(".part")
            tmp.write_text(r.text)
            tmp.rename(out)
        except Exception as e:  # noqa: BLE001 - log and continue with the next document
            _log_failure(rid, url, repr(e))
        done += 1
        if done % 25 == 0:
            print(f"  fulltext {done}/{len(todo)}", flush=True)

    with ThreadPoolExecutor(FULLTEXT_WORKERS) as pool:
        list(pool.map(one, todo))


# ---------- 3. PDFs ----------

def fetch_pdfs(client: httpx.Client) -> None:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    recs = load_records()
    todo = [(rid, _pdf_link(r)) for rid, r in sorted(recs.items()) if _pdf_link(r)]
    used = sum(p.stat().st_size for p in PDF_DIR.glob("*.pdf"))
    for i, (rid, url) in enumerate(todo, 1):
        out = PDF_DIR / f"{rid}.pdf"
        if out.exists() and out.stat().st_size > 0:
            continue
        if used >= MAX_PDF_BYTES:
            print(f"  STOP: PDF cache reached {used / 1e9:.2f} GB (cap {MAX_PDF_BYTES / 1e9:.1f} GB); "
                  f"{len(todo) - i + 1} PDFs not fetched. Raise MAX_PDF_BYTES to continue.")
            return
        try:
            r = _get(client, quote(url, safe=":/%"), follow_redirects=True, timeout=120)
            if r.status_code != 200:
                _log_failure(rid, url, f"HTTP {r.status_code}")
                continue
            if not r.content.startswith(b"%PDF"):
                _log_failure(rid, url, f"not a PDF (content-type {r.headers.get('content-type')})")
                continue
            tmp = out.with_suffix(".part")
            tmp.write_bytes(r.content)
            tmp.rename(out)
            used += len(r.content)
            print(f"  [{i}/{len(todo)}] {rid} {len(r.content) // 1024} KB")
        except Exception as e:  # noqa: BLE001 - log and continue with the next PDF
            _log_failure(rid, url, repr(e))


# ---------- 3. text ----------

def extract_text() -> None:
    from pypdf import PdfReader

    TEXT_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    for i, pdf in enumerate(pdfs, 1):
        out = TEXT_DIR / f"{pdf.stem}.txt"
        if out.exists():
            continue
        try:
            reader = PdfReader(pdf)
            text = "\n\n".join((p.extract_text() or "") for p in reader.pages)
            out.write_text(text)
            if len(text.strip()) < 200:  # likely a scanned PDF with no text layer (no OCR here)
                _log_failure(pdf.stem, str(pdf), f"little/no extractable text ({len(text.strip())} chars, {len(reader.pages)} pages)")
        except Exception as e:  # noqa: BLE001
            _log_failure(pdf.stem, str(pdf), f"text extraction failed: {e!r}")
        if i % 50 == 0:
            print(f"  text {i}/{len(pdfs)}")


# ---------- 4. audit ----------

def audit() -> dict:
    recs = load_records()
    rows = list(csv.DictReader(PAPERS_CSV.open()))
    pdfs = {p.stem: p.stat().st_size for p in PDF_DIR.glob("*.pdf")}
    texts = {p.stem: len(p.read_text(errors="ignore").strip()) for p in TEXT_DIR.glob("*.txt")}
    per_query_hits = {}
    for f in META_DIR.glob("*.json"):
        d = json.loads(f.read_text())
        per_query_hits[d["query"]] = d["response"].get("stats", {}).get("total", 0)
    with_link = [r for r in rows if r["has_pdf"] == "True"]
    a = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "queries_total_hits": per_query_hits,
        "unique_records": len(recs),
        "records_with_pdf_link": len(with_link),
        "records_without_pdf_link": len(rows) - len(with_link),
        "records_without_pdf_and_empty_abstract": sum(1 for r in rows if r["has_pdf"] != "True" and not r["abstract"]),
        "records_with_empty_abstract": sum(1 for r in rows if not r["abstract"]),
        "records_missing_year": sum(1 for r in rows if not r["year"]),
        "pdfs_downloaded": len(pdfs),
        "pdf_bytes_total": sum(pdfs.values()),
        "pdfs_not_downloaded": len(with_link) - len(pdfs),  # failed or not yet attempted; see failures.log
        "pdf_failures_logged": sum(1 for _ in FAIL_LOG.open()) if FAIL_LOG.exists() else 0,
        "texts_extracted": len(texts),
        "texts_under_200_chars": sum(1 for n in texts.values() if n < 200),
        "text_chars_total": sum(texts.values()),
        "year_distribution": dict(sorted(Counter(r["year"] or "unknown" for r in rows).items())),
        "decade_distribution": dict(sorted(Counter((r["year"][:3] + "0s") if r["year"] else "unknown" for r in rows).items())),
        "sti_type": dict(Counter(r["sti_type"] for r in rows).most_common()),
        "center": dict(Counter(r["center"] or "none" for r in rows).most_common()),
    }
    AUDIT_JSON.write_text(json.dumps(a, indent=2))
    print(json.dumps(a, indent=2))
    return a


def main() -> None:
    step = sys.argv[1] if len(sys.argv) > 1 else "all"
    headers = {"User-Agent": "flame-in-freefall-dataset/0.1 (NASA Space Apps 2026; research use)"}
    with httpx.Client(headers=headers, timeout=60) as client:
        if step in ("meta", "all"):
            fetch_meta(client)
            write_papers_csv(load_records())
        if step in ("fulltext", "all"):
            fetch_fulltext(client)
        if step == "pdfs":
            fetch_pdfs(client)
    if step == "text":
        extract_text()
    if step in ("audit", "all"):
        audit()


if __name__ == "__main__":
    main()

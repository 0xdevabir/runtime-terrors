"""Step 1 - download full text for every paper in the NASA SB publication list.

Source list: data/SB_publication_PMC.csv (github.com/jgalazka/SB_publications)
Full text:   PMC BioC JSON (sectioned: TITLE / ABSTRACT / INTRO / METHODS / RESULTS / DISCUSS ...)
Fallback:    NCBI E-utilities abstract when BioC has no open-access full text.

Idempotent: files already in data/raw/ are skipped.
"""
from __future__ import annotations

import asyncio
import csv
import json
import re
import sys

import httpx

from pipeline.paths import CSV_PATH, RAW_DIR

BIOC = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/{pmcid}/unicode"
EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
CONCURRENCY = 3  # NCBI asks for <= 3 req/s without an API key


def read_list() -> list[dict]:
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            m = re.search(r"PMC\d+", r["Link"])
            if m:
                rows.append({"pmcid": m.group(0), "title": r["Title"].strip(), "link": r["Link"].strip()})
    # the CSV has a few duplicate rows
    seen, out = set(), []
    for r in rows:
        if r["pmcid"] not in seen:
            seen.add(r["pmcid"])
            out.append(r)
    return out


async def fetch_one(client: httpx.AsyncClient, sem: asyncio.Semaphore, row: dict) -> str:
    out = RAW_DIR / f"{row['pmcid']}.json"
    if out.exists():
        return "cached"
    async with sem:
        for attempt in range(4):
            try:
                r = await client.get(BIOC.format(pmcid=row["pmcid"]))
                if r.status_code == 200 and r.text.lstrip().startswith(("[", "{")):
                    data = r.json()
                    data = data[0] if isinstance(data, list) else data
                    out.write_text(json.dumps({"kind": "bioc", "row": row, "bioc": data}))
                    return "bioc"
                if r.status_code in (429, 500, 502, 503):
                    await asyncio.sleep(2 * (attempt + 1))
                    continue
                break  # not in the OA subset -> fall back
            except (httpx.HTTPError, ValueError):
                await asyncio.sleep(2 * (attempt + 1))
        # fallback: abstract XML from PubMed Central via efetch
        try:
            r = await client.get(EUTILS, params={"db": "pmc", "id": row["pmcid"].removeprefix("PMC"), "rettype": "xml"})
            if r.status_code == 200 and "<article" in r.text:
                out.write_text(json.dumps({"kind": "pmc_xml", "row": row, "xml": r.text}))
                return "xml"
        except httpx.HTTPError:
            pass
        await asyncio.sleep(0.35)
    return "failed"


async def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    rows = read_list()
    sem = asyncio.Semaphore(CONCURRENCY)
    stats: dict[str, int] = {}
    async with httpx.AsyncClient(timeout=60, headers={"User-Agent": "SpaceBioAtlas/0.1 (NASA Space Apps)"}) as client:
        tasks = [fetch_one(client, sem, r) for r in rows]
        for i, coro in enumerate(asyncio.as_completed(tasks), 1):
            s = await coro
            stats[s] = stats.get(s, 0) + 1
            if i % 25 == 0 or i == len(rows):
                print(f"[fetch] {i}/{len(rows)} {stats}", flush=True)
    failed = stats.get("failed", 0)
    print(f"[fetch] done: {stats}")
    sys.exit(0 if failed < len(rows) * 0.1 else 1)


if __name__ == "__main__":
    asyncio.run(main())

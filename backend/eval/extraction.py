"""Human-labelled extraction accuracy.

1. Draw a stratified sample of extracted findings into a CSV with empty label columns:
       uv run python -m eval.extraction sample --n 100
2. A person fills `fuel_ok`, `condition_ok`, `geometry_ok`, `outcome_ok`, `direction_ok` with y / n
   (leave blank when unsure) by reading `evidence_quote` against the report.
3. `run_eval` (or `uv run python -m eval.extraction score`) reports per-field precision.
Labels must come from people: nothing here guesses them.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path

from pipeline import ontology as O
from pipeline.paths import KB_DIR

LABELS = Path(__file__).parent / "extraction_labels.csv"
FIELDS = ("fuel", "condition", "geometry", "outcome", "direction")


def sample(n: int, seed: int = 7) -> None:
    findings = json.loads((KB_DIR / "findings.json").read_text())
    papers = {p["id"]: p for p in json.loads((KB_DIR / "papers.json").read_text())}
    rng = random.Random(seed)
    by_outcome: dict[str, list] = {}
    for f in findings:
        by_outcome.setdefault(f["outcome"], []).append(f)
    picked = []
    while len(picked) < min(n, len(findings)):  # round-robin over outcomes so rare ones are represented
        for fs in by_outcome.values():
            if fs and len(picked) < n:
                picked.append(fs.pop(rng.randrange(len(fs))))
    lab = lambda i: O.BY_ID[i].label if i in O.BY_ID else ""
    with open(LABELS, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["finding_id", "paper_id", "paper_title", "evidence_quote", "method", *FIELDS, *(f"{x}_ok" for x in FIELDS), "notes"])
        for f in picked:
            w.writerow([f["id"], f["paper_id"], papers[f["paper_id"]]["title"], f["evidence_quote"], f.get("method"),
                        lab(f.get("fuel")), lab(f["condition"]), lab(f.get("geometry")), lab(f["outcome"]), f["direction"],
                        *[""] * len(FIELDS), ""])
    print(f"[extraction] wrote {len(picked)} findings to {LABELS} - fill the *_ok columns with y/n")


def extraction_metrics() -> dict | None:
    if not LABELS.exists():
        return None
    rows = list(csv.DictReader(open(LABELS)))
    out, labelled = {}, 0
    for x in FIELDS:
        vals = [r[f"{x}_ok"].strip().lower() for r in rows if r.get(f"{x}_ok", "").strip().lower() in ("y", "n")]
        labelled = max(labelled, len(vals))
        out[x] = {"precision": round(vals.count("y") / len(vals), 3), "n": len(vals)} if vals else None
    if not labelled:
        return {"status": "unlabelled", "n_sampled": len(rows)}
    return {"status": "labelled", "n_sampled": len(rows), "fields": out}


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample")
    s.add_argument("--n", type=int, default=100)
    sub.add_parser("score")
    a = ap.parse_args()
    if a.cmd == "sample":
        sample(a.n)
    else:
        print(json.dumps(extraction_metrics(), indent=1))


if __name__ == "__main__":
    main()

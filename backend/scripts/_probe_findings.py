"""One-off probe of findings/papers for the predict feature. Delete after use."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

KB = Path(__file__).resolve().parents[2] / "data" / "kb"
findings = json.loads((KB / "findings.json").read_text())
papers = {p["id"]: p for p in json.loads((KB / "papers.json").read_text())}
print("n_findings", len(findings))
print("finding keys", sorted(findings[0].keys()))
print("sample finding", json.dumps(findings[0], indent=2)[:1400])
p0 = next(iter(papers.values()))
print("paper keys", sorted(p0.keys()))
interesting = [
    "id", "title", "atmosphere", "fuels", "conditions", "study_type",
    "platforms", "duration", "missions", "experiments", "n_tests",
]
print("paper sample", json.dumps({k: p0.get(k) for k in interesting}, indent=2)[:1600])
atm = Counter()
o2: list[float] = []
press: list[float] = []
for p in papers.values():
    a = p.get("atmosphere")
    atm[type(a).__name__ if a is not None else "None"] += 1
    if isinstance(a, dict):
        if a.get("o2_percent") is not None:
            o2.append(float(a["o2_percent"]))
        if a.get("pressure_kpa") is not None:
            press.append(float(a["pressure_kpa"]))
print("atmosphere types", dict(atm))
print("o2 n", len(o2), "min", min(o2) if o2 else None, "max", max(o2) if o2 else None)
print("press n", len(press), "min", min(press) if press else None, "max", max(press) if press else None)
print("top outcomes", Counter(f.get("outcome") for f in findings).most_common(15))
print("dirs", Counter(f.get("direction") for f in findings))
print("top fuels", Counter(f.get("fuel") for f in findings).most_common(15))
print("top conds", Counter(f.get("condition") for f in findings).most_common(15))
print(
    "papers with o2",
    sum(
        1
        for p in papers.values()
        if isinstance(p.get("atmosphere"), dict) and p["atmosphere"].get("o2_percent") is not None
    ),
)
# how many findings link to papers with atmosphere
linked = 0
for f in findings:
    p = papers.get(f["paper_id"])
    if not p:
        continue
    a = p.get("atmosphere")
    if isinstance(a, dict) and a.get("o2_percent") is not None:
        linked += 1
print("findings with paper o2", linked)

"""Probe papers_raw for atmosphere richness."""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

KB = Path(__file__).resolve().parents[2] / "data" / "kb"
raw = json.loads((KB / "papers_raw.json").read_text())
print("n", len(raw))
print("keys", sorted(raw[0].keys()))
atm = Counter()
o2ish = 0
for p in raw:
    a = p.get("atmosphere")
    atm[type(a).__name__ if a is not None else "None"] += 1
    if isinstance(a, dict) and a.get("o2_percent") is not None:
        o2ish += 1
    elif isinstance(a, str) and "%" in a:
        o2ish += 1
print("atm types", dict(atm), "with o2-ish", o2ish)
# sample strings with O2
samples = [p["atmosphere"] for p in raw if isinstance(p.get("atmosphere"), str) and "O" in p["atmosphere"]][:15]
print("o2 samples", samples)
# LLM findings might have magnitude
findings = json.loads((KB / "findings.json").read_text())
print("finding has magnitude?", "magnitude" in findings[0], findings[0])

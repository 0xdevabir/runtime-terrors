"""Probe atmosphere string formats and flammability-related findings."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

KB = Path(__file__).resolve().parents[2] / "data" / "kb"
papers = json.loads((KB / "papers.json").read_text())
findings = json.loads((KB / "findings.json").read_text())

O2 = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*O")
P = re.compile(r"(\d+(?:\.\d+)?)\s*(kPa|psia|atm|bar|mmHg|Torr)", re.I)

atm_strs = [p["atmosphere"] for p in papers if isinstance(p.get("atmosphere"), str) and p["atmosphere"].strip()]
print("n atm strings", len(atm_strs))
print("samples", atm_strs[:20])
parsed = 0
for s in atm_strs:
    if O2.search(s) or P.search(s):
        parsed += 1
print("parseable", parsed)

# findings useful for flame-spread regime
spread_outs = {
    "outcome:flame_spread",
    "outcome:flammability",
    "outcome:extinction",
    "outcome:burning_rate",
    "outcome:ignition",
    "outcome:smoldering",
}
rows = [f for f in findings if f.get("outcome") in spread_outs]
print("spread-related findings", len(rows))
print("by outcome", Counter(f["outcome"] for f in rows))
print("by direction", Counter(f["direction"] for f in rows))
print("by study", Counter(f.get("study_type") for f in rows))

# papers with atm among those findings
pids = {f["paper_id"] for f in rows}
with_atm = sum(1 for pid in pids if any(p["id"] == pid and p.get("atmosphere") for p in papers))
print("unique papers in spread findings", len(pids), "with atm string", with_atm)

# condition elevated_o2 / reduced_pressure among findings
print("elevated_o2 findings", sum(1 for f in findings if f["condition"] == "condition:elevated_o2"))
print("reduced_pressure findings", sum(1 for f in findings if f["condition"] == "condition:reduced_pressure"))

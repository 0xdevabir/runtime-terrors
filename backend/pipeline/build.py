"""Step 3 - turn papers into the knowledge base the API serves.

Reads  data/kb/papers.json, data/kb/chunks.jsonl, data/llm/*.json (optional)
Writes data/kb/{papers,findings,entities,graph,consensus,gaps,trends,risk_evidence,hypotheses,stats}.json
       data/kb/chunks.jsonl (entity-tagged), data/kb/bm25/, data/kb/embeddings.npy (optional)
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from itertools import combinations

import numpy as np
from rapidfuzz import fuzz

from pipeline import extract_rules as R
from pipeline import ontology as O
from pipeline.paths import KB_DIR, LLM_DIR
from pipeline.risks import RISKS

# long-duration orbital tests are the gold standard; drop towers/parabolic flights give seconds of freefall
STUDY_WEIGHT = {"flight": 1.0, "both": 1.0, "short_ug": 0.7, "ground": 0.5, "computational": 0.3, "review": 0.2}
# real spacecraft materials matter most for crew fire safety
FUEL_WEIGHT = {"Spacecraft material": 1.0, "Solid": 0.8, "Liquid": 0.6, "Gas": 0.6}
FUEL_GROUPS = ["Spacecraft material", "Solid", "Liquid", "Gas"]


def lc(label: str) -> str:
    """Lower-case a label for mid-sentence use, keeping acronyms (PMMA, ISS, CO₂)."""
    return " ".join(w if sum(ch.isupper() for ch in w) > 1 else w.lower() for w in label.split())


def fmt_seconds(s: float) -> str:
    if s < 120:
        return f"{s:g} s"
    if s < 7200:
        return f"{s / 60:.0f} min"
    if s < 172800:
        return f"{s / 3600:.0f} h"
    return f"{s / 86400:.0f} days"


def strength(weight_sum: float, scale: float = 3) -> dict:
    s = 1 - math.exp(-weight_sum / scale)
    label = "strong" if s >= 0.75 else "moderate" if s >= 0.45 else "limited" if s > 0 else "none"
    return {"score": round(s, 3), "label": label}


def quote_ok(quote: str, source: str) -> bool:
    if not quote or len(quote) < 20:
        return False
    if quote in source:
        return True
    return fuzz.partial_ratio(quote, source, score_cutoff=90) > 0


# ----------------------------------------------------------------------------- per-paper extraction
def extract_all(papers: list[dict]) -> tuple[list[dict], dict]:
    findings, qstats = [], Counter()
    for p in papers:
        source = " ".join(s["text"] for s in p["sections"])
        profile = R.paper_profile(p)
        llm_file = LLM_DIR / f"{p['id']}.json"
        if llm_file.exists():
            L = json.loads(llm_file.read_text())
            profile.update({k: [x for x in L[k] if x in O.BY_ID] for k in ("fuels", "conditions", "platforms", "geometries") if L.get(k)})
            profile["study_type"] = L.get("study_type") or profile["study_type"]
            if L.get("duration_seconds"):
                s = L["duration_seconds"]
                profile["duration"] = {"value": s, "unit": "s", "seconds": s, "inferred": False}
            for k in ("n_tests", "atmosphere"):
                profile[k] = L.get(k) or profile[k]
            for k in ("missions", "experiments", "limitations"):
                profile[k] = L.get(k) or profile[k]
            fnds = []
            for f in L["findings"]:
                qstats["llm_total"] += 1
                if quote_ok(f["evidence_quote"], source):
                    qstats["llm_verified"] += 1
                    fnds.append({**f, "method": "llm"})
            p["summary"] = {"l1": L["summary_lay"], "l2": L["summary_manager"], "l3": L["summary_scientist"],
                            "key_finding": L["key_finding"], "method": "llm"}
        else:
            fnds = R.findings(p, profile)
            qstats["rules_total"] += len(fnds)
            qstats["rules_verified"] += sum(quote_ok(f["evidence_quote"], source) for f in fnds)
            p["summary"] = R.extractive_summaries(p, profile, fnds)
        p.update(profile)
        if p.get("duplicate_of"):  # a near-duplicate version must not double-count votes
            qstats["duplicate_papers"] += 1
            fnds = []
        for i, f in enumerate(fnds):
            f.update({"id": f"{p['id']}:f{i}", "paper_id": p["id"], "year": p["year"], "study_type": p["study_type"]})
            f["species"] = [s for s in f.get("species") or [] if s in O.BY_ID]
            findings.append(f)
        p["n_findings"] = len(fnds)
    return findings, dict(qstats)


def finding_weight(f: dict, paper_by_id: dict) -> float:
    fuel = O.BY_ID.get(f.get("fuel") or "")
    return STUDY_WEIGHT.get(f["study_type"], 0.5) * FUEL_WEIGHT.get(fuel.group if fuel else "", 0.6) * (0.5 + 0.5 * f.get("confidence", 0.6))


# ----------------------------------------------------------------------------- graph
def build_graph(papers: list[dict], findings: list[dict]) -> dict:
    paper_by_id = {p["id"]: p for p in papers}
    node_papers: dict[str, set] = defaultdict(set)
    edges: dict[tuple, dict] = {}

    def add_edge(a, b, rel, f):
        if not a or not b or a == b:
            return
        key = (a, b, rel)
        e = edges.setdefault(key, {"source": a, "target": b, "relation": rel, "papers": set(), "findings": [], "dirs": Counter(), "w": 0.0})
        e["papers"].add(f["paper_id"])
        e["findings"].append(f["id"])
        e["dirs"][f["direction"]] += 1
        e["w"] += finding_weight(f, paper_by_id)

    for f in findings:
        for k in ("fuel", "condition", "geometry", "outcome", "countermeasure"):
            if f.get(k):
                node_papers[f[k]].add(f["paper_id"])
        for s in f["species"]:
            node_papers[s].add(f["paper_id"])
        add_edge(f["condition"], f["outcome"], "affects", f)
        add_edge(f.get("fuel"), f["condition"], "burned_in", f)
        add_edge(f["outcome"], f.get("geometry"), "observed_in", f)
        add_edge(f.get("countermeasure"), f["outcome"], "mitigates" if f.get("countermeasure_effect") != "ineffective" else "fails_to_mitigate", f)
        for s in f["species"]:
            add_edge(s, f["outcome"], "implicated_in", f)
    for p in papers:
        for pl in p.get("platforms", []):
            node_papers[pl].add(p["id"])
            for fuel in p.get("fuels", [])[:1]:
                add_edge(pl, fuel, "hosted", {"paper_id": p["id"], "id": f"{p['id']}:meta", "direction": "n/a",
                                              "study_type": p["study_type"], "fuel": fuel, "confidence": 0.6})

    nodes = []
    for nid, ps in node_papers.items():
        e = O.BY_ID[nid]
        nodes.append({"id": nid, "type": e.type, "label": e.label, "group": e.group, "ontology": e.ontology,
                      "papers": len(ps), "flight_papers": sum(paper_by_id[x]["study_type"] in ("flight", "both") for x in ps)})
    out_edges = []
    for (a, b, rel), e in edges.items():
        dirs = e["dirs"]
        effect = {k: v for k, v in dirs.items() if k in ("increase", "decrease", "no_change", "mixed")}
        total = sum(effect.values())
        majority = max(effect, key=effect.get) if effect else None
        agreement = round(effect[majority] / total, 2) if total else None
        out_edges.append({"id": f"{a}|{rel}|{b}", "source": a, "target": b, "relation": rel, "papers": sorted(e["papers"]),
                          "paper_count": len(e["papers"]), "findings": e["findings"][:60], "directions": dict(dirs),
                          "majority": majority, "agreement": agreement, "strength": strength(e["w"])})
    return {"nodes": sorted(nodes, key=lambda n: -n["papers"]), "edges": sorted(out_edges, key=lambda e: -e["paper_count"])}


# ----------------------------------------------------------------------------- consensus / contradiction
def consensus(papers: list[dict], findings: list[dict]) -> list[dict]:
    paper_by_id = {p["id"]: p for p in papers}
    groups: dict[tuple, list] = defaultdict(list)
    for f in findings:
        if f["direction"] in ("increase", "decrease", "no_change"):
            groups[(f["condition"], f["outcome"], f.get("geometry"))].append(f)
    out = []
    for (s, o, t), fs in groups.items():
        # one vote per paper (its highest-confidence finding)
        by_paper = {}
        for f in sorted(fs, key=lambda f: -f.get("confidence", 0)):
            by_paper.setdefault(f["paper_id"], f)
        if len(by_paper) < 2:
            continue
        votes = Counter(f["direction"] for f in by_paper.values())
        w = Counter()
        for f in by_paper.values():
            w[f["direction"]] += finding_weight(f, paper_by_id)
        majority = max(w, key=w.get)
        agreement = w[majority] / sum(w.values())
        minority = sum(votes.values()) - votes[majority]
        opposed = votes["increase"] >= 1 and votes["decrease"] >= 1
        contradictory = (opposed or votes["no_change"] >= 1) and minority >= 2 and agreement < 0.75
        status = "consensus" if agreement >= 0.8 and len(by_paper) >= 3 else "contradictory" if contradictory and agreement < 0.8 else "emerging"
        sides = defaultdict(list)
        for f in by_paper.values():
            p = paper_by_id[f["paper_id"]]
            sides[f["direction"]].append({"paper_id": p["id"], "title": p["title"], "year": p["year"], "quote": f["evidence_quote"],
                                          "fuel": f.get("fuel"), "study_type": p["study_type"],
                                          "duration_seconds": (p.get("duration") or {}).get("seconds")})
        explanations = []
        if status == "contradictory":
            dim = lambda key: {d: {x[key] for x in v} for d, v in sides.items()}
            fuels = dim("fuel")
            if len({frozenset(v) for v in fuels.values()}) > 1:
                explanations.append("Different fuels on each side")
            sts = dim("study_type")
            if any(v & {"flight", "both"} for v in sts.values()) and any(v & {"short_ug", "ground"} for v in sts.values()):
                explanations.append("Mix of orbital-flight and short-duration/1g tests")
            durs = [d for v in sides.values() for d in (x["duration_seconds"] for x in v) if d]
            if durs and max(durs) > 3 * min(durs):
                explanations.append(f"Freefall test times range {fmt_seconds(min(durs))}–{fmt_seconds(max(durs))}")
            if not explanations:
                explanations.append("Differences in geometry, atmosphere, diagnostics or definitions")
        # how the picture evolved: cumulative votes by publication year
        timeline, run = [], Counter()
        for y in sorted({int(f["year"]) for f in by_paper.values() if f.get("year")}):
            run.update(f["direction"] for f in by_paper.values() if f.get("year") and int(f["year"]) == y)
            timeline.append({"year": y, **run})
        out.append({"id": f"{s}|{o}|{t}", "condition": s, "outcome": o, "geometry": t, "n_papers": len(by_paper),
                    "votes": dict(votes), "majority": majority, "agreement": round(agreement, 2), "status": status,
                    "strength": strength(sum(w.values())), "sides": sides, "explanations": explanations, "timeline": timeline})
    out.sort(key=lambda g: (g["status"] != "contradictory", -g["n_papers"]))
    return out


# ----------------------------------------------------------------------------- gap matrices
def gap_matrices(papers: list[dict], findings: list[dict]) -> dict:
    def matrix(row_type, col_type, rows_from_paper):
        cells: dict[tuple, set] = defaultdict(set)
        flight: dict[tuple, set] = defaultdict(set)
        for p in papers:
            rows = rows_from_paper(p)
            for r in rows:
                for c in p.get("conditions", []) if col_type == "condition" else []:
                    cells[(r, c)].add(p["id"])
                    if p["study_type"] in ("flight", "both"):
                        flight[(r, c)].add(p["id"])
        for f in findings:
            r = f.get(row_type)
            if r:
                cells[(r, f["condition"])].add(f["paper_id"])
                if f["study_type"] in ("flight", "both"):
                    flight[(r, f["condition"])].add(f["paper_id"])
        rows = [e.id for e in O.BY_TYPE[row_type]]
        cols = [e.id for e in O.BY_TYPE[col_type]]
        return {"rows": [{"id": r, "label": O.BY_ID[r].label, "group": O.BY_ID[r].group} for r in rows],
                "cols": [{"id": c, "label": O.BY_ID[c].label, "group": O.BY_ID[c].group} for c in cols],
                "cells": {f"{r}|{c}": {"papers": sorted(cells[(r, c)]), "flight": len(flight[(r, c)])} for r in rows for c in cols if cells.get((r, c))}}
    return {
        "fuel": matrix("fuel", "condition", lambda p: p.get("fuels", [])),
        "geometry": matrix("geometry", "condition", lambda p: p.get("geometries", [])),
        "outcome": matrix("outcome", "condition", lambda p: []),
        "material_bias": material_bias(papers),
        "duration": duration_gap(papers),
    }


# freefall test time: drop towers give seconds, parabolic flights ~20 s, sounding rockets minutes, orbit hours+
DUR_BUCKETS = (("< 10 s (drop tower)", 0, 10), ("10–60 s (parabolic)", 10, 60),
               ("1–30 min (sounding rocket)", 60, 1800), ("> 30 min (orbital)", 1800, 1e12))
LONG_DURATION_S = 3600  # a spacecraft fire can burn far longer than any drop-tower test


def material_bias(papers: list[dict]) -> dict:
    """Fuel-group mix per flame geometry: how often is a configuration tested on real spacecraft materials?"""
    rows = []
    for t in O.BY_TYPE["geometry"]:
        ps = [p for p in papers if t.id in p.get("geometries", []) and not p.get("duplicate_of")]
        if len(ps) < 5:
            continue
        c = Counter(g for p in ps for g in {O.BY_ID[x].group for x in p.get("fuels", [])})
        share = c.get("Spacecraft material", 0) / len(ps)
        rows.append({"id": t.id, "label": t.label, "n_papers": len(ps), "counts": {g: c.get(g, 0) for g in FUEL_GROUPS},
                     "material_share": round(share, 2), "flag": share < 0.15 and t.group == "Solid configuration"})
    overall = Counter(g for p in papers for g in {O.BY_ID[x].group for x in p.get("fuels", [])})
    return {"groups": FUEL_GROUPS, "overall": {g: overall.get(g, 0) for g in FUEL_GROUPS},
            "rows": sorted(rows, key=lambda r: r["material_share"])}


def duration_gap(papers: list[dict]) -> dict:
    """Freefall test time per flame geometry, against a long-duration orbital fire."""
    rows = []
    for t in O.BY_TYPE["geometry"]:
        ps = [p for p in papers if t.id in p.get("geometries", []) and p.get("duration") and not p.get("duplicate_of")]
        if len(ps) < 3:
            continue
        secs = [p["duration"]["seconds"] for p in ps]
        rows.append({"id": t.id, "label": t.label, "n_with_duration": len(ps), "max_seconds": max(secs),
                     "median_seconds": sorted(secs)[len(secs) // 2],
                     "buckets": {b: sum(lo <= d < hi for d in secs) for b, lo, hi in DUR_BUCKETS}})
    known = [p["duration"]["seconds"] for p in papers if p.get("duration")]
    return {"buckets": [b for b, _, _ in DUR_BUCKETS], "rows": sorted(rows, key=lambda r: r["max_seconds"]),
            "n_with_duration": len(known), "target_seconds": LONG_DURATION_S,
            "overall": {b: sum(lo <= d < hi for d in known) for b, lo, hi in DUR_BUCKETS}}


# ----------------------------------------------------------------------------- graph analytics
def graph_analytics(graph: dict) -> None:
    """Annotate nodes with PageRank / betweenness and a research-theme community (in place)."""
    import networkx as nx
    from networkx.algorithms.community import greedy_modularity_communities

    G = nx.Graph()
    for e in graph["edges"]:
        if e["relation"] == "hosted":
            continue
        w = G[e["source"]][e["target"]]["weight"] + e["paper_count"] if G.has_edge(e["source"], e["target"]) else e["paper_count"]
        G.add_edge(e["source"], e["target"], weight=w, distance=1 / w)
    # weighted PageRank by power iteration (nx.pagerank needs scipy, which we don't ship)
    nodes = list(G)
    A = nx.to_numpy_array(G, nodelist=nodes, weight="weight")
    P = A / np.maximum(A.sum(axis=1, keepdims=True), 1e-12)
    r = np.full(len(nodes), 1 / len(nodes))
    for _ in range(100):
        r = 0.15 / len(nodes) + 0.85 * r @ P
    pr = dict(zip(nodes, r / r.sum()))
    bc = nx.betweenness_centrality(G, weight="distance", normalized=True)
    comms = sorted(greedy_modularity_communities(G, weight="weight", resolution=1.2), key=len, reverse=True)
    member = {n: i for i, c in enumerate(comms) for n in c}
    by_id = {n["id"]: n for n in graph["nodes"]}
    for n in graph["nodes"]:
        n["pagerank"] = round(pr.get(n["id"], 0), 5)
        n["betweenness"] = round(bc.get(n["id"], 0), 5)
        n["community"] = member.get(n["id"])
    themes = []
    for i, c in enumerate(comms):
        ms = sorted((by_id[x] for x in c if x in by_id), key=lambda n: -n["pagerank"])
        if len(ms) < 3:
            continue
        # name a theme after its most central non-condition concepts (microgravity connects everything)
        core = [n for n in ms if n["type"] not in ("condition", "fuel")][:2] or ms[:2]
        themes.append({"id": i, "label": " & ".join(n["label"] for n in core), "size": len(ms),
                       "members": [n["id"] for n in ms], "top": [n["id"] for n in ms[:6]]})
    graph["communities"] = themes


# ----------------------------------------------------------------------------- novelty + topic takeaways
def novelty(papers: list[dict], cons: list[dict], recent_years: int = 2) -> list[dict]:
    """Recent papers that disagree with an established majority: the ones that may change the picture."""
    last = max(int(p["year"]) for p in papers if p["year"])
    out = []
    for c in cons:
        if c["status"] == "emerging" or c["n_papers"] < 3:
            continue
        for d, side in c["sides"].items():
            if d == c["majority"]:
                continue
            for x in side:
                if x["year"] and int(x["year"]) >= last - recent_years + 1:
                    out.append({"consensus_id": c["id"], "paper_id": x["paper_id"], "title": x["title"], "year": x["year"],
                                "direction": d, "majority": c["majority"], "n_papers": c["n_papers"], "quote": x["quote"],
                                "study_type": x["study_type"]})
    out.sort(key=lambda x: (-int(x["year"]), -x["n_papers"]))
    return out[:30]


def takeaways(papers: list[dict], findings: list[dict], cons: list[dict], gaps: dict) -> dict:
    """Per flame geometry: a few auto-generated key takeaways, each backed by a consensus group or a count."""
    phrase = {"decrease": "decreases", "increase": "increases", "no_change": "does not change", "mixed": "has mixed effects on"}
    bias = {r["id"]: r for r in gaps["material_bias"]["rows"]}
    dur = {r["id"]: r for r in gaps["duration"]["rows"]}
    out = {}
    for t in O.BY_TYPE["geometry"]:
        ps = {f["paper_id"] for f in findings if f.get("geometry") == t.id}
        if len(ps) < 5:
            continue
        rel = [c for c in cons if c["geometry"] == t.id]
        items = []
        for c in sorted((c for c in rel if c["status"] == "consensus"), key=lambda c: -c["n_papers"])[:3]:
            items.append({"kind": "consensus", "consensus_id": c["id"],
                          "text": f"{O.BY_ID[c['condition']].label} {phrase.get(c['majority'], 'affects')} "
                                  f"{lc(O.BY_ID[c['outcome']].label)} ({c['n_papers']} papers, {int(c['agreement'] * 100)}% weighted agreement)."})
        for c in sorted((c for c in rel if c["status"] == "contradictory"), key=lambda c: -c["n_papers"])[:2]:
            items.append({"kind": "conflict", "consensus_id": c["id"],
                          "text": f"Studies disagree on how {lc(O.BY_ID[c['condition']].label)} affects {lc(O.BY_ID[c['outcome']].label)} "
                                  f"({', '.join(f'{v} {k.replace('_', ' ')}' for k, v in c['votes'].items())}): " + "; ".join(c["explanations"][:2]).lower() + "."})
        b = bias.get(t.id)
        if b and b["flag"]:
            items.append({"kind": "gap", "text": f"Only {int(b['material_share'] * 100)}% of {b['n_papers']} papers test real spacecraft materials; most evidence comes from "
                                                 + max((g for g in b["counts"] if g != "Spacecraft material"), key=lambda g: b["counts"][g]).lower() + " fuels."})
        d = dur.get(t.id)
        if d and d["max_seconds"] < LONG_DURATION_S:
            items.append({"kind": "gap", "text": f"The longest freefall test is {fmt_seconds(d['max_seconds'])}; no long-duration orbital burn has been reported."})
        out[t.id] = {"label": t.label, "n_papers": len(ps), "items": items}
    return out


# ----------------------------------------------------------------------------- trends
def trends(papers: list[dict]) -> dict:
    years = sorted({p["year"] for p in papers if p["year"]})
    series = {}
    for kind, key in (("condition", "conditions"), ("fuel_group", "fuels"), ("geometry", "geometries")):
        c: dict[str, Counter] = defaultdict(Counter)
        for p in papers:
            if not p["year"]:
                continue
            labels = {O.BY_ID[i].group if kind == "fuel_group" else i for i in p.get(key, [])[:2]}
            for lab in labels:
                c[lab][p["year"]] += 1
        series[kind] = [{"key": k, "label": O.BY_ID[k].label if k in O.BY_ID else k, "total": sum(v.values()),
                         "counts": [v.get(y, 0) for y in years]} for k, v in sorted(c.items(), key=lambda kv: -sum(kv[1].values()))]
    study = Counter((p["year"], p["study_type"]) for p in papers if p["year"])
    return {"years": years, "series": series, "per_year": [sum(1 for p in papers if p["year"] == y) for y in years],
            "study_type": {st: [study.get((y, st), 0) for y in years] for st in ("flight", "both", "short_ug", "ground", "computational", "review")}}


# ----------------------------------------------------------------------------- mission risk evidence
def risk_evidence(papers: list[dict], findings: list[dict], cons: list[dict]) -> list[dict]:
    paper_by_id = {p["id"]: p for p in papers}
    out = []
    for r in RISKS:
        match = [f for f in findings if f["condition"] in r["conditions"] and (f["outcome"] in r["outcomes"] or (f.get("geometry") in r["geometries"] and r["geometries"]))]
        ps = {f["paper_id"] for f in match}
        by_condition = Counter()
        for f in match:
            by_condition[f["condition"]] += 1
        cms: dict[str, dict] = {}
        for f in match:
            if f.get("countermeasure"):
                c = cms.setdefault(f["countermeasure"], {"id": f["countermeasure"], "label": O.BY_ID[f["countermeasure"]].label, "effective": 0, "ineffective": 0, "papers": set()})
                c["ineffective" if f["countermeasure_effect"] == "ineffective" else "effective"] += 1
                c["papers"].add(f["paper_id"])
        # also countermeasures mentioned in risk papers' abstracts
        for pid in ps:
            for e, _ in O.find("countermeasure", paper_by_id[pid]["abstract"]):
                c = cms.setdefault(e.id, {"id": e.id, "label": e.label, "effective": 0, "ineffective": 0, "papers": set()})
                c["papers"].add(pid)
        per_paper_w: dict[str, float] = {}  # one vote per paper, so prolific papers do not saturate the score
        for f in match:
            per_paper_w[f["paper_id"]] = max(per_paper_w.get(f["paper_id"], 0), finding_weight(f, paper_by_id))
        top = sorted(match, key=lambda f: -finding_weight(f, paper_by_id))
        seen, key_findings = set(), []
        for f in top:
            if f["paper_id"] in seen:
                continue
            seen.add(f["paper_id"])
            key_findings.append(f["id"])
            if len(key_findings) >= 8:
                break
        rel_cons = [c["id"] for c in cons if c["condition"] in r["conditions"] and (c["outcome"] in r["outcomes"] or c["geometry"] in r["geometries"])]
        n_material = sum(1 for pid in ps if any(O.BY_ID[x].group == "Spacecraft material" for x in paper_by_id[pid].get("fuels", [])))
        n_flight = sum(1 for pid in ps if paper_by_id[pid]["study_type"] in ("flight", "both"))
        has_pg = any(f["condition"] == O.PARTIAL_GRAVITY for f in match)
        gaps = []
        if n_material < 3:
            gaps.append(f"Only {n_material} studies test real spacecraft materials")
        if not has_pg:
            gaps.append("No partial-gravity (Moon/Mars) evidence")
        if n_flight < max(2, len(ps) // 4):
            gaps.append("Evidence relies mostly on short-duration or 1g tests")
        combined = [pid for pid in ps if {"condition:elevated_o2", "condition:reduced_pressure", O.MICROGRAVITY} <= set(paper_by_id[pid].get("conditions", []))]
        if not combined:
            gaps.append("Combined elevated-O₂ + reduced-pressure in microgravity untested")
        max_seconds = max([(paper_by_id[pid].get("duration") or {}).get("seconds") or 0 for pid in ps] + [0])
        out.append({**r, "papers": sorted(ps), "n_papers": len(ps), "n_findings": len(match), "n_material": n_material, "n_flight": n_flight,
                    "max_seconds": max_seconds, "has_partial_gravity": has_pg,
                    "evidence_by_condition": dict(by_condition), "strength": strength(sum(per_paper_w.values()), scale=12),
                    "key_findings": key_findings, "contradictions": [c for c in rel_cons if next(x for x in cons if x["id"] == c)["status"] == "contradictory"][:6],
                    "countermeasures": sorted(({**c, "papers": sorted(c["papers"]), "n_papers": len(c["papers"])} for c in cms.values()), key=lambda c: -(c["effective"] * 3 + len(c["papers"])))[:6],
                    "gaps": gaps})
    return out


# ----------------------------------------------------------------------------- hypotheses (Swanson ABC)
def hypotheses(findings: list[dict], graph: dict) -> list[dict]:
    """A->B and B->C are supported but A->C was never measured together."""
    link: dict[tuple, set] = defaultdict(set)
    for f in findings:
        ents = {f.get("countermeasure"), f["condition"], f["outcome"], f.get("geometry"), *f["species"]} - {None}
        for a, b in combinations(sorted(ents), 2):
            link[(a, b)].add(f["paper_id"])
    nbrs: dict[str, dict] = defaultdict(dict)
    for (a, b), ps in link.items():
        nbrs[a][b] = ps
        nbrs[b][a] = ps
    out = []
    sources = [n for n in nbrs if O.BY_ID[n].type in ("countermeasure", "species")]
    targets = [n for n in nbrs if O.BY_ID[n].type in ("outcome", "geometry")]
    for a in sources:
        for c in targets:
            if c in nbrs[a]:
                continue
            bridges = []
            for b in set(nbrs[a]) & set(nbrs[c]):
                s = min(len(nbrs[a][b]), len(nbrs[b][c]))
                if s >= 1:
                    bridges.append((s, b))
            if len(bridges) < 2:
                continue
            bridges.sort(reverse=True)
            score = sum(s for s, _ in bridges[:5])
            out.append({"id": f"{a}->{c}", "a": a, "c": c, "score": score,
                        "bridges": [{"b": b, "ab_papers": sorted(nbrs[a][b])[:5], "bc_papers": sorted(nbrs[b][c])[:5]} for _, b in bridges[:4]],
                        "text": f"{O.BY_ID[a].label} may influence {lc(O.BY_ID[c].label)} — linked through "
                                + ", ".join(lc(O.BY_ID[b].label) for _, b in bridges[:3]) + ", but no study in the corpus tests it directly."})
    out.sort(key=lambda h: -h["score"])
    return out[:40]


# ----------------------------------------------------------------------------- retrieval indexes
def tag_chunks(chunks: list[dict]) -> None:
    ents = [e for e in O.ALL_ENTITIES if e.type != "platform"]
    for c in chunks:
        c["entities"] = [e.id for e in ents if e.rx.search(c["text"])][:12]


def build_indexes(chunks: list[dict], dense: bool = True) -> None:
    import bm25s
    corpus = [c["text"] for c in chunks]
    retriever = bm25s.BM25()
    retriever.index(bm25s.tokenize(corpus, stopwords="en", show_progress=False), show_progress=False)
    retriever.save(str(KB_DIR / "bm25"))
    if not dense:
        return
    try:
        from pipeline.embed import embed_corpus
        vecs = embed_corpus(corpus)
        np.save(KB_DIR / "embeddings.npy", vecs)
        print(f"[build] dense embeddings {vecs.shape}")
    except Exception as e:  # not installed or model download failed
        print(f"[build] dense embeddings skipped ({type(e).__name__}) - dense retrieval disabled (BM25 + graph only)")


# ----------------------------------------------------------------------------- main
def main(skip_embeddings: bool = False) -> None:
    papers = json.loads((KB_DIR / "papers_raw.json").read_text())
    chunks = [json.loads(l) for l in open(KB_DIR / "chunks.jsonl")]
    findings, qstats = extract_all(papers)
    graph = build_graph(papers, findings)
    graph_analytics(graph)
    cons = consensus(papers, findings)
    gaps = gap_matrices(papers, findings)
    risks = risk_evidence(papers, findings, cons)
    hyps = hypotheses(findings, graph)
    tag_chunks(chunks)

    # slim paper records for the API (sections live in chunks)
    for p in papers:
        p.pop("sections", None)
    entities = [{"id": e.id, "type": e.type, "label": e.label, "group": e.group, "ontology": e.ontology,
                 "synonyms": [re.sub(r"[\\?()|:]", "", s) for s in e.patterns[:6]]} for e in O.ALL_ENTITIES]
    stats = {
        "papers": len(papers), "full_text": sum(p["full_text"] for p in papers), "chunks": len(chunks),
        "findings": len(findings), "nodes": len(graph["nodes"]), "edges": len(graph["edges"]),
        "contradictions": sum(c["status"] == "contradictory" for c in cons), "consensus": sum(c["status"] == "consensus" for c in cons),
        "experiment_linked": sum(bool(p.get("experiments")) for p in papers), "llm_papers": sum(p["summary"]["method"] == "llm" for p in papers),
        "years": [min(p["year"] for p in papers if p["year"]), max(p["year"] for p in papers if p["year"])],
        "study_types": Counter(p["study_type"] for p in papers), "quote_guard": qstats,
        "duplicates": sum(bool(p.get("duplicate_of")) for p in papers), "communities": len(graph.get("communities", [])),
        "with_n_tests": sum(bool(p.get("n_tests")) for p in papers), "with_mission": sum(bool(p.get("missions")) for p in papers),
    }
    write = lambda name, obj: (KB_DIR / name).write_text(json.dumps(obj, default=list))
    write("papers.json", papers)
    write("findings.json", findings)
    write("entities.json", entities)
    write("graph.json", graph)
    write("consensus.json", cons)
    write("gaps.json", gaps)
    write("trends.json", {**trends(papers), "novelty": novelty(papers, cons)})
    write("takeaways.json", takeaways(papers, findings, cons, gaps))
    write("risk_evidence.json", risks)
    write("hypotheses.json", hyps)
    write("stats.json", stats)
    with open(KB_DIR / "chunks.jsonl", "w") as f:
        for c in chunks:
            f.write(json.dumps(c) + "\n")
    build_indexes(chunks, dense=not skip_embeddings)
    print(f"[build] {json.dumps(stats, default=list)}")


if __name__ == "__main__":
    import sys
    main(skip_embeddings="--no-embed" in sys.argv)

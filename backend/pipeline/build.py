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

STUDY_WEIGHT = {"flight": 1.0, "both": 1.0, "ground_analog": 0.6, "ground": 0.5, "computational": 0.3, "review": 0.2}
ORG_WEIGHT = {"Human": 1.0, "Rodent": 0.8, "Other animal": 0.6, "Cell culture": 0.5, "Plant": 0.5, "Microbe": 0.5}


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
            profile.update({k: L[k] for k in ("organisms", "stressors", "platforms", "tissues") if L.get(k)})
            profile["study_type"] = L.get("study_type") or profile["study_type"]
            if L.get("duration_days"):
                profile["duration"] = {"value": L["duration_days"], "unit": "days", "days": L["duration_days"]}
            profile["sample_size"] = L.get("sample_size")
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
        for i, f in enumerate(fnds):
            f.update({"id": f"{p['id']}:f{i}", "paper_id": p["id"], "year": p["year"], "study_type": p["study_type"]})
            if not f.get("genes"):
                f["genes"] = []
            findings.append(f)
        p["n_findings"] = len(fnds)
    return findings, dict(qstats)


def finding_weight(f: dict, paper_by_id: dict) -> float:
    org = O.BY_ID.get(f.get("organism") or "")
    return STUDY_WEIGHT.get(f["study_type"], 0.5) * ORG_WEIGHT.get(org.group if org else "", 0.5) * (0.5 + 0.5 * f.get("confidence", 0.6))


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
        for k in ("organism", "stressor", "tissue", "outcome", "countermeasure"):
            if f.get(k):
                node_papers[f[k]].add(f["paper_id"])
        for g in f["genes"]:
            node_papers[g].add(f["paper_id"])
        add_edge(f["stressor"], f["outcome"], "affects", f)
        add_edge(f.get("organism"), f["stressor"], "exposed_to", f)
        add_edge(f["outcome"], f.get("tissue"), "observed_in", f)
        add_edge(f.get("countermeasure"), f["outcome"], "mitigates" if f.get("countermeasure_effect") != "ineffective" else "fails_to_mitigate", f)
        for g in f["genes"]:
            add_edge(g, f["outcome"], "implicated_in", f)
    for p in papers:
        for pl in p.get("platforms", []):
            node_papers[pl].add(p["id"])
            for org in p.get("organisms", [])[:1]:
                add_edge(pl, org, "hosted", {"paper_id": p["id"], "id": f"{p['id']}:meta", "direction": "n/a",
                                              "study_type": p["study_type"], "organism": org, "confidence": 0.6})

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
            groups[(f["stressor"], f["outcome"], f.get("tissue"))].append(f)
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
                                          "organism": f.get("organism"), "study_type": p["study_type"],
                                          "duration_days": (p.get("duration") or {}).get("days")})
        explanations = []
        if status == "contradictory":
            dim = lambda key: {d: {x[key] for x in v} for d, v in sides.items()}
            orgs = dim("organism")
            if len({frozenset(v) for v in orgs.values()}) > 1:
                explanations.append("Different model organisms on each side")
            sts = dim("study_type")
            if any("flight" in v for v in sts.values()) and any(v & {"ground_analog", "ground"} for v in sts.values()):
                explanations.append("Mix of real spaceflight and ground-analog studies")
            durs = [d for v in sides.values() for d in (x["duration_days"] for x in v) if d]
            if durs and max(durs) > 3 * min(durs):
                explanations.append(f"Exposure durations range {int(min(durs))}–{int(max(durs))} days")
            if not explanations:
                explanations.append("Differences in tissue sampling, endpoints or statistics")
        out.append({"id": f"{s}|{o}|{t}", "stressor": s, "outcome": o, "tissue": t, "n_papers": len(by_paper),
                    "votes": dict(votes), "majority": majority, "agreement": round(agreement, 2), "status": status,
                    "strength": strength(sum(w.values())), "sides": sides, "explanations": explanations})
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
                for c in p.get("stressors", []) if col_type == "stressor" else []:
                    cells[(r, c)].add(p["id"])
                    if p["study_type"] in ("flight", "both"):
                        flight[(r, c)].add(p["id"])
        for f in findings:
            r = f.get(row_type)
            if r:
                cells[(r, f["stressor"])].add(f["paper_id"])
                if f["study_type"] in ("flight", "both"):
                    flight[(r, f["stressor"])].add(f["paper_id"])
        rows = [e.id for e in O.BY_TYPE[row_type]]
        cols = [e.id for e in O.BY_TYPE[col_type]]
        return {"rows": [{"id": r, "label": O.BY_ID[r].label, "group": O.BY_ID[r].group} for r in rows],
                "cols": [{"id": c, "label": O.BY_ID[c].label, "group": O.BY_ID[c].group} for c in cols],
                "cells": {f"{r}|{c}": {"papers": sorted(cells[(r, c)]), "flight": len(flight[(r, c)])} for r in rows for c in cols if cells.get((r, c))}}
    return {
        "organism": matrix("organism", "stressor", lambda p: p.get("organisms", [])),
        "tissue": matrix("tissue", "stressor", lambda p: p.get("tissues", [])),
        "outcome": matrix("outcome", "stressor", lambda p: []),
    }


# ----------------------------------------------------------------------------- trends
def trends(papers: list[dict]) -> dict:
    years = sorted({p["year"] for p in papers if p["year"]})
    series = {}
    for kind, key in (("stressor", "stressors"), ("organism_group", "organisms"), ("tissue", "tissues")):
        c: dict[str, Counter] = defaultdict(Counter)
        for p in papers:
            if not p["year"]:
                continue
            labels = {O.BY_ID[i].group if kind == "organism_group" else i for i in p.get(key, [])[:2]}
            for lab in labels:
                c[lab][p["year"]] += 1
        series[kind] = [{"key": k, "label": O.BY_ID[k].label if k in O.BY_ID else k, "total": sum(v.values()),
                         "counts": [v.get(y, 0) for y in years]} for k, v in sorted(c.items(), key=lambda kv: -sum(kv[1].values()))]
    study = Counter((p["year"], p["study_type"]) for p in papers if p["year"])
    return {"years": years, "series": series, "per_year": [sum(1 for p in papers if p["year"] == y) for y in years],
            "study_type": {st: [study.get((y, st), 0) for y in years] for st in ("flight", "both", "ground_analog", "ground", "review")}}


# ----------------------------------------------------------------------------- mission risk evidence
def risk_evidence(papers: list[dict], findings: list[dict], cons: list[dict]) -> list[dict]:
    paper_by_id = {p["id"]: p for p in papers}
    out = []
    for r in RISKS:
        match = [f for f in findings if f["stressor"] in r["stressors"] and (f["outcome"] in r["outcomes"] or (f.get("tissue") in r["tissues"] and r["tissues"]))]
        ps = {f["paper_id"] for f in match}
        by_stressor = Counter()
        for f in match:
            by_stressor[f["stressor"]] += 1
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
        rel_cons = [c["id"] for c in cons if c["stressor"] in r["stressors"] and (c["outcome"] in r["outcomes"] or c["tissue"] in r["tissues"])]
        n_human = sum(1 for pid in ps if "organism:human" in paper_by_id[pid].get("organisms", []))
        n_flight = sum(1 for pid in ps if paper_by_id[pid]["study_type"] in ("flight", "both"))
        gaps = []
        if n_human < 3:
            gaps.append(f"Only {n_human} human studies in the corpus")
        if not any(f["stressor"] == "stressor:partial_gravity" for f in match):
            gaps.append("No partial-gravity (Moon/Mars) evidence")
        if n_flight < max(2, len(ps) // 4):
            gaps.append("Evidence relies mostly on ground analogs")
        combined = [pid for pid in ps if {"stressor:space_radiation"} <= set(paper_by_id[pid].get("stressors", [])) and
                    set(paper_by_id[pid].get("stressors", [])) & {O.FLIGHT_STRESSOR, O.ANALOG_STRESSOR}]
        if not combined:
            gaps.append("Combined radiation + microgravity effects untested")
        out.append({**r, "papers": sorted(ps), "n_papers": len(ps), "n_findings": len(match), "n_human": n_human, "n_flight": n_flight,
                    "evidence_by_stressor": dict(by_stressor), "strength": strength(sum(per_paper_w.values()), scale=12),
                    "key_findings": key_findings, "contradictions": [c for c in rel_cons if next(x for x in cons if x["id"] == c)["status"] == "contradictory"][:6],
                    "countermeasures": sorted(({**c, "papers": sorted(c["papers"]), "n_papers": len(c["papers"])} for c in cms.values()), key=lambda c: -(c["effective"] * 3 + len(c["papers"])))[:6],
                    "gaps": gaps})
    return out


# ----------------------------------------------------------------------------- hypotheses (Swanson ABC)
def hypotheses(findings: list[dict], graph: dict) -> list[dict]:
    """A->B and B->C are supported but A->C was never measured together."""
    link: dict[tuple, set] = defaultdict(set)
    for f in findings:
        ents = {f.get("countermeasure"), f["stressor"], f["outcome"], f.get("tissue"), *f["genes"]} - {None}
        for a, b in combinations(sorted(ents), 2):
            link[(a, b)].add(f["paper_id"])
    nbrs: dict[str, dict] = defaultdict(dict)
    for (a, b), ps in link.items():
        nbrs[a][b] = ps
        nbrs[b][a] = ps
    out = []
    sources = [n for n in nbrs if O.BY_ID[n].type in ("countermeasure", "gene")]
    targets = [n for n in nbrs if O.BY_ID[n].type in ("outcome", "tissue")]
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
                        "text": f"{O.BY_ID[a].label} may influence {O.BY_ID[c].label.lower()} — linked through "
                                + ", ".join(O.BY_ID[b].label.lower() for _, b in bridges[:3]) + ", but no study in the corpus tests it directly."})
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
    cons = consensus(papers, findings)
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
        "osdr_linked": sum(bool(p["osdr_ids"]) for p in papers), "llm_papers": sum(p["summary"]["method"] == "llm" for p in papers),
        "years": [min(p["year"] for p in papers if p["year"]), max(p["year"] for p in papers if p["year"])],
        "study_types": Counter(p["study_type"] for p in papers), "quote_guard": qstats,
    }
    write = lambda name, obj: (KB_DIR / name).write_text(json.dumps(obj, default=list))
    write("papers.json", papers)
    write("findings.json", findings)
    write("entities.json", entities)
    write("graph.json", graph)
    write("consensus.json", cons)
    write("gaps.json", gap_matrices(papers, findings))
    write("trends.json", trends(papers))
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

"""Emberfall — Flame in Freefall API.

Run:  uv run uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app import export as X
from app import mission as M
from app.answer import DISCLAIMER, PERSONAS, answer, llm_available, llm_provider
from app.glossary import all_terms
from app.kb import get_kb
from app.retrieval import search as hybrid_search
from pipeline.paths import KB_DIR, LOG_DIR
from pipeline.risks import MISSION_PRESETS

app = FastAPI(title="Emberfall — Flame in Freefall", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("EMBER_CORS", "*").split(","), allow_methods=["*"], allow_headers=["*"])


def _log(name: str, record: dict) -> None:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_DIR / name, "a") as fh:
            fh.write(json.dumps({"ts": datetime.now(timezone.utc).isoformat(), **record}) + "\n")
    except OSError:
        pass


@app.middleware("http")
async def timing(request: Request, call_next):
    """Server-Timing header on every response + a JSONL request log for monitoring."""
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    response.headers["Server-Timing"] = f"app;dur={ms:.1f}"
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        _log("requests.jsonl", {"method": request.method, "path": request.url.path, "status": response.status_code, "ms": round(ms, 1)})
    return response


@app.on_event("startup")
def _warm() -> None:
    kb = get_kb()
    kb.bm25  # load index eagerly
    kb.embedder


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/stats")
def stats():
    kb = get_kb()
    top = lambda t, n: [{"id": x["id"], "label": x["label"], "papers": x["papers"]} for x in
                        sorted((x for x in kb.graph["nodes"] if x["type"] == t), key=lambda x: -x["papers"])[:n]]
    return kb.stats | {"llm": llm_available(), "llm_provider": llm_provider(), "dense": kb.embedder is not None, "personas": list(PERSONAS), "top": {t: top(t, 8) for t in ("fuel", "condition", "geometry", "outcome")},
                       "contradictions_preview": [c | {"label": _cons_label(c)} for c in kb.consensus if c["status"] == "contradictory"][:3],
                       "hypotheses_preview": kb.hypotheses[:3]}


@app.get("/api/entities")
def entities():
    kb = get_kb()
    counts = {n["id"]: n["papers"] for n in kb.graph["nodes"]}
    return [e | {"papers": counts.get(e["id"], 0)} for e in kb.entities]


# ------------------------------------------------------------------ papers
@app.get("/api/papers")
def papers(q: str = "", fuel: str = "", condition: str = "", geometry: str = "", study_type: str = "", experiment: bool = False,
           year_from: int = 0, year_to: int = 9999, sort: str = "year", offset: int = 0, limit: int = Query(40, le=200),
           ids: str = ""):
    kb = get_kb()
    items = kb.papers
    if ids:
        want = set(ids.split(","))
        items = [p for p in items if p["id"] in want]
    if q:
        ql = q.lower()
        hits = {p["paper_id"] for p in hybrid_search(kb, q, k=60, per_paper=1)["passages"]}
        items = [p for p in items if p["id"] in hits or ql in p["title"].lower() or ql == p["id"].lower()]
    for field, val in (("fuels", fuel), ("conditions", condition), ("geometries", geometry)):
        if val:
            items = [p for p in items if val in p.get(field, [])]
    if study_type:
        items = [p for p in items if p["study_type"] in study_type.split(",")]
    if experiment:
        items = [p for p in items if p.get("experiments")]
    items = [p for p in items if year_from <= int(p.get("year") or 0) <= year_to]
    if sort == "year":
        items = sorted(items, key=lambda p: (-int(p.get("year") or 0), p["title"]))
    elif sort == "findings":
        items = sorted(items, key=lambda p: -p.get("n_findings", 0))
    elif sort == "title":
        items = sorted(items, key=lambda p: p["title"])
    return {"total": len(items), "items": [kb.paper_card(p["id"]) for p in items[offset:offset + limit]]}


@app.get("/api/papers/{pid}")
def paper(pid: str):
    kb = get_kb()
    if pid not in kb.paper:
        raise HTTPException(404, "paper not found")
    p = kb.paper[pid]
    mine = set(p.get("fuels", []) + p.get("conditions", []) + p.get("geometries", []))
    related = sorted(((len(mine & set(o.get("fuels", []) + o.get("conditions", []) + o.get("geometries", []))), o["id"])
                      for o in kb.papers if o["id"] != pid), reverse=True)[:6]
    sections = Counter(kb.chunks[i]["section"] for i in kb.chunks_by_paper[pid])
    return kb.paper_card(pid) | {
        "authors": p["authors"], "keywords": p.get("keywords", []), "abstract": p["abstract"], "summary": p["summary"],
        "duration": p.get("duration"), "word_count": p.get("word_count"), "atmosphere": p.get("atmosphere"),
        "limitations": p.get("limitations", []), "center": p.get("center"), "report_type": p.get("report_type"),
        "pdf_url": p.get("pdf_url"),
        "findings": [kb.finding_card(f["id"]) for f in kb.findings_by_paper[pid]],
        "sections": dict(sections),
        "experiments": p.get("experiments", []),
        "related": [kb.paper_card(i) for n, i in related if n >= 2],
        "labels": {e: kb.label(e) for e in mine},
    }


@app.get("/api/papers/{pid}/cite")
def paper_cite(pid: str, format: Literal["bibtex", "ris"] = "bibtex"):
    kb = get_kb()
    if pid not in kb.paper:
        raise HTTPException(404, "paper not found")
    return PlainTextResponse(X.bibtex([kb.paper[pid]]) if format == "bibtex" else X.ris([kb.paper[pid]]))


@app.get("/api/papers/{pid}/chunks")
def paper_chunks(pid: str, section: str = ""):
    kb = get_kb()
    return [kb.chunks[i] for i in kb.chunks_by_paper.get(pid, []) if not section or kb.chunks[i]["section"] == section]


# ---------------------------------------------------------------- search / ask
def _filters(study_type: str, fuel: str, condition: str, geometry: str, year_min: int, year_max: int) -> dict | None:
    f = {"study_type": study_type.split(",") if study_type else None, "fuel": fuel.split(",") if fuel else None,
         "condition": condition.split(",") if condition else None, "geometry": geometry.split(",") if geometry else None,
         "year_min": year_min or None, "year_max": year_max or None}
    f = {k: v for k, v in f.items() if v}
    return f or None


@app.get("/api/search")
def search(q: str, k: int = Query(10, le=50), study_type: str = "", fuel: str = "", condition: str = "", geometry: str = "",
           year_min: int = 0, year_max: int = 0, mode: Literal["hybrid", "bm25", "dense", "rerank"] | None = None):
    return hybrid_search(get_kb(), q, k=k, filters=_filters(study_type, fuel, condition, geometry, year_min, year_max), mode=mode)


@app.get("/api/ask")
async def ask(q: str = Query(..., min_length=3, max_length=500), persona: str = "scientist", study_type: str = "",
              fuel: str = "", condition: str = "", geometry: str = "", year_min: int = 0, year_max: int = 0,
              history: str = Query("", max_length=12000, description="JSON list of earlier turns [{q, a}] for follow-ups")):
    filters = _filters(study_type, fuel, condition, geometry, year_min, year_max)
    try:
        turns = [{"q": str(t.get("q", ""))[:500], "a": str(t.get("a", ""))[:2500]} for t in json.loads(history)][-4:] if history else []
    except (ValueError, AttributeError):
        raise HTTPException(422, "history must be a JSON list of {q, a} objects")

    async def gen():
        async for ev in answer(get_kb(), q, persona, filters=filters, history=turns):
            yield {"event": ev["event"], "data": json.dumps(ev["data"])}

    return EventSourceResponse(gen())


class Feedback(BaseModel):
    q: str = Field(..., max_length=500)
    rating: Literal["up", "down"]
    comment: str = Field("", max_length=2000)
    persona: str = ""
    mode: str = ""
    citations: list[int] = []
    cited_papers: list[str] = []


@app.post("/api/feedback")
def feedback(fb: Feedback):
    """Thumbs up/down on an answer, appended to data/logs/feedback.jsonl for review."""
    _log("feedback.jsonl", fb.model_dump())
    return {"ok": True}


@app.get("/api/meta")
def meta():
    return {"disclaimer": DISCLAIMER, "personas": list(PERSONAS), "llm": llm_available(), "llm_provider": llm_provider()}


# ------------------------------------------------------------------ graph
def _year_edges(kb, year_from: int, year_to: int) -> list[dict]:
    """Edges restricted to papers published in [year_from, year_to], with recomputed paper counts."""
    if not year_from and not year_to:
        return kb.graph["edges"]
    lo, hi = year_from or 0, year_to or 9999
    out = []
    for e in kb.graph["edges"]:
        ps = [p for p in e["papers"] if lo <= int(kb.paper[p].get("year") or 0) <= hi]
        if ps:
            out.append(e | {"papers": ps, "paper_count": len(ps)})
    return out


@app.get("/api/graph")
def graph(focus: str = "", types: str = "", min_papers: int = 2, depth: int = 1, limit: int = 160,
          year_from: int = 0, year_to: int = 0, community: int | None = None,
          nodes: str = Query("", description="comma-separated node ids: show exactly these (e.g. an evidence path)")):
    kb = get_kb()
    allowed = set(types.split(",")) if types and not nodes else None
    only = set(nodes.split(",")) if nodes else None
    nodes = {n["id"]: n for n in kb.graph["nodes"] if (not allowed or n["type"] in allowed) and (not only or n["id"] in only)}
    if community is not None:
        nodes = {i: n for i, n in nodes.items() if n.get("community") == community}
    edges = [e for e in _year_edges(kb, year_from, year_to) if e["source"] in nodes and e["target"] in nodes and e["paper_count"] >= min_papers]
    if focus:
        keep = {focus}
        frontier = {focus}
        for _ in range(max(depth, 1)):
            nxt = {e["target"] if e["source"] in frontier else e["source"] for e in edges
                   if e["source"] in frontier or e["target"] in frontier}
            keep |= nxt
            frontier = nxt
        edges = [e for e in edges if e["source"] in keep and e["target"] in keep]
    edges = sorted(edges, key=lambda e: -e["paper_count"])[:limit * 2]
    used = {e["source"] for e in edges} | {e["target"] for e in edges} | ({focus} if focus in nodes else set()) | (set(nodes) if only else set())
    slim = lambda e: {k: e[k] for k in ("id", "source", "target", "relation", "paper_count", "majority", "agreement", "strength", "directions")}
    return {"nodes": [nodes[i] for i in used], "edges": [slim(e) for e in edges], "communities": kb.graph.get("communities", [])}


@app.get("/api/graph/analytics")
def graph_analytics(top: int = Query(12, le=50)):
    """Most central concepts (PageRank = well connected, betweenness = bridges between research areas) and themes."""
    kb = get_kb()
    card = lambda n: {k: n.get(k) for k in ("id", "label", "type", "papers", "pagerank", "betweenness", "community")}
    ns = [n for n in kb.graph["nodes"] if n.get("pagerank") is not None]
    return {"pagerank": [card(n) for n in sorted(ns, key=lambda n: -n["pagerank"])[:top]],
            "betweenness": [card(n) for n in sorted(ns, key=lambda n: -n["betweenness"])[:top]],
            "communities": kb.graph.get("communities", [])}


@app.get("/api/graph/path")
def graph_path(source: str, target: str, k: int = Query(3, ge=1, le=5), min_papers: int = 1):
    """Up to k shortest evidence paths between two concepts; strongly supported edges are 'shorter'."""
    import networkx as nx
    from itertools import islice

    kb = get_kb()
    if source not in kb.node or target not in kb.node:
        raise HTTPException(404, "unknown node")
    G = nx.Graph()
    for e in kb.graph["edges"]:
        if e["relation"] != "hosted" and e["paper_count"] >= min_papers:
            G.add_edge(e["source"], e["target"], weight=1 / e["paper_count"], id=e["id"])
    if source not in G or target not in G or not nx.has_path(G, source, target):
        return {"paths": []}
    paths = []
    for nodes in islice(nx.shortest_simple_paths(G, source, target, weight="weight"), k):
        steps = []
        for a, b in zip(nodes, nodes[1:]):
            e = kb.edge[G[a][b]["id"]]
            steps.append({"edge": e["id"], "source": a, "target": b, "source_label": kb.label(a), "target_label": kb.label(b),
                          "relation": e["relation"], "paper_count": e["paper_count"], "majority": e.get("majority"),
                          "papers": [kb.paper_card(p) for p in e["papers"][:3]]})
        paths.append({"nodes": [{"id": n, "label": kb.label(n), "type": kb.node[n]["type"]} for n in nodes], "steps": steps,
                      "support": min(s["paper_count"] for s in steps)})
    return {"paths": paths}


@app.get("/api/graph/node/{nid:path}")
def graph_node(nid: str):
    kb = get_kb()
    if nid not in kb.node:
        raise HTTPException(404, "node not found")
    edges = [e for e in kb.graph["edges"] if nid in (e["source"], e["target"])]
    pids = sorted({p for e in edges for p in e["papers"]}, key=lambda p: -int(kb.paper[p].get("year") or 0))
    ent = next((e for e in kb.entities if e["id"] == nid), {})
    neigh = sorted(({"id": e["target"] if e["source"] == nid else e["source"], "relation": e["relation"], "edge": e["id"],
                     "papers": e["paper_count"], "majority": e["majority"], "outgoing": e["source"] == nid} for e in edges),
                   key=lambda x: -x["papers"])
    for n in neigh:
        n["label"] = kb.label(n["id"])
    return kb.node[nid] | {"synonyms": ent.get("synonyms", []), "neighbors": neigh[:30],
                           "papers": [kb.paper_card(p) for p in pids[:25]],
                           "consensus": [c | {"label": _cons_label(c)} for c in kb.consensus
                                         if nid in (c["condition"], c["outcome"], c["geometry"])][:8]}


@app.get("/api/graph/edge")
def graph_edge(id: str):
    kb = get_kb()
    if id not in kb.edge:
        raise HTTPException(404, "edge not found")
    e = kb.edge[id]
    return e | {"source_label": kb.label(e["source"]), "target_label": kb.label(e["target"]),
                "finding_cards": [kb.finding_card(f) for f in e["findings"][:30]],
                "paper_cards": [kb.paper_card(p) for p in e["papers"][:30]]}


# --------------------------------------------------------------- insights
def _cons_label(c: dict) -> str:
    kb = get_kb()
    return " · ".join(filter(None, (kb.label(c["condition"]), kb.label(c["outcome"]), kb.label(c["geometry"]))))


@app.get("/api/consensus")
def consensus(status: str = ""):
    kb = get_kb()
    rows = [c for c in kb.consensus if not status or c["status"] == status]
    return [{k: v for k, v in c.items() if k != "sides"} | {"label": _cons_label(c)} for c in rows]


@app.get("/api/consensus/{cid:path}")
def consensus_one(cid: str):
    kb = get_kb()
    if cid not in kb.consensus_by_id:
        raise HTTPException(404, "not found")
    c = kb.consensus_by_id[cid]
    return c | {"label": _cons_label(c), "labels": {k: kb.label(c[k]) for k in ("condition", "outcome", "geometry")}}


@app.get("/api/gaps")
def gaps():
    return get_kb().gaps


@app.get("/api/trends")
def trends():
    return get_kb().trends


@app.get("/api/takeaways")
def takeaways():
    return get_kb().takeaways


@app.get("/api/topic/{tid:path}")
def topic(tid: str):
    """Topic synthesis for one flame geometry: takeaways, evidence groups, trend, most central papers."""
    kb = get_kb()
    if tid not in kb.node:
        raise HTTPException(404, "unknown topic")
    fs = [f for f in kb.findings if f.get("geometry") == tid]
    pids = Counter(f["paper_id"] for f in fs)
    years = Counter(int(kb.paper[p]["year"]) for p in pids if kb.paper[p].get("year"))
    return {"id": tid, "label": kb.label(tid), "takeaways": kb.takeaways.get(tid, {}).get("items", []),
            "n_papers": len(pids), "n_findings": len(fs),
            "consensus": [c | {"label": _cons_label(c)} for c in sorted((c for c in kb.consensus if c["geometry"] == tid), key=lambda c: -c["n_papers"])],
            "by_year": sorted(years.items()),
            "papers": [kb.paper_card(p) for p, _ in pids.most_common(12)]}


@app.get("/api/compare")
def compare(ids: str):
    """Side-by-side comparison of 2-4 papers: design, entities, findings and what they share."""
    kb = get_kb()
    want = [i for i in ids.split(",") if i][:4]
    missing = [i for i in want if i not in kb.paper]
    if len(want) < 2 or missing:
        raise HTTPException(422, f"need 2-4 known paper ids; unknown: {missing}")
    fields = ("fuels", "conditions", "platforms", "geometries")
    items = []
    for pid in want:
        p = kb.paper[pid]
        items.append(kb.paper_card(pid) | {"duration": p.get("duration"), "atmosphere": p.get("atmosphere"), "experiments": p.get("experiments", []), "limitations": p.get("limitations", []),
                                           "summary": p["summary"], "findings": [kb.finding_card(f["id"]) for f in kb.findings_by_paper[pid][:8]]})
    shared = {f: sorted(set.intersection(*(set(kb.paper[i].get(f, [])) for i in want))) for f in fields}
    keyed = [{(f["condition"], f["outcome"]): f["direction"] for f in kb.findings_by_paper[i]} for i in want]
    common = set.intersection(*(set(k) for k in keyed))
    agreement = [{"condition": kb.label(s), "outcome": kb.label(o), "directions": [k[(s, o)] for k in keyed],
                  "agree": len({k[(s, o)] for k in keyed}) == 1} for s, o in sorted(common)]
    labels = {e: kb.label(e) for it in items for f in fields for e in it.get(f) or []}
    return {"items": items, "shared": shared, "agreement": agreement, "labels": labels}


@app.get("/api/glossary")
def glossary():
    return all_terms()


# ------------------------------------------------------------------ export
@app.get("/api/export/papers")
def export_papers(format: Literal["bibtex", "ris", "csv"] = "csv", ids: str = ""):
    kb = get_kb()
    ps = [kb.paper[i] for i in ids.split(",") if i in kb.paper] if ids else kb.papers
    body = {"bibtex": X.bibtex, "ris": X.ris, "csv": X.papers_csv}[format](ps)
    ext = {"bibtex": "bib", "ris": "ris", "csv": "csv"}[format]
    return PlainTextResponse(body, headers={"Content-Disposition": f'attachment; filename="emberfall-papers.{ext}"'})


@app.get("/api/export/{dataset}")
def export_dataset(dataset: Literal["findings", "consensus", "graph", "gaps", "entities"], format: Literal["json", "csv"] = "json"):
    """Open data: download the structured knowledge base (derived from NASA NTRS public reports)."""
    kb = get_kb()
    if format == "csv":
        if dataset == "findings":
            body = X.findings_csv(kb.findings)
        elif dataset == "consensus":
            body = X.consensus_csv(kb.consensus)
        else:
            raise HTTPException(422, "csv is available for findings and consensus; use json for the rest")
        return PlainTextResponse(body, headers={"Content-Disposition": f'attachment; filename="{dataset}.csv"'})
    obj = {"findings": kb.findings, "consensus": kb.consensus, "graph": kb.graph, "gaps": kb.gaps, "entities": kb.entities}[dataset]
    return PlainTextResponse(json.dumps(obj), media_type="application/json",
                             headers={"Content-Disposition": f'attachment; filename="{dataset}.json"'})


@app.get("/api/hypotheses")
def hypotheses():
    kb = get_kb()
    return [h | {"a_label": kb.label(h["a"]), "c_label": kb.label(h["c"]),
                 "bridges": [b | {"label": kb.label(b["b"])} for b in h["bridges"]]} for h in kb.hypotheses]


# ---------------------------------------------------------------- mission
class Profile(BaseModel):
    name: str = "Custom mission"
    destination: str = "Mars"
    duration_days: int = Field(180, ge=1, le=3000)
    microgravity_days: int = Field(180, ge=0, le=3000)
    partial_gravity_days: int = Field(0, ge=0, le=3000)
    o2_percent: float = Field(21.0, ge=15, le=100)
    pressure_kpa: float = Field(101.3, ge=20, le=110)
    comm_delay_min: float = Field(0, ge=0, le=60)
    crew: int = Field(4, ge=1, le=12)


@app.get("/api/mission/presets")
def mission_presets():
    return M.presets()


@app.get("/api/mission/{preset}")
def mission_preset(preset: str):
    if preset not in MISSION_PRESETS:
        raise HTTPException(404, "unknown preset")
    return M.briefing(get_kb(), MISSION_PRESETS[preset])


@app.post("/api/mission")
def mission_custom(p: Profile):
    return M.briefing(get_kb(), p.model_dump())


# ------------------------------------------------------------------- eval
@app.get("/api/eval")
def eval_results():
    f = KB_DIR / "eval_results.json"  # re-read so a fresh eval run shows up without restarting
    if not f.exists():
        raise HTTPException(404, "run `uv run python -m eval.run_eval` first")
    return json.loads(f.read_text())


@app.get("/api/suggest")
def suggest(q: str = ""):
    """Entity autocomplete for search boxes."""
    kb = get_kb()
    ql = q.lower().strip()
    if len(ql) < 2:
        return []
    out = []
    for e in kb.entities:
        names = [e["label"]] + e.get("synonyms", [])
        if any(re.search(r"\b" + re.escape(ql), n.lower()) for n in names):
            out.append({"id": e["id"], "label": e["label"], "type": e["type"], "papers": kb.node.get(e["id"], {}).get("papers", 0)})
    return sorted(out, key=lambda x: -x["papers"])[:8]

"""Space Biology Knowledge Engine API.

Run:  uv run uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import json
import os
import re
from collections import Counter

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app import mission as M
from app.answer import answer, llm_available
from app.kb import get_kb
from app.retrieval import search as hybrid_search
from pipeline.paths import KB_DIR
from pipeline.risks import MISSION_PRESETS

app = FastAPI(title="Space Biology Knowledge Engine", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("SBA_CORS", "*").split(","), allow_methods=["*"], allow_headers=["*"])


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
    return kb.stats | {"llm": llm_available(), "top": {t: top(t, 8) for t in ("organism", "stressor", "tissue", "outcome")},
                       "contradictions_preview": [c | {"label": _cons_label(c)} for c in kb.consensus if c["status"] == "contradictory"][:3],
                       "hypotheses_preview": kb.hypotheses[:3]}


@app.get("/api/entities")
def entities():
    kb = get_kb()
    counts = {n["id"]: n["papers"] for n in kb.graph["nodes"]}
    return [e | {"papers": counts.get(e["id"], 0)} for e in kb.entities]


# ------------------------------------------------------------------ papers
@app.get("/api/papers")
def papers(q: str = "", organism: str = "", stressor: str = "", tissue: str = "", study_type: str = "", osdr: bool = False,
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
    for field, val in (("organisms", organism), ("stressors", stressor), ("tissues", tissue)):
        if val:
            items = [p for p in items if val in p.get(field, [])]
    if study_type:
        items = [p for p in items if p["study_type"] in study_type.split(",")]
    if osdr:
        items = [p for p in items if p.get("osdr_ids")]
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
    mine = set(p.get("organisms", []) + p.get("stressors", []) + p.get("tissues", []))
    related = sorted(((len(mine & set(o.get("organisms", []) + o.get("stressors", []) + o.get("tissues", []))), o["id"])
                      for o in kb.papers if o["id"] != pid), reverse=True)[:6]
    sections = Counter(kb.chunks[i]["section"] for i in kb.chunks_by_paper[pid])
    return kb.paper_card(pid) | {
        "authors": p["authors"], "keywords": p.get("keywords", []), "abstract": p["abstract"], "summary": p["summary"],
        "duration": p.get("duration"), "word_count": p.get("word_count"),
        "findings": [kb.finding_card(f["id"]) for f in kb.findings_by_paper[pid]],
        "sections": dict(sections),
        "osdr": [{"id": o, "url": f"https://osdr.nasa.gov/bio/repo/data/studies/{o.replace('GLDS', 'OSD')}"} for o in p.get("osdr_ids", [])],
        "related": [kb.paper_card(i) for n, i in related if n >= 2],
        "labels": {e: kb.label(e) for e in mine},
    }


@app.get("/api/papers/{pid}/chunks")
def paper_chunks(pid: str, section: str = ""):
    kb = get_kb()
    return [kb.chunks[i] for i in kb.chunks_by_paper.get(pid, []) if not section or kb.chunks[i]["section"] == section]


# ---------------------------------------------------------------- search / ask
@app.get("/api/search")
def search(q: str, k: int = Query(10, le=50), study_type: str = "", organism: str = ""):
    filters = {"study_type": study_type.split(",") if study_type else None, "organism": organism or None}
    return hybrid_search(get_kb(), q, k=k, filters=filters)


@app.get("/api/ask")
async def ask(q: str = Query(..., min_length=3, max_length=500), persona: str = "scientist", study_type: str = ""):
    filters = {"study_type": study_type.split(",")} if study_type else None

    async def gen():
        async for ev in answer(get_kb(), q, persona, filters=filters):
            yield {"event": ev["event"], "data": json.dumps(ev["data"])}

    return EventSourceResponse(gen())


# ------------------------------------------------------------------ graph
@app.get("/api/graph")
def graph(focus: str = "", types: str = "", min_papers: int = 2, depth: int = 1, limit: int = 160):
    kb = get_kb()
    allowed = set(types.split(",")) if types else None
    nodes = {n["id"]: n for n in kb.graph["nodes"] if (not allowed or n["type"] in allowed)}
    edges = [e for e in kb.graph["edges"] if e["source"] in nodes and e["target"] in nodes and e["paper_count"] >= min_papers]
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
    used = {e["source"] for e in edges} | {e["target"] for e in edges} | ({focus} if focus in nodes else set())
    slim = lambda e: {k: e[k] for k in ("id", "source", "target", "relation", "paper_count", "majority", "agreement", "strength", "directions")}
    return {"nodes": [nodes[i] for i in used], "edges": [slim(e) for e in edges]}


@app.get("/api/graph/node/{nid:path}")
def graph_node(nid: str):
    kb = get_kb()
    if nid not in kb.node:
        raise HTTPException(404, "node not found")
    edges = [e for e in kb.graph["edges"] if nid in (e["source"], e["target"])]
    pids = sorted({p for e in edges for p in e["papers"]}, key=lambda p: -int(kb.paper[p].get("year") or 0))
    ent = next((e for e in kb.entities if e["id"] == nid), {})
    neigh = sorted(({"id": e["target"] if e["source"] == nid else e["source"], "relation": e["relation"], "edge": e["id"],
                     "papers": e["paper_count"], "majority": e["majority"]} for e in edges), key=lambda x: -x["papers"])
    for n in neigh:
        n["label"] = kb.label(n["id"])
    return kb.node[nid] | {"synonyms": ent.get("synonyms", []), "neighbors": neigh[:30],
                           "papers": [kb.paper_card(p) for p in pids[:25]],
                           "consensus": [c | {"label": _cons_label(c)} for c in kb.consensus
                                         if nid in (c["stressor"], c["outcome"], c["tissue"])][:8]}


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
    return " · ".join(filter(None, (kb.label(c["stressor"]), kb.label(c["outcome"]), kb.label(c["tissue"]))))


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
    return c | {"label": _cons_label(c), "labels": {k: kb.label(c[k]) for k in ("stressor", "outcome", "tissue")}}


@app.get("/api/gaps")
def gaps():
    return get_kb().gaps


@app.get("/api/trends")
def trends():
    return get_kb().trends


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
    dose_msv_per_day: float = Field(0.5, ge=0, le=10)
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

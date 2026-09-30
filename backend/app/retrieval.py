"""Hybrid retrieval: BM25 + dense vectors + knowledge-graph expansion, fused with RRF."""
from __future__ import annotations

import re
from collections import defaultdict

import numpy as np

from app.kb import KB
from pipeline import ontology as O

STOP = set("""a an the of in on at to for and or but with without by from is are was were be been being do does did what which who
whom how why when where that this these those it its as into about than then there their them they we our you your can could should
would may might will shall not no yes any all some more most less least very much many such effect effects affect affects study
studies research known know tell show shows does doing between during under over after before within across""".split())


def query_terms(q: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9][a-z0-9\-]+", q.lower()) if t not in STOP and len(t) > 2]


def query_entities(q: str) -> list[str]:
    ids = []
    for t in ("stressor", "organism", "tissue", "outcome", "countermeasure", "gene"):
        ids += [e.id for e, _ in O.find(t, q)]
    return ids


def coverage(text: str, terms: list[str]) -> float:
    if not terms:
        return 0.0
    low = text.lower()
    return sum(1 for t in terms if t[:6] in low) / len(terms)


def search(kb: KB, q: str, k: int = 10, per_paper: int = 2, filters: dict | None = None) -> dict:
    import bm25s

    n = len(kb.chunks)
    ranks: dict[int, float] = defaultdict(float)
    # 1. lexical
    res, scores = kb.bm25.retrieve(bm25s.tokenize([q], stopwords="en", show_progress=False), k=min(200, n), show_progress=False)
    for r, (i, s) in enumerate(zip(res[0], scores[0])):
        if s > 0:
            ranks[int(i)] += 1 / (60 + r)
    # 2. dense
    if kb.embedder is not None:
        qv = np.array(list(kb.embedder.query_embed([q]))[0], dtype=np.float32)
        qv /= np.linalg.norm(qv)
        sims = kb.embeddings @ qv
        for r, i in enumerate(np.argsort(-sims)[:200]):
            ranks[int(i)] += 1 / (60 + r)
    # 3. graph expansion: chunks tagged with the query's entities get a boost
    ents = query_entities(q)
    if ents:
        es = set(ents)
        for i in list(ranks):
            overlap = len(es & set(kb.chunks[i].get("entities", [])))
            ranks[i] += 0.004 * overlap
    terms = query_terms(q)
    # 4. light rerank: term coverage + section prior (results/abstract carry findings)
    prior = {"ABSTRACT": 0.004, "RESULTS": 0.004, "CONCL": 0.004, "DISCUSS": 0.002, "INTRO": -0.002, "METHODS": -0.004, "FIG": 0.0}
    scored = []
    for i, s in ranks.items():
        c = kb.chunks[i]
        if filters:
            p = kb.paper[c["paper_id"]]
            if filters.get("study_type") and p["study_type"] not in filters["study_type"]:
                continue
            if filters.get("organism") and filters["organism"] not in p.get("organisms", []):
                continue
        cov = coverage(c["text"], terms)
        scored.append((s + 0.01 * cov + prior.get(c["section"], 0), cov, i))
    scored.sort(reverse=True)
    out, per = [], defaultdict(int)
    for s, cov, i in scored:
        c = kb.chunks[i]
        if per[c["paper_id"]] >= per_paper:
            continue
        per[c["paper_id"]] += 1
        p = kb.paper[c["paper_id"]]
        out.append({"chunk_id": c["id"], "paper_id": p["id"], "title": p["title"], "year": p["year"], "url": p["url"],
                    "section": c["section"], "text": c["text"], "entities": c.get("entities", []),
                    "study_type": p["study_type"], "score": round(s, 5), "coverage": round(cov, 2)})
        if len(out) >= k:
            break
    return {"query": q, "terms": terms, "entities": ents, "passages": out}

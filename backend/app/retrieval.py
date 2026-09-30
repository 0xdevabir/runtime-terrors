"""Hybrid retrieval: BM25 + dense vectors + knowledge-graph expansion, fused with RRF.

Optional cross-encoder rerank (SBA_RERANK=1, fastembed ms-marco-MiniLM) over the top candidates.
`mode` selects a baseline for evaluation: "bm25", "dense", "hybrid" (default) or "rerank".
"""
from __future__ import annotations

import json
import os
import re
from collections import OrderedDict, defaultdict
from functools import lru_cache

import numpy as np

from app.kb import KB
from pipeline import ontology as O

STOP = set("""a an the of in on at to for and or but with without by from is are was were be been being do does did what which who
whom how why when where that this these those it its as into about than then there their them they we our you your can could should
would may might will shall not no yes any all some more most less least very much many such effect effects affect affects study
studies research known know tell show shows does doing between during under over after before within across""".split())
RERANK_DEFAULT = os.environ.get("SBA_RERANK", "0") == "1"
PLAIN = re.compile(r"^[A-Za-z][A-Za-z0-9 \-]{2,40}$")


def query_terms(q: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9][a-z0-9\-]+", q.lower()) if t not in STOP and len(t) > 2]


def query_entities(q: str) -> list[str]:
    ids = []
    for t in ("stressor", "organism", "tissue", "outcome", "countermeasure", "gene"):
        ids += [e.id for e, _ in O.find(t, q)]
    return ids


@lru_cache(maxsize=None)
def synonyms(eid: str) -> tuple[str, ...]:
    """Plain-text synonyms of an entity (regex patterns without metacharacters), for lexical query expansion."""
    e = O.BY_ID[eid]
    out = [e.label.split(" / ")[0].split(" (")[0]]
    out += [p.replace(r"\-", "-") for p in e.patterns if PLAIN.match(p.replace(r"\-", "-"))]
    return tuple(dict.fromkeys(s.lower() for s in out))[:4]


def expand_query(q: str, ents: list[str]) -> str:
    low = q.lower()
    extra = [s for e in ents for s in synonyms(e) if s not in low]
    return q + (" " + " ".join(extra) if extra else "")


def coverage(text: str, terms: list[str]) -> float:
    if not terms:
        return 0.0
    low = text.lower()
    return sum(1 for t in terms if t[:6] in low) / len(terms)


def _passes(p: dict, c: dict, filters: dict) -> bool:
    if filters.get("study_type") and p["study_type"] not in filters["study_type"]:
        return False
    for key, field in (("organism", "organisms"), ("stressor", "stressors"), ("tissue", "tissues")):
        want = filters.get(key)
        if want:
            want = [want] if isinstance(want, str) else want
            have = set(p.get(field, [])) | set(c.get("entities", []))
            if not have & set(want):
                return False
    y = p.get("year") or 0
    if filters.get("year_min") and y < int(filters["year_min"]):
        return False
    if filters.get("year_max") and y > int(filters["year_max"]):
        return False
    return True


@lru_cache(maxsize=1)
def _cross_encoder():
    try:
        from fastembed.rerank.cross_encoder import TextCrossEncoder
        return TextCrossEncoder("Xenova/ms-marco-MiniLM-L-6-v2")
    except Exception:
        return None


_CACHE: OrderedDict = OrderedDict()


def search(kb: KB, q: str, k: int = 10, per_paper: int = 2, filters: dict | None = None, mode: str | None = None) -> dict:
    mode = mode or ("rerank" if RERANK_DEFAULT else "hybrid")
    key = (q, k, per_paper, json.dumps(filters or {}, sort_keys=True), mode, id(kb))
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    out = _search(kb, q, k, per_paper, filters or {}, mode)
    _CACHE[key] = out
    if len(_CACHE) > 512:
        _CACHE.popitem(last=False)
    return out


def _search(kb: KB, q: str, k: int, per_paper: int, filters: dict, mode: str) -> dict:
    import bm25s

    n = len(kb.chunks)
    ranks: dict[int, float] = defaultdict(float)
    ents = query_entities(q)
    use_dense = mode in ("dense", "hybrid", "rerank") and kb.embedder is not None
    # 1. lexical, with ontology-synonym expansion ("bone loss" also finds "osteopenia")
    if mode != "dense" or not use_dense:
        res, scores = kb.bm25.retrieve(bm25s.tokenize([expand_query(q, ents) if mode != "bm25" else q], stopwords="en",
                                                      show_progress=False), k=min(200, n), show_progress=False)
        for r, (i, s) in enumerate(zip(res[0], scores[0])):
            if s > 0:
                ranks[int(i)] += 1 / (60 + r)
    # 2. dense
    if use_dense:
        qv = np.array(list(kb.embedder.query_embed([q]))[0], dtype=np.float32)
        qv /= np.linalg.norm(qv)
        sims = kb.embeddings @ qv
        for r, i in enumerate(np.argsort(-sims)[:200]):
            ranks[int(i)] += 1 / (60 + r)
    terms = query_terms(q)
    heuristic = mode not in ("bm25", "dense")
    # 3. graph expansion: chunks tagged with the query's entities get a boost
    if ents and heuristic:
        es = set(ents)
        for i in list(ranks):
            ranks[i] += 0.004 * len(es & set(kb.chunks[i].get("entities", [])))
    # 4. light rerank: term coverage + section prior (results/abstract carry findings)
    prior = {"ABSTRACT": 0.004, "RESULTS": 0.004, "CONCL": 0.004, "DISCUSS": 0.002, "INTRO": -0.002, "METHODS": -0.004, "FIG": 0.0}
    scored = []
    for i, s in ranks.items():
        c = kb.chunks[i]
        p = kb.paper[c["paper_id"]]
        if filters and not _passes(p, c, filters):
            continue
        cov = coverage(c["text"], terms)
        scored.append((s + (0.01 * cov + prior.get(c["section"], 0) if heuristic else 0), cov, i))
    scored.sort(reverse=True)
    # 5. optional cross-encoder over the head of the list
    reranked = False
    if mode == "rerank" and scored and (ce := _cross_encoder()) is not None:
        head = scored[:40]
        ce_scores = list(ce.rerank(q, [kb.chunks[i]["text"] for _, _, i in head]))
        order = np.argsort(-np.array(ce_scores))
        scored = [(float(ce_scores[j]), head[j][1], head[j][2]) for j in order] + scored[40:]
        reranked = True
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
    return {"query": q, "terms": terms, "entities": ents, "passages": out,
            "mode": mode if (mode != "rerank" or reranked) else "hybrid", "dense": use_dense}

"""In-memory knowledge base loaded once at API start-up."""
from __future__ import annotations

import json
from collections import defaultdict
from functools import cached_property

import numpy as np

from pipeline import ontology as O
from pipeline.paths import KB_DIR


class KB:
    def __init__(self) -> None:
        load = lambda n: json.loads((KB_DIR / n).read_text())
        self.papers: list[dict] = load("papers.json")
        self.paper = {p["id"]: p for p in self.papers}
        self.findings: list[dict] = load("findings.json")
        self.finding = {f["id"]: f for f in self.findings}
        self.graph: dict = load("graph.json")
        self.node = {n["id"]: n for n in self.graph["nodes"]}
        self.edge = {e["id"]: e for e in self.graph["edges"]}
        self.consensus: list[dict] = load("consensus.json")
        self.consensus_by_id = {c["id"]: c for c in self.consensus}
        self.gaps: dict = load("gaps.json")
        self.trends: dict = load("trends.json")
        self.risks: list[dict] = load("risk_evidence.json")
        self.hypotheses: list[dict] = load("hypotheses.json")
        self.stats: dict = load("stats.json")
        self.entities: list[dict] = load("entities.json")
        self.takeaways: dict = load("takeaways.json") if (KB_DIR / "takeaways.json").exists() else {}
        self.chunks: list[dict] = [json.loads(l) for l in open(KB_DIR / "chunks.jsonl")]
        self.findings_by_paper: dict[str, list] = defaultdict(list)
        for f in self.findings:
            self.findings_by_paper[f["paper_id"]].append(f)
        self.chunks_by_paper: dict[str, list] = defaultdict(list)
        for i, c in enumerate(self.chunks):
            self.chunks_by_paper[c["paper_id"]].append(i)
        emb = KB_DIR / "embeddings.npy"
        self.embeddings = np.load(emb).astype(np.float32) if emb.exists() else None
        if self.embeddings is not None and len(self.embeddings) != len(self.chunks):
            self.embeddings = None  # stale index from an older build
        eval_file = KB_DIR / "eval_results.json"
        self.eval = json.loads(eval_file.read_text()) if eval_file.exists() else None

    @cached_property
    def bm25(self):
        import bm25s
        return bm25s.BM25.load(str(KB_DIR / "bm25"))

    @cached_property
    def embedder(self):
        if self.embeddings is None:
            return None
        try:
            from fastembed import TextEmbedding
            return TextEmbedding("BAAI/bge-small-en-v1.5")
        except Exception:
            return None

    # ---------------------------------------------------------------- helpers
    def label(self, eid: str | None) -> str | None:
        return O.BY_ID[eid].label if eid and eid in O.BY_ID else None

    def paper_card(self, pid: str) -> dict:
        p = self.paper[pid]
        return {k: p.get(k) for k in ("id", "title", "year", "journal", "center", "report_type", "url", "doi", "study_type",
                                      "fuels", "conditions", "platforms", "geometries", "experiments", "full_text", "n_findings",
                                      "n_tests", "missions", "duration", "duplicate_of")} | {
            "key_finding": p["summary"]["key_finding"], "authors": p["authors"][:3], "n_authors": len(p["authors"])}

    def finding_card(self, fid: str) -> dict:
        f = self.finding[fid]
        p = self.paper[f["paper_id"]]
        return {**f, "paper_title": p["title"], "paper_url": p["url"], "labels": {
            k: self.label(f.get(k)) for k in ("fuel", "condition", "geometry", "outcome", "countermeasure")}}


_kb: KB | None = None


def get_kb() -> KB:
    global _kb
    if _kb is None:
        _kb = KB()
    return _kb

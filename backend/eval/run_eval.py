"""Retrieval + answer-quality evaluation.

Answerable questions carry a `gold` regex over paper titles; a hit means a
retrieved paper's title matches it. Unanswerable (off-domain) questions must be
refused. Every answer is also checked for citations pointing outside the
retrieved context, and each cited sentence is scored for support by the passages
it cites (faithfulness). Retrieval is also run in baseline modes (BM25-only,
dense-only, hybrid, hybrid + cross-encoder) so the gain of each stage is visible.
If eval/extraction_labels.csv has human labels, extraction precision is added.
Writes data/kb/eval_results.json, which /api/eval serves.

    uv run python -m eval.run_eval [--no-rerank]
"""
import asyncio
import json
import re
import statistics
import sys
import time
from pathlib import Path

from eval.extraction import extraction_metrics

from app.answer import answer, llm_provider
from app.kb import get_kb
from pipeline.paths import KB_DIR

HERE = Path(__file__).parent
K = 10


async def run_one(kb, item: dict) -> dict:
    t0 = time.perf_counter()
    passages, done, text = [], {}, ""
    async for ev in answer(kb, item["q"], k=8):
        if ev["event"] == "retrieval":
            passages = ev["data"]["passages"]
        elif ev["event"] == "token":
            text += ev["data"]["text"]
        else:
            done = ev["data"]
    latency = time.perf_counter() - t0
    scored = [s["score"] for s in done.get("support", []) if s["score"] is not None]
    row = {"q": item["q"], "refused": done.get("refused", False), "latency_s": round(latency, 3),
           "support": round(sum(scored) / len(scored), 3) if scored else None,
           "supported_share": round(sum(x >= 0.5 for x in scored) / len(scored), 3) if scored else None,
           "confidence": (done.get("confidence") or {}).get("score"),
           "n_citations": len(done.get("citations", [])), "invalid_citations": len(done.get("invalid_citations", [])),
           "answer_preview": text[:280]}
    if item.get("unanswerable"):
        row |= {"type": "unanswerable", "correct_refusal": row["refused"]}
        return row
    gold = re.compile(item["gold"], re.I)
    # retrieval ranking at paper level, deeper than the answer context
    from app.retrieval import search
    m, ranked = rank_metrics(kb, item["q"], gold, "hybrid")
    row |= {"type": "answerable", **m, "top_titles": [kb.paper[p]["title"] for p in ranked[:3]], "correct_refusal": not row["refused"]}
    return row


def rank_metrics(kb, q: str, gold: re.Pattern, mode: str) -> tuple[dict, list[str]]:
    from app.retrieval import search
    ranked = []
    for p in search(kb, q, k=K, mode=mode)["passages"]:
        if p["paper_id"] not in ranked:
            ranked.append(p["paper_id"])
    hits = [i for i, pid in enumerate(ranked) if gold.search(kb.paper[pid]["title"])]
    first = hits[0] + 1 if hits else None
    return {"hit@1": first == 1, "hit@3": bool(first and first <= 3), "hit@5": bool(first and first <= 5),
            "hit@10": first is not None, "rr": 1 / first if first else 0.0,
            "precision@5": sum(1 for h in hits if h < 5) / min(5, len(ranked) or 1)}, ranked


def baselines(kb, items: list[dict], rerank: bool) -> dict:
    """Retrieval-only metrics per pipeline stage."""
    from app.retrieval import _cross_encoder
    modes = ["bm25"] + (["dense"] if kb.embedder is not None else []) + ["hybrid"] + (["rerank"] if rerank and _cross_encoder() else [])
    ans = [it for it in items if not it.get("unanswerable")]
    out = {}
    for mode in modes:
        rows = [rank_metrics(kb, it["q"], re.compile(it["gold"], re.I), mode)[0] for it in ans]
        out[mode] = {k: round(sum(r[k] for r in rows) / len(rows), 3) for k in ("hit@1", "hit@5", "hit@10", "rr")}
    return out


async def main() -> None:
    kb = get_kb()
    items = [json.loads(line) for line in (HERE / "questions.jsonl").read_text().splitlines() if line.strip()]
    rows = [await run_one(kb, it) for it in items]
    base = baselines(kb, items, rerank="--no-rerank" not in sys.argv)
    ans = [r for r in rows if r["type"] == "answerable"]
    un = [r for r in rows if r["type"] == "unanswerable"]
    mean = lambda xs: round(sum(xs) / len(xs), 3) if xs else None  # noqa: E731
    total_cites = sum(r["n_citations"] + r["invalid_citations"] for r in rows)
    qg = kb.stats.get("quote_guard", {})
    out = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
        "mode": llm_provider() or "extractive",
        "dense_retrieval": kb.embeddings is not None,
        "n_questions": len(rows), "n_answerable": len(ans), "n_unanswerable": len(un),
        "metrics": {
            "hit@1": mean([r["hit@1"] for r in ans]), "hit@3": mean([r["hit@3"] for r in ans]),
            "hit@5": mean([r["hit@5"] for r in ans]), "hit@10": mean([r["hit@10"] for r in ans]),
            "mrr": mean([r["rr"] for r in ans]), "precision@5": mean([r["precision@5"] for r in ans]),
            "answer_rate": mean([r["correct_refusal"] for r in ans]),
            "refusal_accuracy": mean([r["correct_refusal"] for r in un]),
            "citation_validity": round(1 - sum(r["invalid_citations"] for r in rows) / total_cites, 3) if total_cites else None,
            "quote_guard": round(qg.get("rules_verified", 0) / qg["rules_total"], 3) if qg.get("rules_total") else None,
            "latency_p50_s": round(statistics.median(r["latency_s"] for r in rows), 3),
            "faithfulness": mean([r["support"] for r in ans if r["support"] is not None]),
            "supported_sentences": mean([r["supported_share"] for r in ans if r["supported_share"] is not None]),
            "mean_confidence": mean([r["confidence"] for r in ans if r["confidence"] is not None and not r["refused"]]),
        },
        "baselines": base,
        "extraction": extraction_metrics(),
        "rows": rows,
    }
    (KB_DIR / "eval_results.json").write_text(json.dumps(out, indent=1))
    m = out["metrics"]
    print(f"[eval] {len(rows)} questions · hit@5 {m['hit@5']} · MRR {m['mrr']} · refusal acc {m['refusal_accuracy']} · "
          f"answer rate {m['answer_rate']} · citation validity {m['citation_validity']} · faithfulness {m['faithfulness']}")
    for mode, b in base.items():
        print(f"[eval]   {mode:7s} hit@1 {b['hit@1']} · hit@5 {b['hit@5']} · MRR {b['rr']}")


if __name__ == "__main__":
    asyncio.run(main())

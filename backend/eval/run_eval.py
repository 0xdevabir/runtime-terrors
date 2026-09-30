"""Retrieval + answer-quality evaluation.

Answerable questions carry a `gold` regex over paper titles; a hit means a
retrieved paper's title matches it. Unanswerable (off-domain) questions must be
refused. Every answer is also checked for citations pointing outside the
retrieved context. Writes data/kb/eval_results.json, which /api/eval serves.

    uv run python -m eval.run_eval
"""
import asyncio
import json
import re
import statistics
import time
from pathlib import Path

from app.answer import answer, llm_available
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
    row = {"q": item["q"], "refused": done.get("refused", False), "latency_s": round(latency, 3),
           "n_citations": len(done.get("citations", [])), "invalid_citations": len(done.get("invalid_citations", [])),
           "answer_preview": text[:280]}
    if item.get("unanswerable"):
        row |= {"type": "unanswerable", "correct_refusal": row["refused"]}
        return row
    gold = re.compile(item["gold"], re.I)
    # retrieval ranking at paper level, deeper than the answer context
    from app.retrieval import search
    ranked = []
    for p in search(kb, item["q"], k=K)["passages"]:
        if p["paper_id"] not in ranked:
            ranked.append(p["paper_id"])
    hits = [i for i, pid in enumerate(ranked) if gold.search(kb.paper[pid]["title"])]
    first = hits[0] + 1 if hits else None
    row |= {"type": "answerable", "hit@1": first == 1, "hit@3": bool(first and first <= 3),
            "hit@5": bool(first and first <= 5), "hit@10": first is not None, "rr": 1 / first if first else 0.0,
            "precision@5": sum(1 for h in hits if h < 5) / min(5, len(ranked) or 1),
            "top_titles": [kb.paper[p]["title"] for p in ranked[:3]], "correct_refusal": not row["refused"]}
    return row


async def main() -> None:
    kb = get_kb()
    items = [json.loads(line) for line in (HERE / "questions.jsonl").read_text().splitlines() if line.strip()]
    rows = [await run_one(kb, it) for it in items]
    ans = [r for r in rows if r["type"] == "answerable"]
    un = [r for r in rows if r["type"] == "unanswerable"]
    mean = lambda xs: round(sum(xs) / len(xs), 3) if xs else None  # noqa: E731
    total_cites = sum(r["n_citations"] + r["invalid_citations"] for r in rows)
    qg = kb.stats.get("quote_guard", {})
    out = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M"),
        "mode": "claude" if llm_available() else "extractive",
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
        },
        "rows": rows,
    }
    (KB_DIR / "eval_results.json").write_text(json.dumps(out, indent=1))
    m = out["metrics"]
    print(f"[eval] {len(rows)} questions · hit@5 {m['hit@5']} · MRR {m['mrr']} · refusal acc {m['refusal_accuracy']} · "
          f"answer rate {m['answer_rate']} · citation validity {m['citation_validity']}")


if __name__ == "__main__":
    asyncio.run(main())

# Emberfall — Flame in Freefall

NASA Space Apps Challenge — *AI-Powered Fire Safety Insights from Microgravity Combustion Data*. Team **runtime-terror**.

An iOS-style web app that turns NASA microgravity combustion and spacecraft fire-safety literature into a searchable knowledge engine: ask cited questions, map evidence, spot conflicts and gaps, and brief missions on fire risk.

| Surface | What it does |
| --- | --- |
| **Ask** | Q&A over retrieved passages with hybrid BM25 + dense retrieval (optional cross-encoder rerank). Every sentence is cited `[n]` and every citation is checked; off-topic or thin-evidence questions are refused. Also: per-claim support scores and an overall confidence rating, follow-ups, comparison questions, filters, share links, and 👍/👎 feedback. Four personas: Scientist, Safety manager, Habitat architect, Student. |
| **Papers** | Browse and filter the combustion / fire-safety corpus. Each paper has multi-level summaries, findings with verbatim quotes, limitations and duplicate detection. Save papers, compare them side by side, and export BibTeX / RIS / CSV. |
| **Graph** | Knowledge graph of fuels, atmospheres, geometries, outcomes and countermeasures. Filter by year and colour by theme. Evidence paths connect any two concepts. Export PNG or JSON. |
| **Insights** | Consensus, conflicts and emerging topics: vote splits per claim, each side's quotes, and likely reasons studies disagree (oxygen %, gravity level, scale, diagnostics). |
| **Gaps** | Coverage matrices showing where the literature is thin — candidates for the next combustion experiment. |
| **Hypotheses** | Literature-based discovery (A–B, B–C, but never A–C) that suggests candidate experiments, each with bridging papers. |
| **Mission** | ISS / Artemis / Mars presets or custom parameters give a ranked fire-safety risk briefing: evidence, readiness, countermeasures, open conflicts and gaps. Exports to PDF. |
| **Glossary** | Plain-language definitions of combustion and freefall-fire terms, each with a link to ask about it. |
| **Trust** | An evaluation page. Retrieval: hit@k, MRR and per-stage baselines. Answers: refusal accuracy, citation validity, faithfulness. Extraction: accuracy against human labels. Also shows the safeguards. |

## Quick start

Needs [uv](https://docs.astral.sh/uv/), Node 20+ and pnpm.

```bash
make setup          # backend deps (uv) + web deps (pnpm)
make data           # fetch -> process -> build (only needed if data/kb is missing or stale)
make embed          # optional: dense embeddings for hybrid search (~30 min CPU, resumable)
make dev            # API on :8000 + web on :3000
make test           # backend unit tests
make up             # or: the whole stack in Docker (API :8000, web :3000)
```

Then open http://localhost:3000. The built knowledge base (`data/kb/`) is committed, so
the app runs from a fresh clone without rebuilding.

**Optional: Claude.** Copy `backend/.env.example` to `backend/.env` and set `ANTHROPIC_API_KEY`.
Without a key the API still answers in extractive mode (cited sentences from retrieved passages).

## Architecture

```
publications list / NTRS metadata
   │  pipeline/fetch.py · ntrs.py   full text (PMC / NTRS PDFs), resumable, rate-limited
   ▼
data/raw/                    per-paper full text
   │  pipeline/process.py    sections, ~300-word passages, metadata
   │  pipeline/extract_*.py  findings (rules, or Claude via Batch API) with a verbatim-quote guard
   │  pipeline/build.py      entities (ontology.py) -> graph, consensus/conflicts, gaps,
   │                         trends, hypotheses, risks (risks.py), BM25 + embeddings
   ▼
data/kb/*.json|npy           the knowledge base (in memory, no database)
   │  app/main.py            FastAPI: /api/*, SSE streaming for /api/ask
   │  app/retrieval.py       hybrid BM25 + bge-small embeddings, reciprocal-rank fusion, entity boosts
   │  app/answer.py          refusal gate -> Claude or extractive answer -> citation check
   │  app/mission.py         mission-parameter fire-risk scoring
   ▼
web/ (Next.js 16, React 19, Tailwind v4, Cytoscape)   iOS-style UI, light/dark
```

### Data and AI used

- **NASA data:** microgravity combustion and spacecraft fire-safety publications (NTRS / open-access full text where available).
- **AI / retrieval:**
  - `BAAI/bge-small-en-v1.5` embeddings run locally with fastembed.
  - Claude (`claude-opus-5-5`, configurable) is optional: it writes answers and handles batch extraction.
  - Optional cross-encoder rerank via `SBA_RERANK=1`.

## Evaluation

```bash
make eval   # writes data/kb/eval_results.json; shown on the /eval page
```

The question set in `backend/eval/questions.jsonl` has in-domain and off-topic items. Relevance is judged by a
topic regex over paper titles, so the scores measure lenient topical retrieval, not exact-paper recall.

Each pipeline stage is scored separately (BM25, dense, hybrid, hybrid + rerank). On the current set hybrid scores best; the cross-encoder rerank stays off unless `SBA_RERANK=1`.

Human labels for extraction live in `backend/eval/extraction_labels.csv`. Fill in the `*_ok` columns (y/n) by reading each quote, then run `make eval`.

Feedback from 👍/👎 in Ask is appended to `data/logs/feedback.jsonl`.

## Deployment

- **API:**
  - Build with `make docker`. `backend/Dockerfile` bundles `data/kb` and the embedding model.
  - Image tag: `emberfall-api`.
- **Web:** deploy `web/` on Vercel and set `API_URL=https://<your-api>`, so the server proxies `/api/*`.
  - With `NEXT_PUBLIC_API_URL`, add the site origin to `SBA_CORS` on the API.

## Deviations from PLAN.md and limitations

- **Storage:** JSON and NumPy files held in memory instead of Postgres, pgvector and Neo4j. The corpus is small enough that this is faster and has nothing to operate.
- **Rule-based extraction (no key):** it reads direction words (increase, decrease, no change) near known entities. Negation and more complex claims can be misread. The quote guard ensures every finding is a real sentence, but not that its label is right. Claude extraction (`make extract`) improves this.
- **Conversation memory:** follow-ups use the last 4 turns and rewrite the question around the entities in them. It is heuristic, not a full dialogue model.

## License

Code: MIT (see `LICENSE`). The papers belong to their authors and publishers. Text is fetched from open-access services and used under each article's license. The derived `data/kb/` is for research and educational use.
See `CONTRIBUTING.md` to report a wrong answer or contribute.

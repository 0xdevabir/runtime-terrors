# Space Biology Knowledge Engine

NASA Space Apps Challenge — *Build a Space Biology Knowledge Engine*. Team **runtime-terror**.

An iOS-style web app that turns the **607 NASA space-biology publications** (572 unique PMC papers) in
[`SB_publication_PMC.csv`](https://github.com/jgalazka/SB_publications) into something
scientists, mission architects and program managers can actually use: grounded answers with
citations, a knowledge graph, where studies agree and disagree, what has never been studied,
and a per-mission risk briefing.

| | |
|---|---|
| **Ask** | Q&A over 17k passages with hybrid BM25 + dense retrieval (optional cross-encoder rerank). Every sentence is cited `[n]` and every citation is checked; off-topic or thin-evidence questions are refused. Also: per-claim support scores and an overall confidence rating, follow-up questions ("what about in rats?"), comparison questions ("mice vs humans"), filters (study type, organism, stressor, tissue, years), share links, and 👍/👎 feedback. Four personas: Scientist, Mission architect, Manager, Student. |
| **Papers** | Browse and filter all 572 papers by study type, organism, stressor, tissue and OSDR link. Each paper has 3-level summaries, findings with verbatim quotes, sample size, dose, missions, limitations and duplicate detection. Save papers, compare them side by side, and export BibTeX / RIS / CSV. |
| **Graph** | Knowledge graph of organisms, stressors, tissues, outcomes and countermeasures. Filter by year and colour by theme (community detection). Key concepts come from PageRank and betweenness. Evidence paths connect any two concepts. Export PNG or JSON. Click any node or edge to see its papers. |
| **Topics** | Key takeaways per tissue or system: consensus, conflicts, a timeline and papers grouped by evidence. |
| **Insights** | Consensus, conflicts and emerging topics: vote splits per claim with a timeline of how the votes built up, each side's quotes, and the likely reasons they disagree (species, ground analog vs. flight, duration). |
| **Gaps** | Heatmaps of organism/tissue/outcome × stressor, plus conspicuous gaps (cells far below what their row and column totals predict), species bias (few human studies) and exposure duration vs. a Mars mission. |
| **Trends** | Research topics over time, study designs, rising and fading topics, and new findings that challenge the consensus. |
| **Hypotheses** | Literature-based discovery (A–B, B–C, but never A–C) that suggests candidate experiments, each with bridging papers. |
| **Mission** | ISS / Artemis / Mars presets or custom parameters give a ranked biological risk briefing: evidence, readiness, countermeasures, open conflicts and gaps. Exports to PDF. |
| **Glossary** | Plain-language definitions of space-biology terms, each with a link to ask about it. |
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
`make data` is optional. Run `make help` to list every target.

**Optional: Claude.** Copy `backend/.env.example` to `backend/.env` and set `ANTHROPIC_API_KEY`.
Without a key, everything runs offline in extractive mode: answers are composed from quoted
sentences and extraction is rule-based. With a key:
- **Ask** streams Claude-written answers, grounded in the retrieved passages.
- `make extract` then `make collect` runs LLM extraction and summaries over the whole corpus through the Message Batches API.

## Architecture

```
SB_publication_PMC.csv
   │  pipeline/fetch.py      PMC BioC JSON (efetch XML fallback), resumable, rate-limited
   ▼
data/raw/                    per-paper full text
   │  pipeline/process.py    sections, ~300-word passages, metadata, OSDR accessions
   │  pipeline/extract_*.py  findings (rules, or Claude via Batch API) with a verbatim-quote guard
   │  pipeline/build.py      entities (ontology.py) -> graph, consensus/conflicts, gaps,
   │                         trends, hypotheses, risks (risks.py), BM25 + embeddings
   ▼
data/kb/*.json|npy           the knowledge base (in memory, no database)
   │  app/main.py            FastAPI: /api/*, SSE streaming for /api/ask
   │  app/retrieval.py       hybrid BM25 + bge-small embeddings, reciprocal-rank fusion, entity boosts
   │  app/answer.py          refusal gate -> Claude or extractive answer -> citation check
   │  app/mission.py         mission-parameter risk scoring
   ▼
web/ (Next.js 16, React 19, Tailwind v4, Cytoscape)   iOS-style UI, light/dark
```

### Data and AI used
- **NASA data:** the 607-row SB publications CSV, full text from PubMed Central (BioC API, NCBI efetch), and NASA OSDR (GeneLab) accession links found in the papers.
- **AI:**
  - `BAAI/bge-small-en-v1.5` embeddings run locally with fastembed.
  - Claude (`claude-opus-5-5`, configurable) is optional: it writes answers and handles batch extraction.
  - Every AI output is either grounded in cited passages or verified with a verbatim quote.

## Evaluation

```bash
make eval   # writes data/kb/eval_results.json; shown on the /eval page
```

The question set in `backend/eval/questions.jsonl` has 34 in-domain questions and 6 off-topic ones. Relevance is judged by a
topic regex over paper titles, so the scores measure lenient topical retrieval, not exact-paper recall.
Each pipeline stage is scored separately (BM25, dense, hybrid, + entity boost, + rerank) so its contribution is visible.

**Extraction accuracy needs people.** `make label` samples 100 findings into
`backend/eval/extraction_labels.csv`. Fill in the `*_ok` columns (y/n) by reading each quote, then run `make eval`
to get per-field precision. Nothing in the code guesses these labels.

Feedback from 👍/👎 in Ask is appended to `data/logs/feedback.jsonl`.

## Deployment

- **API:**
  - Build with `make docker`. `backend/Dockerfile` bundles `data/kb` and the embedding model.
  - Deploy the image to Fly.io, Render or Railway. It listens on `$PORT`.
  - Set `ANTHROPIC_API_KEY` if you want Claude answers.
- **Web:** deploy `web/` on Vercel and set `API_URL=https://<your-api>`, so the server proxies `/api/*`.
  - If the host buffers the SSE stream, set `NEXT_PUBLIC_API_URL` instead.
  - With `NEXT_PUBLIC_API_URL`, add the site origin to `SBA_CORS` on the API.

## Deviations from PLAN.md and limitations
- **Storage:** JSON and NumPy files held in memory instead of Postgres, pgvector and Neo4j. The corpus is small (572 papers), so this is faster and has nothing to operate.
- **Coverage:** the 607 CSV rows hold 572 unique PMC papers; all were fetched, 490 with full text and 82 abstract-only (no open-access body).
- **Rule-based extraction (no key):** it reads direction words (increase, decrease, no change) near known entities. Negation and more complex claims can be misread. The quote guard ensures every finding is a real sentence, but not that its label is right. Claude extraction (`make extract`) improves this.
- **Mission risk scores:** they rank evidence, they are not clinical risk estimates. Treat hypotheses as leads, not findings.
- **Conversation memory:** follow-ups use the last 4 turns and rewrite the question around the entities in them. It is heuristic, not a full dialogue model.

## License

Code: MIT (see `LICENSE`). The papers belong to their authors and publishers. Text is fetched from PubMed Central's
open-access services and used under each article's license. The derived `data/kb/` is for research and educational use.
See `CONTRIBUTING.md` to report a wrong answer or contribute.

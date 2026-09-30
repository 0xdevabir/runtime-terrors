# Contributing

Thanks for helping improve Emberfall (Flame in Freefall).

## Setup

```bash
make setup      # uv (backend, with dense retrieval) + pnpm (web)
make dev        # API on :8000 and web on :3000
make test       # backend unit tests
make eval       # retrieval / refusal / citation / faithfulness metrics
```

The built knowledge base in `data/kb/` is committed, so the app runs straight from a clone.
Rebuild it with `make data` (download → process → build) or `make process build` after code changes.

## Where things live

| Area | Path |
| --- | --- |
| Ontology (entities, synonyms, ontology IDs) | `backend/pipeline/ontology.py` |
| Rule-based / Claude extraction | `backend/pipeline/extract_rules.py`, `extract_llm.py` |
| Consensus, gaps, graph analytics, takeaways | `backend/pipeline/build.py` |
| Retrieval and answering | `backend/app/retrieval.py`, `backend/app/answer.py` |
| API | `backend/app/main.py` |
| Web UI | `web/src/app/*`, `web/src/components/*` |

## Guidelines

- **Grounding first.** Every claim the system shows must trace to a verbatim quote from a paper. Don't add features that
  produce uncited text.
- **Ontology changes**: add synonyms as regex patterns; only add an ontology ID (`NCBITaxon`, `UBERON`, `GO`, `MESH`, `HGNC`…)
  when the mapping is unambiguous.
- **Evaluation**: if you change retrieval or answering, run `make eval` and include the before/after metrics in your PR.
- **Extraction labels** (`backend/eval/extraction_labels.csv`) must be filled in by people reading the source text, never
  generated.
- Keep the web UI working on phone widths and in dark mode.

## Reporting problems

Use the issue templates: *wrong or unsupported answer* (please include the question, persona and the cited passages) or
*bug / feature request*.

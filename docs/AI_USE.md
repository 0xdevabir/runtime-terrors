# Use of AI in this project

## Tools
- Claude (coding agent in Cursor) — scaffolding, refactoring, and the flammability Explorer UI.
- Claude / Gemini / Groq via API — optional live Q&A narration over retrieved NTRS passages (`backend/app/answer.py`).
- Claude Message Batches API — offline finding extraction and report summaries (`backend/pipeline/extract_llm.py`).
- `BAAI/bge-small-en-v1.5` via fastembed — local dense embeddings (no cloud).

## What the AI did
- Helped scaffold FastAPI routes, the Next.js surfaces, and this Explorer page.
- At runtime (optional), writes plain-language answers **only from retrieved passages**, with citation verification.
- Offline, extracted structured findings; each evidence quote is fuzzy-matched back to source text before it enters the KB.

## What the AI did not do
- Deterministic science lives in `backend/pipeline/` and `backend/app/predict.py`: regime labels, the gradient-boosting classifier, envelope checks, gap/consensus maths, and hybrid retrieval fusion.
- The `/api/predict` response object is computed in code. Any explanation text only narrates fields already present on that object.
- Dataset selection (NTRS microgravity combustion / fire-safety reports) and the product design are the team's.

## Prompts
Extraction and answer prompts: `backend/pipeline/extract_llm.py`, `backend/app/answer.py`.

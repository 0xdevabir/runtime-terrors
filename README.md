# Emberfall — Flame in Freefall

**NASA Space Apps Challenge** · *AI-Powered Fire Safety Insights from Microgravity Combustion Data* · Team **runtime-terror**

> What do we actually know about fire in freefall — how sure are we, and where are the holes for spacecraft fire safety?

**Emberfall** turns decades of NASA microgravity combustion and spacecraft fire-safety literature into a cited, conflict-aware knowledge engine. Ask grounded questions, explore the evidence graph, surface contradictions and coverage gaps, and generate mission fire-risk briefings for ISS, Artemis, and Mars.

| | |
|---|---|
| **Live demo** | *[add hosted URL]* |
| **Demo video** | *[add 2-minute YouTube / Space Apps link]* |
| **Repository** | https://github.com/0xdevabir/runtime-terrors |
| **License** | MIT (code) · NTRS reports remain under each document’s distribution terms |

---

## The problem

Spacecraft fire safety rests on a large, scattered literature: drop-tower seconds, parabolic flights, Shuttle and ISS experiments (BASS, FLEX, ACME), and long-duration Cygnus burns (Saffire). Habitat architects planning Artemis (elevated O₂, reduced pressure, partial gravity) and Mars transit cannot easily answer:

- What does the evidence say for *our* cabin atmosphere and gravity profile?
- Where do studies **agree**, where do they **contradict**, and **why**?
- Which risks are well tested in orbit vs only in short freefall or 1g?
- What should we prioritize next?

Reading ~1,300 NTRS reports by hand is not a workflow. Chat-with-PDFs without citation guards, conflict detection, or mission context is not enough for safety-critical research prioritization.

## Our solution

Emberfall is an end-to-end pipeline + web app that:

1. **Ingests** NASA Technical Reports Server (NTRS) microgravity combustion / fire-safety reports (metadata + NTRS-extracted full text).
2. **Extracts** structured findings with a **verbatim quote guard** — every finding is a real sentence from a report.
3. **Normalizes** fuels, conditions, flame geometries, outcomes, species, and countermeasures into a shared ontology.
4. **Builds** an in-memory knowledge base: hybrid search indexes, evidence graph, consensus/conflicts, gap matrices, trends, hypotheses, and mission risk maps.
5. **Serves** an iOS-style web UI: Ask (cited Q&A), Reports, Graph, Insights, Gaps, Hypotheses, Mission briefings, Glossary, and a Trust/eval page.

**Hero workflow:** a habitat architect selects *Artemis* (or enters custom O₂ %, pressure, freefall / partial-g days) and receives a ranked fire-safety briefing — evidence strength, countermeasures, open conflicts, coverage gaps — exportable as PDF. This is a **research-prioritization aid**, not a certified hazard analysis.

---

## Who it’s for

| Persona | What they open first | How answers are framed |
|---|---|---|
| **Combustion scientist** | Ask · Graph · Hypotheses | Methods-aware; species/soot; test counts and freefall time |
| **Safety manager** | Gaps · Insights · Trends | Portfolio view: well studied / thin / contradictory |
| **Habitat architect** | Mission briefing | Risk → evidence → countermeasure, plain language |
| **Student / public** | Ask · Glossary · Reports (L1 summaries) | Accessible language with links deeper into the evidence |

---

## What you can do

| Surface | Capability |
|---|---|
| **Ask** | Hybrid BM25 + dense retrieval (optional cross-encoder). Every sentence cited `[n]` and citation-checked; thin-evidence / off-topic questions are **refused**. Claim support scores, confidence, follow-ups, comparison questions, filters, share links, 👍/👎 feedback. |
| **Reports** | Browse ~**1,334** NTRS reports; filter by fuel, condition, geometry, study design (orbital / short freefall / 1g / model), and named experiments (Saffire, BASS, FLEX, ACME…). Multi-level summaries, quoted findings, BibTeX / RIS / CSV export, side-by-side compare. |
| **Graph** | Knowledge graph of fuels · conditions · geometries · outcomes · species · countermeasures. Year filter, theme colouring, evidence paths between concepts, PNG/JSON export. |
| **Insights** | Consensus vs conflict: vote splits, quotes on each side, likely reasons for disagreement (fuel, freefall time, platform, atmosphere, diagnostics). |
| **Gaps** | Coverage matrices (fuel / geometry / outcome × condition), material bias (lab fuels vs spacecraft materials), freefall test duration vs long-duration cabin fire. |
| **Hypotheses** | Literature-based discovery (A–B and B–C supported, A–C missing) → candidate experiments with bridging papers. |
| **Mission** | ISS / Artemis / Mars presets or custom profile → ranked risks with evidence, readiness, countermeasures, conflicts, gaps → **PDF**. |
| **Glossary** | Plain-language freefall-fire terms, each linked into Ask. |
| **Trust** | Live evaluation: retrieval hit@k / MRR and per-stage baselines; refusal, citation validity, faithfulness; extraction labels; safeguard notes. |

### Corpus at a glance

| Metric | Value |
|---:|---:|
| Unique NTRS reports | **1,334** |
| Reports with usable full text | **917** |
| Indexed passages | **20,145** |
| Quote-verified findings | **1,812** (guard: 1,954/1,954 rule extractions) |
| Graph | **91** entities · **590** relations |
| Open contradictions / consensus topics | **58** / **34** |
| Linked to named flight experiments | **125** |
| Literature span | **1955–2026** |

---

## NASA data we use

| Source | Role |
|---|---|
| **[NASA Technical Reports Server (NTRS)](https://ntrs.nasa.gov/)** search API | Core corpus: microgravity combustion & spacecraft fire-safety reports |
| **NTRS extracted full text** (`…/downloads/{file}.txt`) | Sectioned report body for retrieval and extraction (resumable, rate-limited) |
| **Named flight experiments & missions** in text | Saffire, BASS, FLEX, ACME, CIR, STS/USML/NG/Cygnus links on reports |
| **Cabin / mission atmospheres** (curated) | ISS, Artemis (e.g. elevated O₂ / reduced pressure), Mars presets for Mission view |
| **Risk framing** informed by NASA fire-safety practice | Material flammability, spread/growth, detection, toxicity, suppression, partial-g, autonomy |

Search queries, licensing notes, and reproducibility steps: **[`SOURCES.md`](./SOURCES.md)** · data audit: **[`data/AUDIT.md`](./data/AUDIT.md)**.

Raw downloads live under `data/raw/` (gitignored). The built knowledge base in **`data/kb/` is committed**, so a fresh clone runs without re-fetching NTRS.

---

## AI and retrieval tools we use

Space Apps asks teams to disclose AI use. Ours:

| Component | Tool | Notes |
|---|---|---|
| Dense embeddings | **`BAAI/bge-small-en-v1.5`** via **fastembed** | Local; no cloud required for hybrid search |
| Sparse retrieval | **BM25** (`bm25s`) | Fused with dense via reciprocal rank fusion + entity boosts |
| Optional rerank | Cross-encoder | Off by default; `EMBER_RERANK=1` |
| Optional live answers | **Gemini** (`gemini-flash-latest`) or **Claude** (`claude-opus-5-5`) | Groq (`llama-3.3-70b-versatile`) automatic backup |
| Optional batch extraction | Claude Message Batches API | Offline; `make extract` / `make collect` |
| Default without keys | **Extractive mode** | Cited sentences from retrieved passages only |

**Safeguards:** refusal gate for off-topic / thin evidence · mandatory citation markers · post-hoc citation validity check · verbatim quote guard on extraction · Trust page metrics.

---

## Trust & evaluation

```bash
make eval   # → data/kb/eval_results.json (also shown on /eval)
```

Gold set: **40** questions (**34** in-domain, **6** unanswerable) in `backend/eval/questions.jsonl`.

**Latest extractive / hybrid run** (2026-09-30):

| Metric | Score |
|---|---:|
| hit@1 / hit@5 / hit@10 | **0.56** / **0.82** / **0.94** |
| MRR | **0.70** |
| Refusal accuracy | **1.00** |
| Citation validity | **1.00** |
| Faithfulness / supported sentences | **1.00** |
| Quote guard | **1.00** |

Per-stage baselines (hit@5): BM25 0.79 · dense 0.82 · **hybrid 0.82** · rerank 0.88 (rerank off in default path). Relevance uses topic regexes over titles (lenient topical retrieval, not exact-paper recall). Human extraction labels: `backend/eval/extraction_labels.csv`.

---

## Quick start

**Requirements:** [uv](https://docs.astral.sh/uv/), **Node 20+**, [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/0xdevabir/runtime-terrors.git
cd runtime-terrors

make setup          # backend (uv + dense extras) + web (pnpm)
make embed          # optional: dense embeddings if missing (~30 min CPU, resumable)
make dev            # API :8000 + web :3000
```

Open **http://localhost:3000**.

| Command | Purpose |
|---|---|
| `make data` | NTRS fetch → process → build KB (only if `data/kb` missing/stale; 1–3 h) |
| `make test` | Backend unit tests |
| `make eval` | Retrieval / refusal / citation / faithfulness metrics |
| `make up` | Full stack via Docker Compose |

**Optional LLM answers:** copy `backend/.env.example` → `backend/.env` and set `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, plus `GROQ_API_KEY` as backup. Force provider with `EMBER_LLM=gemini|claude|groq`. Without keys, the API stays in extractive cited mode.

---

## Architecture

```
NASA Technical Reports Server (ntrs.nasa.gov)
   │  pipeline/ntrs.py       search meta → papers.csv; fulltext (rate-limited); audit
   ▼
data/raw/ntrs/fulltext/
   │  pipeline/process.py    sections, ~180-word passages, metadata, duplicate detection
   │  pipeline/extract_*.py  findings (rules or Claude batch) + quote guard
   │  pipeline/build.py      ontology → graph, consensus, gaps, trends, hypotheses, risks, BM25
   │  pipeline/embed.py      dense passage embeddings (optional / resumable)
   ▼
data/kb/*.json|npy           in-memory knowledge base (no database)
   │  app/main.py            FastAPI `/api/*`, SSE `/api/ask`
   │  app/retrieval.py       hybrid BM25 + bge-small, RRF, entity boosts
   │  app/answer.py          refuse → LLM or extractive → citation check
   │  app/mission.py         freefall / partial-g / O₂ / pressure → ranked risks
   ▼
web/  Next.js 16 · React 19 · Tailwind v4 · Cytoscape   light/dark, mobile-ready
```

### Tech stack

| Layer | Choice |
|---|---|
| API | Python 3.12, FastAPI, uvicorn, NetworkX, NumPy, Pydantic, SSE |
| Pipeline | httpx, bm25s, fastembed, rapidfuzz, optional Anthropic / Gemini / Groq |
| Web | Next.js 16, React 19, Tailwind CSS v4, Cytoscape.js + fcose |
| Ops | Make, Docker Compose, uv, pnpm |

Design notes and deviations (in-memory KB vs Postgres/Neo4j, rule-based extraction limits): see **[`PLAN.md`](./PLAN.md)**.

---

## Project layout

```
runtime-terror/
├── backend/
│   ├── pipeline/     # ntrs → process → extract → ontology → build → embed
│   ├── app/          # FastAPI: retrieval, answer, mission, export, glossary
│   ├── eval/         # questions.jsonl, extraction labels, run_eval.py
│   └── tests/
├── web/              # Next.js app (ask, papers, graph, insights, gaps, …)
├── data/
│   ├── kb/           # committed demo knowledge base
│   ├── processed/    # papers.csv, audits
│   └── raw/          # gitignored NTRS downloads
├── docker-compose.yml
├── SOURCES.md        # NASA data provenance
├── PLAN.md           # product & build plan
└── CONTRIBUTING.md
```

---

## Two-minute demo script

1. **Problem (0:00)** — 1,300+ NASA reports on fire in freefall; designers can’t see what’s known, conflicting, or missing.  
2. **Mission (0:15)** — Persona: habitat architect → **Artemis** briefing: ranked risks, evidence bars, a contradiction on flame spread, countermeasures → export PDF.  
3. **Ask (0:50)** — Question on microgravity flame spread; show citations, conflict callout, confidence.  
4. **Gaps / Graph (1:15)** — Coverage hole (e.g. spacecraft materials × elevated O₂) and an evidence path on the graph.  
5. **Trust (1:35)** — Off-topic question → **refusal**; open `/eval` scores (refusal, citations, hit@k).  
6. **Close (1:50)** — Same evidence for scientists, managers, and architects — grounded in NTRS.

---

## Impact

- **For NASA & partners:** faster literature triage for freefall fire safety; explicit map of contradictions and under-tested cells before committing to flight experiments.  
- **For Artemis / Mars planning:** mission-conditioned risk briefings tied to real report quotes, not generic chatbot prose.  
- **For the public & students:** accessible entry (Glossary + L1 summaries) into a historically dense STI corpus.  
- **For open science:** reproducible NTRS pipeline, committed KB, published eval harness, MIT-licensed code.

### What’s next

- Scale Claude/Gemini batch extraction across the full corpus for richer effect sizes and atmospheres.  
- Deeper partial-gravity and elevated-O₂ gap campaigns with scientist-in-the-loop labels.  
- Hosted public demo + optional TechPort / standards cross-links (`NASA_API_KEY`).  
- Broader gold questions and human faithfulness spot-checks to calibrate automatic judges.

---

## Team

**runtime-terror** — NASA Space Apps Challenge

| | |
|---|---|
| Repository | https://github.com/0xdevabir/runtime-terrors |
| Contribute | [`CONTRIBUTING.md`](./CONTRIBUTING.md) — grounding-first; run `make eval` when changing retrieval/answers |

*Add teammate names, local event, and Space Apps project page URL here before final submission.*

---

## Deployment

- **API:** `make docker` → image `emberfall-api` (bundles `data/kb` + embedding model).  
- **Web:** deploy `web/` (e.g. Vercel) with `API_URL=https://<your-api>` so the server proxies `/api/*`.  
- Cross-origin: set `NEXT_PUBLIC_API_URL` and allow the origin in `EMBER_CORS` on the API.  
- Local all-in-one: `make up` (API `:8000`, web `:3000`).

---

## Acknowledgments

- NASA Technical Reports Server and the decades of microgravity combustion and spacecraft fire-safety researchers whose work this indexes.  
- Flight experiment programs including **Saffire**, **BASS**, **FLEX**, **ACME**, and related ISS/Cygnus efforts.  
- [NASA Space Apps Challenge](https://www.spaceappschallenge.org/) for the brief that pushed this from “search the PDFs” to a mission-ready evidence workflow.

---

## License

**Code:** MIT — see [`LICENSE`](./LICENSE).

**Data:** Report text and PDFs belong to their authors and NASA; fetched from the public NTRS under each record’s `copyright.determinationType` and distribution terms. Do not redistribute publisher-copyright PDFs. Derived `data/kb/` is for **research and educational** use.

---

*Emberfall — because in freefall, fire doesn’t rise. Neither should uncertainty.*

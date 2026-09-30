# Emberfall — Flame in Freefall: Build Plan

Working name: **Emberfall**. It answers one question well: *what do we actually know about fire in freefall, how sure are we, and where are the holes for spacecraft fire safety?*

> Verify against the official Space Apps challenge page before starting: dataset links, rules on pre-hackathon work, and submission format.

---

## 1. Product strategy (how we win)

Most teams will ship "chat with PDFs plus a graph". We win on three things they won't have:

1. **Trust that's visible.** Every sentence cites a passage you can click. The system refuses when evidence is thin. A live evaluation page shows our citation accuracy.
2. **One workflow done end to end.** A habitat architect types "Artemis lunar, 34% O₂ at 56.5 kPa, 30 days" and gets a fire-risk briefing: ranked risks, evidence strength, contradictions and countermeasures, exportable as a PDF.
3. **A visual wow moment.** As an answer streams in, the knowledge graph lights up the nodes and edges it's citing.

Everything else (gap matrix, timeline, hypotheses) comes from the same structured data. Build the extraction layer well and those features are cheap.

### Personas → views

| Persona | Landing view | Answer style |
|---|---|---|
| Combustion scientist | Q&A + graph explorer + hypothesis generator | Technical, methods-aware, species/soot level, notes test counts and freefall time |
| Safety manager | Gap matrix + trend timeline | Short, portfolio-level: "well studied / thin / contradictory" |
| Habitat architect | Mission fire-risk briefing builder | Risk → evidence strength → countermeasure, plain language |

---

## 2. Data sources

| Source | Use | Access |
|---|---|---|
| **NASA Technical Reports Server (NTRS)**, ~1,300 microgravity combustion and spacecraft fire-safety reports | Core corpus | NTRS search API with combustion/fire-safety queries → `data/processed/papers.csv` |
| **NTRS extracted full text** | Report body text, sectioned by headings | `https://ntrs.nasa.gov/api/citations/{id}/downloads/{file}.txt` (resumable, rate-limited) |
| **NTRS citation metadata** | Year, center, report type, authors, subject categories, DOI, PDF link | Returned by the search API |
| **Named flight experiments** (Saffire, BASS, FLEX, ACME, CFE, SoFIE …) | Link reports to orbital experiments, missions and platforms | Regex over titles and full text |
| **NASA fire-safety standards** (NASA-STD-6001 material flammability, ISS/Artemis/Mars cabin atmospheres) | Canonical risk names and mission atmospheres for the mission view | Manually curated ~12 risks and 3 presets |

**Report → experiment linking (cheap and reliable):** regex the text for named experiments (`Saffire-\w+`, `BASS(-II)?`, `FLEX(-2)?`, `ACME`, `CFE`) and missions (`STS-\d+`, `USML-\d`, `NG-\d+`, `Cygnus`). Guard against all-caps OCR noise.

---

## 3. Architecture

```
            ┌──────────────── OFFLINE PIPELINE (Python, run once, cached) ───────────────┐
 NTRS API ─► fetch full text ─► clean + section split ─► chunk ─► embed ─────┐           │
                        │                                                    ▼           │
                        └─► extraction (rules, or LLM via Batch API) ─► normalize ─► data/kb
                                                                    (ontology,    (JSON + NumPy
 Named experiments / mission atmospheres ─► link to reports ─────────  dedupe)    + graph)
            └────────────────────────────────────────────────────────────────────────────┘
                                                    │
                              ┌─────────────── FastAPI ───────────────┐
                              │ /search  /ask (SSE)  /graph  /gaps    │
                              │ /mission  /trends  /hypotheses /eval  │
                              │ NetworkX graph loaded in memory       │
                              └───────────────────────────────────────┘
                                                    │
                              Next.js + Tailwind + Cytoscape.js
```

### Stack decisions

- **In-memory KB (JSON + NumPy)** for chunks, embeddings, BM25, findings and graph. At about 1,300 reports this is faster than a database and needs no operations. (We originally planned Postgres + pgvector.)
- **No Neo4j.** About 1,300 reports give roughly 10–30k edges, which NetworkX holds in memory easily.
- **LLM (optional):** Gemini or Claude writes live answers. Claude also runs extraction through the Message Batches API (offline, cheaper, parallel). Enforce the JSON schema with tool use / structured outputs. Without a key, extraction is rule-based and answers are extractive.
- **Embeddings:** `BAAI/bge-small-en-v1.5` via fastembed, run locally ($0).
- **Reranker:** optional cross-encoder (`EMBER_RERANK=1`).
- **Backend:** Python 3.12, `uv`, FastAPI, NetworkX, bm25s.
- **Frontend:** Next.js (App Router), Tailwind, Cytoscape.js (graph), custom SVG charts (heatmap, timeline).
- **Hosting:** Vercel (frontend), Fly.io / Render / Railway (API, bundled with `data/kb`). The KB is committed, so the demo runs from a fresh clone.

---

## 4. Data model (the core of the project)

### Extraction schema (per report, one LLM call over sectioned text)

```jsonc
{
  "paper": {
    "study_type": "flight | both | short_ug | ground | computational | review",
    "platforms": ["ISS", "Cygnus", "Space Shuttle", "drop tower", "parabolic flight", "sounding rocket"],
    "missions": ["NG-14", "STS-75"],
    "experiments": ["Saffire-IV", "BASS-II"],
    "fuels": [{"name": "PMMA", "form": "thin sheet", "n": 12}],
    "atmosphere": {"o2_percent": 34, "pressure_kpa": 56.5},
    "duration": {"value": 5, "unit": "seconds"}
  },
  "findings": [
    {
      "fuel": "PMMA",
      "condition": "microgravity",
      "geometry": "opposed-flow flame spread",
      "outcome": "flame spread rate",
      "direction": "decrease",          // increase | decrease | no_change | mixed
      "magnitude": "-40%",
      "significance": "n=12 tests",
      "species": ["soot", "CO"],
      "countermeasure": null,            // e.g. "CO2 extinguisher", "water mist", "ventilation shutdown"
      "countermeasure_effect": null,     // effective | partial | ineffective
      "evidence_quote": "exact sentence copied from the Results section",
      "section": "results",
      "confidence": 0.9
    }
  ],
  "key_finding_summary": "one sentence"
}
```

**Hallucination guard:** each `evidence_quote` must be a fuzzy substring of the source text (rapidfuzz ≥ 90). Findings that fail are dropped or re-extracted. This one rule makes the extraction numbers defensible.

### Normalization

- Build a **canonical vocabulary** per type with synonyms:
  - Fuels → grouped as Spacecraft material (cotton-fiberglass, Nomex, silicone …), Solid (PMMA, cellulose, polyethylene …), Liquid (heptane, ethanol, decane …) and Gas (methane, ethylene, propane …)
  - Flame geometries → premixed, diffusion jet, droplet, flame spread (opposed / concurrent), smoldering, spherical, candle
  - Chemical species → soot, CO, CO₂, OH, radiation products
  - Conditions → our own small ontology (below)
- Pipeline: exact/synonym match → embedding nearest neighbour (cosine > 0.85) → LLM adjudicates ambiguous merges → the canonical ID is stored next to the raw string.
- **Condition ontology (hand-written, ~20 nodes):**
  `Microgravity` → {`Orbital flight`, `Drop tower`, `Parabolic flight`, `Sounding rocket`}; `Partial gravity (Moon/Mars)`; `Normal gravity (1g baseline)`; `Elevated O₂`; `Reduced pressure`; `Forced / opposed flow`; `Quiescent (no flow)`; `Diluent (N₂, CO₂, He)`; `Radiative heat flux`.
  **Keeping orbital, short-freefall and 1g evidence separate is a scientific point judges will notice.** A 2-second drop is not a 20-minute Saffire burn.

### Tables (stored as JSON in `data/kb/`)

```
papers(id, ntrs_id, doi, title, year, center, report_type, authors, subjects, abstract, study_type, pdf_url,
       summary_l1, summary_l2, summary_l3)
sections(id, paper_id, type, text)
chunks(id, paper_id, section_id, text, embedding)
entities(id, type, canonical_name, group, synonyms[])
findings(id, paper_id, fuel_id, condition_id, geometry_id, outcome_id, direction, magnitude, significance,
         countermeasure_id, countermeasure_effect, evidence_quote, chunk_id, confidence)
edges(src_entity, dst_entity, relation, finding_ids[], paper_count, agreement_score)   -- materialized from findings
experiments(paper_id, experiment, method)
risks(id, name, condition_ids[], outcome_ids[])       -- mission view mapping
```

---

## 5. Features and how each one works

### 5.1 Q&A with mandatory citations (must-have)
1. Query understanding: extract entities from the question → canonical IDs.
2. **Hybrid retrieval:** BM25 + vector search, fused with Reciprocal Rank Fusion, plus **graph expansion** (findings touching the query's entities → their chunks).
3. Rerank to the top ~12 passages.
4. Generate with a strict prompt: every sentence ends with `[c3]`-style markers that map to chunk IDs, and only retrieved passages may be used.
5. **Verification pass:** parse citations. A sentence with no citation, or a citation to a passage not retrieved, gets stripped. An optional cheap LLM entailment check runs per claim.
6. **Refusal:** if rerank scores fall below a threshold or fewer than two independent reports support the answer, say so explicitly: "Insufficient evidence in the corpus", then show the closest reports.
7. **Stream over SSE:** text tokens *and* `cite` events carrying entity/report IDs, so the graph lights up live.

### 5.2 Summaries at three reading levels (must-have)
Precomputed per report: **L1** lay (2 sentences, for the public), **L2** manager (bullets: what, so what, confidence), **L3** scientist (methods, test count, atmosphere, freefall time, effect sizes). Topic summaries are generated on demand from the findings for a node and cached.

### 5.3 Knowledge graph explorer (differentiator)
- Nodes: Fuel, Condition, Flame geometry, Outcome, Chemical species, Countermeasure, Platform. Reports are **not** nodes; they sit on edges (keeps the graph readable).
- Edge example: `Microgravity —[decreases]→ Flame spread rate`, with metadata on fuels, 14 reports, and agreement 86%.
- Click a node → side panel with its summary, top findings, reports (L1/L2/L3 toggle) and linked flight experiments.
- Click an edge → the evidence table: each report's direction, magnitude, fuel, orbital vs drop tower vs 1g, with the quote.
- Edge colour = consensus (green agree / amber mixed / red contradicting). Edge width = report count.

### 5.4 Gap analysis matrix (differentiator)
- Heatmap of **fuel × condition** (switchable to geometry × condition and outcome × condition).
- Cell = number of reports (log colour). Toggle "orbital only" to reveal how much rests on seconds-long drop-tower and parabolic tests.
- Empty or thin cells are gaps. Click a cell → reports, or "no studies found" plus related adjacent cells.
- **Material bias:** share of evidence from lab fuels (PMMA, cellulose, hydrocarbons) vs real spacecraft materials.
- **Freefall time:** longest test per topic (log scale) against a long-duration spacecraft fire.

### 5.5 Consensus and contradiction detection (differentiator)
- Group findings by (canonical condition, outcome, geometry, fuel group).
- Agreement score = share of findings with the majority direction, weighted by evidence strength.
- Flag groups with ≥2 reports on opposite sides. An LLM explains *likely reasons* using the metadata (fuel, freefall time, platform, atmosphere, flow velocity, diagnostics) and cites both sides.
- **Evidence strength score** (transparent formula shown in the UI): number of reports, orbital > short freefall > 1g > model, spacecraft material > lab fuel, test count, replication across experiments.

### 5.6 Trend timeline
Stacked area of reports per year by condition / fuel group / geometry. Annotate with milestones (drop towers of the 1960s, Shuttle-era USML/MSL, ISS CIR and MSG, the Saffire series on Cygnus).

### 5.7 Mission fire-risk briefing (hero workflow)
Input: destination (ISS / Artemis lunar / Mars transit / Mars surface), duration, cabin O₂ % and pressure, gravity profile.
1. Mission profile → active conditions (e.g. Artemis: 34% O₂ at 56.5 kPa, microgravity in transit, 0.16g on the lunar surface).
2. Conditions → fire risks (material flammability, flame spread and growth, smoldering and early detection, smoke and toxic products, suppression effectiveness, post-fire cleanup, partial-gravity behaviour, self-sufficiency far from Earth).
3. For each risk: evidence strength, key findings (cited), contradictions, **known countermeasures and whether they worked**, gaps (e.g. "no long-duration orbital burn of spacecraft materials at elevated O₂").
4. Ranked risk table plus a five-check readiness score → **Export PDF briefing** (the browser's print CSS).
Precompute three presets (ISS 6 mo, Artemis lunar 30 d, Mars 3 yr) so the demo is instant.

### 5.8 Stretch
- **Hypothesis generator:** Swanson ABC literature-based discovery on the graph. A–B and B–C are well supported but A–C has no edge → rank by support, then an LLM writes a testable experiment citing the A–B and B–C reports. Cheap, and it impresses scientists.
- **Flight-experiment links** on every report and node (from §2).
- **"Ask about this report"** on the report page.

---

## 6. Evaluation (show this in the demo)

- **Q&A gold set: 40 questions**, split into 34 in-domain (factual, comparative, multi-hop, contradiction) and 6 *unanswerable* (to test refusal). Each has a topic regex over supporting report titles.
- **Metrics:**
  - Citation precision: does the cited passage support the sentence? (LLM judge + 50 human spot-checks to calibrate the judge.)
  - Citation recall vs gold reports (hit@k, MRR).
  - Refusal accuracy on the unanswerable set.
  - Extraction precision/recall on **20 hand-annotated reports** (fuel, condition, geometry, outcome, direction).
  - Quote-verification pass rate (from the guard).
- Publish these on an `/eval` page in the app, and run them in CI (`make eval`).

---

## 7. Repo layout

```
runtime-terror/
├── backend/
│   ├── pipeline/        # offline: ntrs.py (fetch), process.py, extract_rules.py / extract_llm.py,
│   │                    #          ontology.py, risks.py, build.py (graph, gaps, consensus, trends, hypotheses)
│   ├── app/             # FastAPI: main.py, retrieval.py, answer.py, mission.py, export.py, glossary.py
│   ├── eval/            # questions.jsonl, extraction_labels.csv, run_eval.py
│   └── tests/
├── web/                 # Next.js: ask, papers, graph, insights, gaps, hypotheses, mission, trends, eval
├── data/                # raw text gitignored; data/kb committed as the demo knowledge base
├── docker-compose.yml
└── README.md            # pipeline docs, reproduction steps, NASA data + AI tools used
```

---

## 8. Build schedule (48-hour hackathon, 4–5 people)

**Roles:** **A** data/pipeline · **B** extraction + normalization · **C** retrieval + Q&A API · **D** frontend (graph, views) · **E** product/eval/video/slides (or split between the others).

| Time | Milestone |
|---|---|
| **H0–4** | Repo scaffold, KB format frozen. A: NTRS search + fetch full text for ~1,300 reports. B: extraction prompt tested on 10 reports. D: Next.js shell with 3 persona routes. E: write the 40 eval questions. |
| **H4–12** | A: sections, chunks, embeddings built. B: **launch the full extraction batch** (critical path, start it early). C: hybrid search + `/ask` with citations on the chunks alone. D: graph explorer on mock data. |
| **H12–20** | B: normalization + condition ontology → findings + edges. C: SSE streaming, verification, refusal. D: wire the real graph and report panel. E: annotate 20 reports for extraction eval. |
| **H20–30** | Gap matrix, contradiction detection, evidence score. Mission briefing (3 presets precomputed). Flight-experiment linking. Graph lights up during answers. |
| **H30–38** | Deploy (Vercel + Fly), `/eval` page with real numbers, trend timeline, PDF export. **Feature freeze at H38.** |
| **H38–44** | Bug bash, polish, demo script, record the video + backup, README, list of NASA data/tools. |
| **H44–48** | Buffer. Submit early. |

**Cut order if behind:** hypotheses → PDF export → timeline → experiment linking. **Never cut:** citations, graph explorer, gap matrix, mission briefing, eval numbers.

**If pre-work is allowed** by the rules: do the NTRS fetch, chunking and the extraction dry run beforehand. They carry the most risk.

---

## 9. Two-minute demo script

1. (0:00) Problem: 1,300+ NASA reports on fire in freefall, scattered across decades; habitat designers can't see what's known. (15 s)
2. (0:15) Architect persona: "Artemis, 34% O₂" → fire-risk briefing, evidence bars, a contradiction flag on flame spread at low flow, countermeasures. Export PDF. (35 s)
3. (0:50) Ask "Do materials burn more readily in microgravity than in normal gravity?" The graph lights up as the answer streams; click a citation → exact passage. (25 s)
4. (1:15) Safety-manager persona: gap matrix, orbital-only toggle; thin cells are where to fly the next Saffire. (20 s)
5. (1:35) Ask an out-of-scope question → the system refuses. Show the `/eval` numbers. (15 s)
6. (1:50) Open source, reproducible pipeline, NASA data used. (10 s)

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Some NTRS reports have no extracted text, or OCR noise | Fall back to the abstract; flag `abstract_only`; strip references and figure refs |
| Extraction cost/time | Batch API, one call per report, cache results (never re-run) |
| Entity explosion (1000 names for "microgravity") | Hand-written condition ontology + LLM merge + cap on graph display |
| Hallucinated citations | Quote guard in extraction + citation verifier + refusal threshold |
| Live demo failure | Precomputed views, cached demo answers, committed KB, backup video |
| Graph hairball | Default to an ego network (1–2 hops) around the clicked node; filter by report count |

---

## 11. Submission checklist
- [ ] Hosted demo URL (not localhost)
- [ ] Project description: problem, users, approach, impact
- [ ] 2-minute video + backup recording
- [ ] Public repo, README with architecture diagram + reproduction steps
- [ ] Eval results in the README and the app
- [ ] NASA data used: NTRS microgravity combustion and fire-safety reports with full text, named flight experiments, cabin-atmosphere standards. AI tools used: Gemini / Claude models, bge-small embeddings
- [ ] Slides/poster if requested

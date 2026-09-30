# Emberfall — Flame in Freefall: Build Plan

Working name: **Emberfall**. It answers one question well: *what do we actually know about fire in freefall, how sure are we, and where are the holes for spacecraft fire safety?*

> Verify against the official Space Apps challenge page before starting: dataset links, rules on pre-hackathon work, and submission format.

---

## 1. Product strategy (how we win)

Most teams will ship "chat with PDFs plus a graph". We win on three things they won't have:

1. **Trust that's visible.** Every sentence cites a passage you can click. The system refuses when evidence is thin. A live evaluation page shows our citation accuracy.
2. **One workflow done end to end.** A mission architect types "Mars, 3 years, 0.38g surface stay" and gets a risk briefing: ranked risks, evidence strength, contradictions and countermeasures, exportable as a PDF.
3. **A visual wow moment.** As an answer streams in, the knowledge graph lights up the nodes and edges it's citing.

Everything else (gap matrix, timeline, hypotheses) comes from the same structured data. Build the extraction layer well and those features are cheap.

### Personas → views

| Persona | Landing view | Answer style |
|---|---|---|
| Scientist | Q&A + graph explorer + hypothesis generator | Technical, methods-aware, gene/pathway level, notes sample sizes |
| Program manager | Gap matrix + trend timeline + funding overlay (Task Book) | Short, portfolio-level: "well studied / thin / contradictory" |
| Mission architect | Mission risk briefing builder | Risk → evidence strength → countermeasure, plain language |

---

## 2. Data sources

| Source | Use | Access |
|---|---|---|
| **~608 SB publications** (NASA-curated PMC list, a CSV of titles and PMC links; believed to be the `SB_publications` GitHub repo linked from the challenge) | Core corpus | CSV → PMCIDs |
| **PMC full text, BioC JSON** | Sectioned full text (intro/methods/results/discussion already labelled) | `https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/{PMCID}/unicode` |
| **NCBI E-utilities / PMC metadata** | Year, journal, authors, MeSH terms, DOI | `efetch` / `esummary` |
| **NASA OSDR / GeneLab** | Link papers to datasets; organism, mission and assay metadata | OSDR search + metadata APIs |
| **NASA Task Book** | Funded projects per topic (manager view: funding vs evidence) | Search/export |
| **NASA Space Life Sciences Library** | Optional extra corpus | Stretch |
| **NASA HRP risk list** (Human Research Roadmap) | Canonical risk names for the mission view | Manually curated ~15 risks |

**Paper → OSDR linking (cheap and reliable):** regex the full text for `OSD-\d+` / `GLDS-\d+` and DOIs, then match OSDR study metadata (organism + mission + title similarity) for the rest.

---

## 3. Architecture

```
            ┌──────────────── OFFLINE PIPELINE (Python, run once, cached) ───────────────┐
 CSV ─► fetch BioC ─► clean + section split ─► chunk ─► embed ──────────────┐           │
                        │                                                   ▼           │
                        └─► LLM extraction (JSON schema, Batch API) ─► normalize ─► Postgres
                                                                    (ontologies,   (pgvector +
 OSDR / Task Book ─► fetch metadata ─► link to papers ─────────────  dedupe)       graph tables)
            └────────────────────────────────────────────────────────────────────────────┘
                                                    │
                              ┌─────────────── FastAPI ───────────────┐
                              │ /search  /ask (SSE)  /graph  /gaps    │
                              │ /mission  /trends  /hypotheses /eval  │
                              │ NetworkX graph loaded in memory       │
                              └───────────────────────────────────────┘
                                                    │
                              Next.js + Tailwind + shadcn/ui + Cytoscape.js + Recharts
```

### Stack decisions

- **Postgres + pgvector (Neon or Supabase)** for chunks, embeddings, full-text search (`tsvector`), findings and graph tables. One database, one host.
- **No Neo4j.** 600 papers give roughly 10–30k edges, which NetworkX holds in memory easily. We skip a second database to host, and Cypher isn't needed for the demo.
- **LLM: Claude.** Use `claude-sonnet-5-5` for extraction (through the Message Batches API: offline, cheaper, parallel) and `claude-haiku-4-5` for cheap bulk work (normalization adjudication, summaries at scale). Use the strongest available model for live answers and mission briefings. Enforce the JSON schema with tool use / structured outputs.
- **Embeddings:** any strong retrieval embedding model (e.g. Voyage, or open-source `bge-large` / `e5` if we want $0). Pick one and don't bikeshed.
- **Reranker:** a hosted rerank model, or an LLM rerank over the top 30 results.
- **Backend:** Python 3.12, `uv`, FastAPI, SQLAlchemy/psycopg, NetworkX.
- **Frontend:** Next.js (App Router), Tailwind, shadcn/ui, Cytoscape.js (graph), Recharts or Visx (heatmap, timeline).
- **Hosting:** Vercel (frontend), Fly.io / Render / Railway (API), Neon/Supabase (DB). Keep a **static JSON fallback** of the precomputed views so the demo survives an API outage.

---

## 4. Data model (the core of the project)

### Extraction schema (per paper, one LLM call over sectioned text)

```jsonc
{
  "paper": {
    "study_type": "flight | ground_analog | both | review | computational",
    "platforms": ["ISS", "Space Shuttle", "Bion-M1", "hindlimb unloading", "clinostat", "RPM", "NSRL"],
    "missions": ["RR-1", "STS-135"],
    "organisms": [{"name": "Mus musculus", "strain": "C57BL/6J", "sex": "F", "n": 10}],
    "duration": {"value": 37, "unit": "days"},
    "osdr_ids": ["OSD-48"]
  },
  "findings": [
    {
      "organism": "Mus musculus",
      "stressor": "spaceflight microgravity",
      "tissue_or_system": "femur / trabecular bone",
      "outcome": "bone mineral density",
      "direction": "decrease",          // increase | decrease | no_change | mixed
      "magnitude": "-12%",
      "significance": "p<0.05",
      "genes_pathways": ["Tnfsf11", "RANKL signaling"],
      "countermeasure": null,            // e.g. "resistive exercise", "bisphosphonate"
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

- Build a **canonical vocabulary** per type with synonyms, and map to real ontologies where possible:
  - Organisms → NCBI Taxonomy
  - Tissues → UBERON
  - Genes → HGNC / MGI symbols; pathways → GO / KEGG
  - Stressors → our own small ontology (below), since none fits well
- Pipeline: exact/synonym match → embedding nearest neighbour (cosine > 0.85) → LLM adjudicates ambiguous merges → the canonical ID is stored next to the raw string.
- **Stressor ontology (hand-written, ~25 nodes):**
  `Spaceflight` → {`Microgravity (flight)`, `Space radiation (flight)`}; `Simulated microgravity` → {`Hindlimb unloading`, `Bed rest (head-down tilt)`, `Clinostat`, `RPM`, `Dry immersion`}; `Ionizing radiation (ground)` → {`HZE / heavy ions`, `Protons`, `Gamma`, `Simulated GCR`}; `Isolation & confinement`; `Hypergravity`; `Altered atmosphere (CO₂, O₂)`; `Circadian disruption`; `Partial gravity (Moon/Mars)`.
  **Keeping flight and analog evidence separate is a scientific point judges will notice.**

### Tables

```
papers(id, pmcid, doi, title, year, journal, authors, mesh, abstract, study_type, summary_l1, summary_l2, summary_l3)
sections(id, paper_id, type, text)
chunks(id, paper_id, section_id, text, embedding vector, tsv tsvector)
entities(id, type, canonical_name, ontology_id, synonyms[])
findings(id, paper_id, organism_id, stressor_id, tissue_id, outcome_id, direction, magnitude, significance,
         countermeasure_id, countermeasure_effect, evidence_quote, chunk_id, confidence)
edges(src_entity, dst_entity, relation, finding_ids[], paper_count, agreement_score)   -- materialized from findings
osdr_links(paper_id, osd_id, method)
taskbook_projects(id, title, pi, years, funding, entity_ids[])
risks(id, hrp_name, stressor_ids[], outcome_ids[])       -- mission view mapping
```

---

## 5. Features and how each one works

### 5.1 Q&A with mandatory citations (must-have)
1. Query understanding: extract entities from the question → canonical IDs.
2. **Hybrid retrieval:** BM25 (`tsvector`) + vector search, fused with Reciprocal Rank Fusion, plus **graph expansion** (findings touching the query's entities → their chunks).
3. Rerank to the top ~12 passages.
4. Generate with a strict prompt: every sentence ends with `[c3]`-style markers that map to chunk IDs, and only retrieved passages may be used.
5. **Verification pass:** parse citations. A sentence with no citation, or a citation to a passage not retrieved, gets stripped. An optional cheap LLM entailment check runs per claim.
6. **Refusal:** if rerank scores fall below a threshold or fewer than two independent papers support the answer, say so explicitly: "Insufficient evidence in the corpus", then show the closest papers.
7. **Stream over SSE:** text tokens *and* `cite` events carrying entity/paper IDs, so the graph lights up live.

### 5.2 Summaries at three reading levels (must-have)
Precomputed per paper: **L1** lay (2 sentences, for the public), **L2** manager (bullets: what, so what, confidence), **L3** scientist (methods, n, effect sizes). Topic summaries are generated on demand from the findings for a node and cached.

### 5.3 Knowledge graph explorer (differentiator)
- Nodes: Organism, Stressor, Tissue/System, Outcome, Gene/Pathway, Countermeasure, Mission. Papers are **not** nodes; they sit on edges (keeps the graph readable).
- Edge example: `Microgravity —[decreases]→ Bone mineral density`, with metadata on organisms, 14 papers, and agreement 86%.
- Click a node → side panel with its summary, top findings, papers (L1/L2/L3 toggle) and linked datasets.
- Click an edge → the evidence table: each paper's direction, magnitude, organism, flight vs analog, with the quote.
- Edge colour = consensus (green agree / amber mixed / red contradicting). Edge width = paper count.

### 5.4 Gap analysis matrix (differentiator)
- Heatmap of **organism × stressor** (switchable to tissue × stressor and stressor × outcome).
- Cell = number of papers (log colour). Toggle "flight only" to reveal how much rests on analogs.
- Empty or thin cells are gaps. Click a cell → papers, or "no studies found" plus related adjacent cells.
- Manager overlay: Task Book funded-project count per cell → **"funded but no published evidence yet"** and **"high risk, low evidence, low funding"** cells highlighted.

### 5.5 Consensus and contradiction detection (differentiator)
- Group findings by (canonical stressor, outcome, tissue, organism class).
- Agreement score = share of findings with the majority direction, weighted by evidence strength.
- Flag groups with ≥2 papers on opposite sides. An LLM explains *likely reasons* using the metadata (different duration, species, flight vs analog, sex) and cites both sides.
- **Evidence strength score** (transparent formula shown in the UI): number of papers, flight > analog, human > mammal > other, sample size, replication across missions.

### 5.6 Trend timeline
Stacked area of papers per year by stressor / organism / system. Annotate with missions (Shuttle era, ISS assembly, Rodent Research series, Twins Study).

### 5.7 Mission risk briefing (hero workflow)
Input: destination (LEO / Moon / Mars transit / Mars surface), duration, gravity profile, crew size.
1. Mission profile → active stressors (e.g. Mars: microgravity ~6 months each way, 0.38g surface, deep-space GCR, isolation ~3 years, comms delay).
2. Stressors → HRP risks (bone, muscle, SANS, CNS radiation, cancer, cardiovascular, immune, behavioural, microbiome/food/plants).
3. For each risk: evidence strength, key findings (cited), contradictions, **known countermeasures and whether they worked**, gaps (e.g. "no partial-gravity data in mammals beyond X").
4. Ranked risk table → **Export PDF briefing** (server-side via WeasyPrint, or the browser's print CSS).
Precompute three presets (ISS 6 mo, Artemis lunar 30 d, Mars 3 yr) so the demo is instant.

### 5.8 Stretch
- **Hypothesis generator:** Swanson ABC literature-based discovery on the graph. A–B and B–C are well supported but A–C has no edge → rank by support, then an LLM writes a testable hypothesis citing the A–B and B–C papers. Cheap, and it impresses scientists.
- **OSDR dataset links** on every paper and node (from §2).
- **"Ask about this paper"** on the paper page.

---

## 6. Evaluation (show this in the demo)

- **Q&A gold set: 40 questions**, split 10 factual, 10 comparative, 10 multi-hop, 5 contradiction, and 5 *unanswerable* (to test refusal). Each has hand-labelled supporting papers.
- **Metrics:**
  - Citation precision: does the cited passage support the sentence? (LLM judge + 50 human spot-checks to calibrate the judge.)
  - Citation recall vs gold papers (hit@k).
  - Refusal accuracy on the unanswerable set.
  - Extraction precision/recall on **20 hand-annotated papers** (organism, stressor, platform, direction).
  - Quote-verification pass rate (from the guard).
- Publish these on an `/eval` page in the app, and run them in CI (`make eval`).

---

## 7. Repo layout

```
runtime-terror/
├── pipeline/            # offline: fetch, clean, chunk, embed, extract, normalize, link, build_graph
│   ├── fetch_pmc.py  fetch_osdr.py  fetch_taskbook.py
│   ├── extract.py   (Batch API + schema + quote guard)
│   ├── normalize.py  ontologies/ (stressors.yaml, synonyms.yaml)
│   └── build_graph.py  precompute.py (summaries, gaps, contradictions, mission presets)
├── api/                 # FastAPI: routers/ (ask, search, graph, gaps, mission, trends, eval), retrieval/, prompts/
├── web/                 # Next.js: app/(scientist|manager|architect), components/graph, components/heatmap
├── eval/                # questions.jsonl, annotated_papers/, run_eval.py, results.json
├── data/                # gitignored raw; small precomputed JSON committed as the demo fallback
├── docker-compose.yml   # postgres+pgvector for local dev
└── README.md            # pipeline docs, reproduction steps, NASA data + AI tools used
```

---

## 8. Build schedule (48-hour hackathon, 4–5 people)

**Roles:** **A** data/pipeline · **B** extraction + normalization · **C** retrieval + Q&A API · **D** frontend (graph, views) · **E** product/eval/video/slides (or split between the others).

| Time | Milestone |
|---|---|
| **H0–4** | Repo scaffold, DB up, schema frozen. A: fetch all 608 BioC files. B: extraction prompt tested on 10 papers. D: Next.js shell with 3 persona routes. E: write the 40 eval questions. |
| **H4–12** | A: sections, chunks, embeddings loaded. B: **launch the full extraction batch** (critical path, start it early). C: hybrid search + `/ask` with citations on the chunks alone. D: graph explorer on mock data. |
| **H12–20** | B: normalization + stressor ontology → findings + edges. C: SSE streaming, verification, refusal. D: wire the real graph and paper panel. E: annotate 20 papers for extraction eval. |
| **H20–30** | Gap matrix, contradiction detection, evidence score. Mission briefing (3 presets precomputed). OSDR linking. Graph lights up during answers. |
| **H30–38** | Deploy (Vercel + Fly + Neon), static fallback, `/eval` page with real numbers, trend timeline, PDF export. **Feature freeze at H38.** |
| **H38–44** | Bug bash, polish, demo script, record the video + backup, README, list of NASA data/tools. |
| **H44–48** | Buffer. Submit early. |

**Cut order if behind:** hypotheses → PDF export → Task Book overlay → timeline → OSDR linking. **Never cut:** citations, graph explorer, gap matrix, mission briefing, eval numbers.

**If pre-work is allowed** by the rules: do the fetch, chunking and the extraction dry run beforehand. They carry the most risk.

---

## 9. Two-minute demo script

1. (0:00) Problem: 600+ papers, scattered; mission planners can't see what's known. (15 s)
2. (0:15) Architect persona: "Mars 3-year" → risk briefing, evidence bars, a contradiction flag on immune response, countermeasures. Export PDF. (35 s)
3. (0:50) Ask "Does exercise prevent bone loss in spaceflight?" The graph lights up as the answer streams; click a citation → exact passage. (25 s)
4. (1:15) Manager persona: gap matrix, flight-only toggle; thin cells are where to invest. (20 s)
5. (1:35) Ask an out-of-scope question → the system refuses. Show the `/eval` numbers. (15 s)
6. (1:50) Open source, reproducible pipeline, NASA data used. (10 s)

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Some PMC papers lack BioC full text | Fall back to abstract + PMC OA XML; flag `abstract_only` |
| Extraction cost/time | Batch API, one call per paper, cache results in the DB (never re-run) |
| Entity explosion (1000 names for "microgravity") | Hand-written stressor ontology + LLM merge + cap on graph display |
| Hallucinated citations | Quote guard in extraction + citation verifier + refusal threshold |
| Live demo failure | Precomputed views, cached demo answers, static JSON fallback, backup video |
| Graph hairball | Default to an ego network (1–2 hops) around the clicked node; filter by paper count |

---

## 11. Submission checklist
- [ ] Hosted demo URL (not localhost)
- [ ] Project description: problem, users, approach, impact
- [ ] 2-minute video + backup recording
- [ ] Public repo, README with architecture diagram + reproduction steps
- [ ] Eval results in the README and the app
- [ ] NASA data used: SB publications list, PMC, OSDR/GeneLab, Task Book, HRP risks. AI tools used: Claude models, embedding model
- [ ] Slides/poster if requested

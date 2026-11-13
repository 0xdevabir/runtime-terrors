# Emberfall — voice-over (explainer slides, **4:00**)

**Video:** `demo-video/out/emberfall-explain-240s.mp4`  
**Slides:** `demo-video/slides-explain/*.png`  
**Style:** light theme · no system screenshots · silent (record VO separately)

---

## 01 — Title (0:00–0:18)

Emberfall. What NASA knows about fire in freefall.

A cited, mission-aware knowledge engine over decades of research.

Team runtime-terror — NASA Space Apps twenty twenty-six.

## 02 — Problem (0:18–0:40)

Flames do not rise in space.

Without gravity there is no buoyancy — flames grow into slow, nearly invisible spheres. The cabin air is a closed loop. Crews can’t evacuate.

Artemis habitats plan higher oxygen at lower pressure, which makes materials easier to ignite.

NASA has studied this for seventy years. The answers exist — but they’re scattered across more than a thousand technical reports.

## 03 — One question (0:40–0:58)

Emberfall exists to answer one question well:

What do we actually know about fire in freefall, how sure are we — and where are the gaps that matter for crew safety?

## 04 — Scale (0:58–1:20)

Here’s the corpus behind the product.

One thousand three hundred thirty-four NASA reports. Over twenty thousand indexed passages. Eighteen hundred quote-verified findings. Fifty-eight open contradictions. Literature from nineteen fifty-five through twenty twenty-six.

And in our evaluation: one hundred percent citation validity.

## 05 — How it works (1:20–1:42)

How Emberfall is built:

We ingest from NASA’s Technical Reports Server, clean and chunk the text, then extract findings.

A quote guard checks every claim. If it isn’t verbatim in the source — we discard it.

What’s left becomes a structured knowledge base: ontology, graph, gaps, trends, and mission risks.

## 06 — Ask (1:42–2:04)

Ask is the front door.

You ask a question. Emberfall streams a cited answer. Every sentence points to a real passage.

Personas change the framing — scientist, manager, architect, or student.

When evidence is thin, or the question is off-topic — we refuse. Better silence than a confident hallucination.

## 07 — Graph (2:04–2:22)

Answers aren’t the only view.

The knowledge graph connects fuels, cabin conditions, geometries, outcomes, and countermeasures.

Links are ranked by how many reports support them. You explore paths — not just keyword hits.

## 08 — Gaps & conflicts (2:22–2:42)

Agree and Disagree shows where studies clash — and why. Real contradictions versus different fuels, freefall times, or platforms.

The gap matrix highlights thin cells: fuel by condition. Those empty spots are research priorities for the next experiment.

## 09 — Mission (2:42–3:06)

For habitat architects, the hero workflow is Mission.

Pick ISS, Artemis, or Mars — or enter a custom oxygen and pressure profile.

Emberfall returns a ranked fire-risk briefing: priority, evidence strength, supporting quotes, conflicts, and untested conditions — exportable as a PDF.

## 10 — Trust (3:06–3:26)

Trust is a product feature.

Quote-verified findings. Checked citations. A live evaluation page.

Emberfall helps decide which research to prioritize. It is not a certified hazard analysis.

When the literature doesn’t support an answer, we say so.

## 11 — Who (3:26–3:42)

One knowledge base — four ways in.

Scientists land in Ask and Graph. Managers start with Gaps. Architects open Mission. Students get plain language.

Same evidence. The right framing for each job.

## 12 — Close (3:42–4:00)

Emberfall: cited knowledge, mission-ready.

Flame in freefall. Team runtime-terror. NASA Space Apps twenty twenty-six.

Thank you.

---

## Full continuous read-through

Emberfall. What NASA knows about fire in freefall. A cited, mission-aware knowledge engine over decades of research. Team runtime-terror — NASA Space Apps twenty twenty-six.

Flames do not rise in space. Without gravity there is no buoyancy — flames grow into slow, nearly invisible spheres. The cabin air is a closed loop. Crews can’t evacuate. Artemis habitats plan higher oxygen at lower pressure, which makes materials easier to ignite. NASA has studied this for seventy years. The answers exist — but they’re scattered across more than a thousand technical reports.

Emberfall exists to answer one question well: What do we actually know about fire in freefall, how sure are we — and where are the gaps that matter for crew safety?

Here’s the corpus behind the product. One thousand three hundred thirty-four NASA reports. Over twenty thousand indexed passages. Eighteen hundred quote-verified findings. Fifty-eight open contradictions. Literature from nineteen fifty-five through twenty twenty-six. And in our evaluation: one hundred percent citation validity.

How Emberfall is built: We ingest from NASA’s Technical Reports Server, clean and chunk the text, then extract findings. A quote guard checks every claim. If it isn’t verbatim in the source — we discard it. What’s left becomes a structured knowledge base: ontology, graph, gaps, trends, and mission risks.

Ask is the front door. You ask a question. Emberfall streams a cited answer. Every sentence points to a real passage. Personas change the framing — scientist, manager, architect, or student. When evidence is thin, or the question is off-topic — we refuse. Better silence than a confident hallucination.

Answers aren’t the only view. The knowledge graph connects fuels, cabin conditions, geometries, outcomes, and countermeasures. Links are ranked by how many reports support them. You explore paths — not just keyword hits.

Agree and Disagree shows where studies clash — and why. Real contradictions versus different fuels, freefall times, or platforms. The gap matrix highlights thin cells: fuel by condition. Those empty spots are research priorities for the next experiment.

For habitat architects, the hero workflow is Mission. Pick ISS, Artemis, or Mars — or enter a custom oxygen and pressure profile. Emberfall returns a ranked fire-risk briefing: priority, evidence strength, supporting quotes, conflicts, and untested conditions — exportable as a PDF.

Trust is a product feature. Quote-verified findings. Checked citations. A live evaluation page. Emberfall helps decide which research to prioritize. It is not a certified hazard analysis. When the literature doesn’t support an answer, we say so.

One knowledge base — four ways in. Scientists land in Ask and Graph. Managers start with Gaps. Architects open Mission. Students get plain language. Same evidence. The right framing for each job.

Emberfall: cited knowledge, mission-ready. Flame in freefall. Team runtime-terror. NASA Space Apps twenty twenty-six. Thank you.

---

## Slide map

| Time | PNG | Topic |
|------|-----|-------|
| 0:00 | `slides-explain/01-title.png` | Title |
| 0:18 | `02-problem.png` | Problem |
| 0:40 | `03-question.png` | One question |
| 0:58 | `04-scale.png` | Corpus stats |
| 1:20 | `05-how.png` | How it works |
| 1:42 | `06-ask.png` | Ask |
| 2:04 | `07-graph.png` | Graph |
| 2:22 | `08-gaps.png` | Gaps & conflicts |
| 2:42 | `09-mission.png` | Mission |
| 3:06 | `10-trust.png` | Trust |
| 3:26 | `11-who.png` | Personas |
| 3:42 | `12-close.png` | Close |

Rebuild: `node demo-video/scripts/build-explain.mjs`

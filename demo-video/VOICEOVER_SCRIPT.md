# Emberfall — voice-over (v3, **4:00**)

**Video:** `demo-video/out/emberfall-demo-v3.mp4`  
**Also:** `emberfall-demo-240s.mp4` · `emberfall-demo-v2.mp4`  
**Runtime:** exactly **240 seconds** · light theme · real system UI (Chrome captures)

---

## 01 — Title (0:00–0:18)

Emberfall. What NASA knows about fire in freefall.

Thirteen hundred technical reports. Cited answers. Mission risk briefings.

Built by team runtime-terror for the NASA Space Apps Challenge.

## 02 — Problem (0:18–0:38)

Fire in space does not behave like fire on Earth.

Without gravity, flames don’t rise. They form slow, nearly invisible spheres. The cabin air is a closed loop. Crews can’t evacuate.

Artemis habitats plan higher oxygen at lower pressure — which makes materials easier to ignite.

NASA has studied this since the nineteen fifties. The findings are real — but scattered across more than a thousand reports.

## 03 — Home (0:38–1:00)

This is Emberfall.

One ask bar over the whole corpus. Explorer, Graph, Reports, Mission — and answers tuned for scientists, managers, architects, or students.

Thirteen hundred thirty-four NASA reports, ready to query.

## 04 — Ask (1:00–1:26)

Ask a real question about flame spread in microgravity.

Emberfall streams a cited answer. Every claim points to a source you can open. When studies disagree, we surface that. When evidence is thin — we refuse.

Better silence than a confident hallucination.

## 05 — Graph (1:26–1:48)

Answers aren’t the only view.

The knowledge graph connects fuels, cabin conditions, geometries, outcomes, and countermeasures — the map of what the literature actually links together.

## 06 — Insights (1:48–2:08)

Agree and Disagree shows where reports clash — and why.

Real contradictions versus different fuels, freefall times, or platforms. So you can tell a genuine conflict from a difference in setup.

## 07 — Gaps (2:08–2:28)

The evidence matrix highlights thin cells — fuel by condition.

Those empty spots are research priorities: where the next drop-tower or orbital experiment should go.

## 08 — Mission (2:28–2:54)

For habitat architects, the hero workflow is Mission.

Pick Artemis. Emberfall returns a ranked fire-risk briefing: priority, exposure, evidence strength, conflicts, and untested conditions — exportable as a PDF.

## 09 — Explorer (2:54–3:16)

Slide cabin oxygen and pressure.

A model trained on published microgravity tests predicts the flame-spread regime — and cites the nearest NTRS experiments. Out-of-envelope inputs are refused.

## 10 — Trust (3:16–3:34)

Trust is a product feature.

Quote guard. Citation checks. Live evaluation. Emberfall helps decide which research to prioritize — it is not a certified hazard analysis.

When the literature doesn’t support an answer, we say so.

## 11 — Who (3:34–3:48)

One knowledge base — four ways in.

Scientists land in Ask and Graph. Managers start with Gaps. Architects open Mission. Students get plain language.

Same evidence. The right framing for each job.

## 12 — Close (3:48–4:00)

Emberfall: cited knowledge, mission-ready.

Team runtime-terror. NASA Space Apps twenty twenty-six. Thank you.

---

## Full continuous read-through

Emberfall. What NASA knows about fire in freefall. Thirteen hundred technical reports. Cited answers. Mission risk briefings. Built by team runtime-terror for the NASA Space Apps Challenge.

Fire in space does not behave like fire on Earth. Without gravity, flames don’t rise. They form slow, nearly invisible spheres. The cabin air is a closed loop. Crews can’t evacuate. Artemis habitats plan higher oxygen at lower pressure — which makes materials easier to ignite. NASA has studied this since the nineteen fifties. The findings are real — but scattered across more than a thousand reports.

This is Emberfall. One ask bar over the whole corpus. Explorer, Graph, Reports, Mission — and answers tuned for scientists, managers, architects, or students. Thirteen hundred thirty-four NASA reports, ready to query.

Ask a real question about flame spread in microgravity. Emberfall streams a cited answer. Every claim points to a source you can open. When studies disagree, we surface that. When evidence is thin — we refuse. Better silence than a confident hallucination.

Answers aren’t the only view. The knowledge graph connects fuels, cabin conditions, geometries, outcomes, and countermeasures — the map of what the literature actually links together.

Agree and Disagree shows where reports clash — and why. Real contradictions versus different fuels, freefall times, or platforms. So you can tell a genuine conflict from a difference in setup.

The evidence matrix highlights thin cells — fuel by condition. Those empty spots are research priorities: where the next drop-tower or orbital experiment should go.

For habitat architects, the hero workflow is Mission. Pick Artemis. Emberfall returns a ranked fire-risk briefing: priority, exposure, evidence strength, conflicts, and untested conditions — exportable as a PDF.

Slide cabin oxygen and pressure. A model trained on published microgravity tests predicts the flame-spread regime — and cites the nearest NTRS experiments. Out-of-envelope inputs are refused.

Trust is a product feature. Quote guard. Citation checks. Live evaluation. Emberfall helps decide which research to prioritize — it is not a certified hazard analysis. When the literature doesn’t support an answer, we say so.

One knowledge base — four ways in. Scientists land in Ask and Graph. Managers start with Gaps. Architects open Mission. Students get plain language. Same evidence. The right framing for each job.

Emberfall: cited knowledge, mission-ready. Team runtime-terror. NASA Space Apps twenty twenty-six. Thank you.

---

## Rebuild

```bash
node demo-video/scripts/capture-ui.mjs   # needs make dev running
node demo-video/scripts/build-v3.mjs
```

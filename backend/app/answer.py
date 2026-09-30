"""Question answering over the knowledge base.

Two modes, same event protocol:
  * Claude (ANTHROPIC_API_KEY set): grounded, persona-aware generation that cites
    retrieved passages with [n] markers; citations are validated afterwards.
  * Extractive (no key): selects the best-supported sentences from retrieved
    passages and structured findings, each with its [n] citation.

Events (dicts) yielded to the SSE layer:
  retrieval {passages, entities}  -> UI lights up the graph + shows sources
  token     {text}
  done      {citations, mode, refused, evidence}
"""
from __future__ import annotations

import os
import re
from collections import Counter
from typing import AsyncIterator

from app.kb import KB
from app.retrieval import coverage, query_terms, search
from pipeline import ontology as O

MODEL = os.environ.get("SBA_ANSWER_MODEL", "claude-opus-5-5")
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])")
CITE = re.compile(r"\[(\d{1,2})\]")
MAJORITY_PHRASE = {"decrease": "a decrease", "increase": "an increase", "no_change": "no change", "mixed": "mixed effects"}
BIO_CTX = re.compile(r"\b(?:cell|gene|protein|plant|seed|root|animal|mice|mouse|rat|rodent|human|crew|tissue|organ|bacteri|microb|fung|immun|muscle|bone|"
                     r"heart|brain|blood|dna|rna|omic|express|stress|health|biolog|physiolog|disease|growth|metabol)\w*", re.I)
SPACE_CTX = re.compile(r"space ?flight|micro-?gravity|weightless|unload|\bISS\b|orbit|flown|radiation|astronaut|clinostat|\bRPM\b|bed rest", re.I)

PERSONAS = {
    "scientist": "a space-biology researcher. Be precise: name organisms, platforms, durations, genes and effect directions; "
                 "flag methodological caveats (analog vs. flight, sample size) and where studies disagree.",
    "manager": "a NASA research-investment manager. Lead with a one-sentence bottom line, then 3-5 bullets on what is well "
               "established, what is uncertain, and where more investment would reduce the most uncertainty.",
    "architect": "a mission architect planning Moon/Mars missions. Translate findings into crew-health implications, "
                 "operational countermeasures and remaining risk for long-duration exploration; be concrete and brief.",
}

SYSTEM = """You are the Space Biology Knowledge Engine, answering questions using ONLY the numbered passages from NASA-funded
space-biology publications provided in the user turn.

Rules:
- Every factual sentence ends with one or more citation markers like [2] or [1][4] that point to the passages supporting it.
- Never cite a passage that does not support the sentence. Never use outside knowledge for factual claims.
- Distinguish real spaceflight results from ground-analog results (bed rest, hindlimb unloading, clinostat/RPM) and from
  cell-culture results; say which organism each finding comes from.
- If passages disagree, say so explicitly and cite both sides.
- If the passages do not contain enough evidence to answer, reply with exactly one short paragraph beginning
  "The indexed publications don't contain enough evidence to answer this" and suggest what the corpus does cover.
- Plain text with simple markdown (short paragraphs, "- " bullets, **bold** for key terms). No headings, no preamble.
- Audience: you are answering for {persona}"""


def llm_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def related_findings(kb: KB, entities: list[str], paper_ids: set[str], limit: int = 12) -> list[dict]:
    ents = set(entities)
    scored = []
    for f in kb.findings:
        keys = {f.get("stressor"), f.get("outcome"), f.get("tissue"), f.get("organism"), f.get("countermeasure"), *f.get("genes", [])}
        hit = len(ents & keys)
        if hit and (f["paper_id"] in paper_ids or hit >= 2):
            scored.append((hit + f["confidence"] + (0.5 if f["paper_id"] in paper_ids else 0), f))
    scored.sort(key=lambda x: -x[0])
    return [f for _, f in scored[:limit]]


def evidence_panel(kb: KB, entities: list[str]) -> dict:
    """Consensus/contradiction groups and risk ids touched by the question."""
    ents = set(entities)
    groups = [c for c in kb.consensus if len(ents & {c["stressor"], c["outcome"], c["tissue"]}) >= (2 if len(ents) > 1 else 1)]
    groups.sort(key=lambda c: -c["n_papers"])
    risks = [r["id"] for r in kb.risks if ents & set(r["stressors"] + r["outcomes"] + r["tissues"]) - {
        "stressor:microgravity_flight", "stressor:simulated_microgravity"}]
    return {"consensus": [{k: c[k] for k in ("id", "status", "majority", "agreement", "n_papers", "votes", "strength")} |
                          {"label": " · ".join(filter(None, (kb.label(c["stressor"]), kb.label(c["outcome"]), kb.label(c["tissue"]))))}
                          for c in groups[:4]],
            "risks": risks[:4]}


def should_refuse(q: str, passages: list[dict], entities: list[str]) -> bool:
    if not passages:
        return True
    best = max(p["coverage"] for p in passages[:5])
    # off-domain questions can still hit incidental words ("chip", "best"); without any
    # space/biology signal in the question itself, demand near-complete term coverage
    domain = bool(entities) or bool(SPACE_CTX.search(q) or BIO_CTX.search(q))
    return best < 0.34 or (not domain and best < 0.8)


# ----------------------------------------------------------------- extractive
def extractive_answer(kb: KB, q: str, persona: str, passages: list[dict], entities: list[str]) -> str:
    terms = query_terms(q)
    ents = set(entities)
    q_stress = [e for e in ents if e.startswith("stressor:")]
    cands = []
    for n, p in enumerate(passages, 1):
        for s in SENT_SPLIT.split(p["text"]):
            if len(s) < 60 or len(s) > 420 or re.search(r"\b(?:fig(?:ure)?\.?\s?\d|table\s?\d|et al)\b", s, re.I):
                continue
            ent_hits = sum(1 for e in ents if O.BY_ID[e].rx.search(s))
            finding_cue = bool(O.INCREASE.search(s) or O.DECREASE.search(s) or O.NOCHANGE.search(s) or
                               re.search(r"\b(?:result|show|found|reveal|demonstrat|indicat|suggest|observ)\w*", s, re.I))
            score = coverage(s, terms) * 2 + ent_hits * 0.6 + finding_cue * 0.5 + (0.3 if p["section"] in ("ABSTRACT", "RESULTS", "CONCL") else 0) - n * 0.03
            if q_stress:  # question is about a spaceflight stressor: keep sentences that talk about it
                score += 0.8 if any(O.BY_ID[e].rx.search(s) for e in q_stress) or SPACE_CTX.search(s) else -0.7
            cands.append((score, n, s.strip()))
    cands.sort(key=lambda x: -x[0])
    picked, used_papers, seen = [], Counter(), set()
    for score, n, s in cands:
        key = s[:60].lower()
        if key in seen or used_papers[n] >= 2:
            continue
        seen.add(key)
        used_papers[n] += 1
        picked.append((n, s))
        if len(picked) >= (4 if persona == "manager" else 6):
            break
    if not picked:
        return ""
    panel = evidence_panel(kb, entities)
    # headline: what the structured evidence across the corpus says, ahead of the quoted sentences
    glance = []
    for c in panel["consensus"][:2]:
        votes = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in sorted(c["votes"].items(), key=lambda kv: -kv[1]))
        if c["status"] == "contradictory":
            glance.append(f"Studies **disagree** on {c['label']} ({c['n_papers']} papers: {votes}).")
        elif c["status"] == "consensus":
            glance.append(f"Across {c['n_papers']} papers, evidence on {c['label']} points to **{MAJORITY_PHRASE.get(c['majority'], c['majority'])}** ({votes}).")
        else:
            glance.append(f"Emerging evidence on {c['label']}: {votes} ({c['n_papers']} papers).")
    lines = []
    if persona == "manager":
        top = picked[0]
        lines.append(f"**Bottom line:** {glance[0] if glance else f'{top[1]} [{top[0]}]'}\n")
        lines += [f"- {s} [{n}]" for n, s in (picked if glance else picked[1:])]
        lines += [f"- {g}" for g in glance[1:]]
    elif persona == "architect":
        if glance:
            lines.append(" ".join(glance) + "\n")
        lines.append("**What the evidence says for mission planning:**\n")
        lines += [f"- {s} [{n}]" for n, s in picked]
    else:
        if glance:
            lines.append(" ".join(glance))
        lines += [f"{s} [{n}]" for n, s in picked]
    flight = {p["study_type"] for p in passages[:6]}
    if flight and flight <= {"ground", "ground_analog"}:
        lines.append("_Note: the supporting studies are ground/analog experiments, not spaceflight._")
    return ("\n\n" if persona == "scientist" else "\n").join(lines)


# ----------------------------------------------------------------------- main
async def answer(kb: KB, q: str, persona: str = "scientist", k: int = 8, filters: dict | None = None) -> AsyncIterator[dict]:
    persona = persona if persona in PERSONAS else "scientist"
    r = search(kb, q, k=k, filters=filters)
    passages, entities = r["passages"], r["entities"]
    lit = sorted({e for p in passages for e in p["entities"]} | set(entities))
    yield {"event": "retrieval", "data": {"passages": passages, "entities": entities, "lit": lit, "terms": r["terms"],
                                          "findings": [kb.finding_card(f["id"]) for f in related_findings(kb, entities, {p["paper_id"] for p in passages}, 8)],
                                          "panel": evidence_panel(kb, entities)}}
    refused = should_refuse(q, passages, entities)
    mode = "claude" if llm_available() else "extractive"
    text = ""
    if refused and mode == "extractive":
        covered = ", ".join(n["label"] for n in sorted(kb.graph["nodes"], key=lambda n: -n["papers"])[:6])
        text = ("The indexed publications don't contain enough evidence to answer this. The corpus is strongest on: "
                f"{covered}. Try rephrasing around an organism, tissue or spaceflight stressor.")
        for tok in re.findall(r"\S+\s*", text):
            yield {"event": "token", "data": {"text": tok}}
    elif mode == "extractive":
        text = extractive_answer(kb, q, persona, passages, entities)
        if not text:
            refused = True
            text = "The indexed publications don't contain enough evidence to answer this."
        for tok in re.findall(r"\S+\s*|\n", text):
            yield {"event": "token", "data": {"text": tok}}
    else:
        try:
            async for tok in claude_stream(q, persona, passages):
                text += tok
                yield {"event": "token", "data": {"text": tok}}
        except Exception as e:  # network / auth errors -> degrade gracefully
            mode = "extractive"
            text = extractive_answer(kb, q, persona, passages, entities) or "The indexed publications don't contain enough evidence to answer this."
            yield {"event": "token", "data": {"text": f"_(Claude unavailable: {type(e).__name__}; showing extractive answer)_\n\n" + text}}
        refused = text.lstrip().startswith("The indexed publications don't contain enough evidence")
    # verification: every citation must point at a real retrieved passage
    cited = sorted({int(n) for n in CITE.findall(text)})
    valid = [n for n in cited if 1 <= n <= len(passages)]
    yield {"event": "done", "data": {"mode": mode, "refused": refused, "citations": valid,
                                     "invalid_citations": [n for n in cited if n not in valid],
                                     "cited_papers": sorted({passages[n - 1]["paper_id"] for n in valid})}}


def _context(passages: list[dict]) -> str:
    out = []
    for n, p in enumerate(passages, 1):
        out.append(f"[{n}] {p['title']} ({p['year']}; study type: {p['study_type']}; section: {p['section']})\n{p['text']}")
    return "\n\n".join(out)


async def claude_stream(q: str, persona: str, passages: list[dict]) -> AsyncIterator[str]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic()
    async with client.beta.messages.stream(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM.format(persona=PERSONAS[persona]),
        messages=[{"role": "user", "content": f"<passages>\n{_context(passages)}\n</passages>\n\nQuestion: {q}"}],
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        async for text in stream.text_stream:
            yield text
        final = await stream.get_final_message()
        if final.stop_reason == "refusal":
            yield "\n\nThe indexed publications don't contain enough evidence to answer this safely."

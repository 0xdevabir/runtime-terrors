"""Rule-based structured extraction (no API key needed).

Uses the ontology to pull paper-level metadata (organism, platform, stressor,
duration, study type) and sentence-level findings from Abstract / Results /
Discussion / Conclusion. Every finding's `evidence_quote` is a verbatim
sentence from the paper, so it is grounded by construction.

The Claude extractor (extract_llm.py) produces the same schema with higher
recall and precision; build.py prefers it when present.
"""
from __future__ import annotations

import re

from pipeline import ontology as O

FINDING_SECTIONS = ("ABSTRACT", "RESULTS", "DISCUSS", "CONCL")
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])")
HEDGE_OR_BACKGROUND = re.compile(r"\b(?:previous(?:ly)? (?:studies|reports?|work)|has been (?:shown|reported)|have been (?:shown|reported)|it is (?:well )?known|et al\.|we hypothesi[sz]ed|aim of this study|in this study,? we (?:investigated|examined|aimed)|future (?:studies|work|research)|further (?:studies|research|work)|should be|are needed|is needed|remains? (?:unclear|unknown)|could potentially|we propose|may be (?:used|useful)|in order to|(?:are|is|been) known to|(?:more|additional|further) (?:\w+ )?studies|fig(?:ure)?s?\.? ?S?\d|panels? [A-H]\b|table ?S?\d|(?:is|are) (?:given|shown|presented|depicted) in|representative)\b", re.I)
DURATION = re.compile(r"\b(\d{1,3}(?:\.\d)?)[- ](day|week|month|year)s?\b(?:[- ]long)?(?: (?:space ?flight|mission|flight|bed rest|unloading|suspension|exposure|stay))?", re.I)


def _top(entity_type: str, text: str, k: int = 3, min_count: int = 1) -> list[str]:
    return [e.id for e, n in O.find(entity_type, text)[:k] if n >= min_count]


def paper_profile(paper: dict) -> dict:
    title_abs = f"{paper['title']}. {paper['abstract']}"
    body = " ".join(s["text"] for s in paper["sections"] if s["type"] in ("METHODS", "RESULTS", "ABSTRACT"))
    organisms = _top("organism", title_abs, 3) or _top("organism", body, 2, 3)
    stressors = _top("stressor", title_abs, 3) or _top("stressor", body, 2, 3)
    platforms = _top("platform", title_abs + " " + body, 3, 1)
    tissues = _top("tissue", title_abs, 3)
    has_flight = O.FLIGHT_STRESSOR in stressors or any(O.BY_ID[p].group == "Flight" for p in platforms)
    has_analog = O.ANALOG_STRESSOR in stressors or any(O.BY_ID[p].group == "Ground analog" for p in platforms)
    review = bool(re.search(r"\b(?:review|overview|perspective|we summari[sz]e)\b", title_abs[:600], re.I))
    study_type = "review" if review else "both" if has_flight and has_analog else "flight" if has_flight else "ground_analog" if has_analog else "ground"
    dur = None
    for m in DURATION.finditer(title_abs + " " + body[:6000]):
        val, unit = float(m.group(1)), m.group(2).lower()
        days = val * {"day": 1, "week": 7, "month": 30, "year": 365}[unit]
        if 1 <= days <= 1000 and re.search(r"flight|mission|space|rest|unload|suspension|exposure|stay|ISS", m.group(0) + body[max(0, m.start() - 40):m.end() + 40], re.I):
            dur = {"value": val, "unit": unit + "s" if val != 1 else unit, "days": days}
            break
    methods = " ".join(s["text"] for s in paper["sections"] if s["type"] == "METHODS") or body
    return {"organisms": organisms, "stressors": stressors, "platforms": platforms, "tissues": tissues,
            "study_type": study_type, "duration": dur, "sample_size": sample_size(methods, title_abs),
            "missions": missions(title_abs + " " + body), "dose": dose(title_abs + " " + methods),
            "limitations": limitations(paper)}


# ----------------------------------------------------------------------------- study-design fields
SAMPLE_N = re.compile(r"\b[nN]\s?=\s?(\d{1,4})\b")
SAMPLE_WORDS = re.compile(r"\b(\d{1,3}) (?:(?:male|female|adult|healthy|young|C57BL/6J?|wild-type) )*(?:mice|rats|astronauts|crew ?members|participants|subjects|volunteers|animals|monkeys|patients)\b", re.I)
MISSION = re.compile(r"\b(STS-\d{1,3}|RR-\d{1,2}|Rodent Research-\d{1,2}|Bion-M\s?\d|Bion \d{1,2}|Foton-M\s?\d|SpaceX CRS-\d{1,2}|CRS-\d{1,2}|"
                     r"Expedition \d{1,2}|Inspiration4|Axiom-\d|Ax-\d|SJ-10|Shenzhou-\d{1,2}|SLS-\d|Spacelab[- ]\w+|Mars-?500|MHU-\d|"
                     r"Kibo|BRIC-?\d{1,2}|Veggie|APEX-\d{1,2}|EMCS|Cosmos \d{4}|Kosmos \d{4})\b", re.I)
DOSE = re.compile(r"\b(\d+(?:\.\d+)?)\s?(mGy|cGy|Gy|mSv|Sv)\b")
LIMITATION = re.compile(r"\b(?:limitations? (?:of|to|in) (?:this|our|the present)|(?:this|our|the present) study (?:has|had) (?:several |some )?limitations?|"
                        r"a (?:major |key |main )?limitation|one limitation|is limited by|were limited by|small sample size)\b", re.I)


def sample_size(methods: str, title_abs: str) -> int | None:
    """Largest plausible per-study n: explicit 'n = X' in methods, else 'X mice / participants'."""
    ns = [int(x) for x in SAMPLE_N.findall(methods) if 1 < int(x) <= 5000]
    if not ns:
        ns = [int(x) for x in SAMPLE_WORDS.findall(title_abs + " " + methods[:4000]) if 1 < int(x) <= 5000]
    return max(ns) if ns else None


def missions(text: str) -> list[str]:
    seen: dict[str, str] = {}
    for m in MISSION.findall(text):
        seen.setdefault(re.sub(r"-M\s(\d)", r"-M\1", re.sub(r"\s+", " ", m).upper()).replace("RODENT RESEARCH-", "RR-"), m)
    return list(seen)[:6]


def dose(text: str) -> str | None:
    """Most-mentioned radiation dose, e.g. '0.5 Gy' (Gy/cGy/mGy/Sv/mSv)."""
    counts: dict[str, int] = {}
    for val, unit in DOSE.findall(text):
        counts[f"{val} {unit}"] = counts.get(f"{val} {unit}", 0) + 1
    return max(counts, key=counts.get) if counts else None


def limitations(paper: dict) -> list[str]:
    out = []
    for sec in paper["sections"]:
        if sec["type"] not in ("DISCUSS", "CONCL", "RESULTS"):
            continue
        for s in SENT_SPLIT.split(sec["text"]):
            if LIMITATION.search(s) and 40 <= len(s) <= 500:
                out.append(s.strip())
                if len(out) >= 3:
                    return out
    return out


def _direction(sent: str, outcome_hit: O.Entity) -> str | None:
    """Direction cue must sit within ~70 characters of the outcome mention."""
    m = outcome_hit.rx.search(sent)
    win = sent[max(0, m.start() - 70): m.end() + 70] if m else sent
    if O.NOCHANGE.search(win):
        return "no_change"
    for pat, d in outcome_hit.implied_direction.items():
        if re.search(pat, sent, re.I):
            return d
    inc, dec = len(O.INCREASE.findall(win)), len(O.DECREASE.findall(win))
    if inc and dec:
        return "mixed" if abs(inc - dec) == 0 else ("increase" if inc > dec else "decrease")
    return "increase" if inc else "decrease" if dec else None


def findings(paper: dict, profile: dict, max_findings: int = 14) -> list[dict]:
    out: list[dict] = []
    seen = set()
    for sec in paper["sections"]:
        if sec["type"] not in FINDING_SECTIONS:
            continue
        for sent in SENT_SPLIT.split(sec["text"]):
            if len(sent) < 50 or len(sent) > 600 or HEDGE_OR_BACKGROUND.search(sent):
                continue
            outcomes = O.find("outcome", sent)
            if not outcomes:
                continue
            outcome = outcomes[0][0]
            direction = _direction(sent, outcome)
            if not direction:
                continue
            st = O.find("stressor", sent)
            stressor = st[0][0].id if st else (profile["stressors"][0] if profile["stressors"] else None)
            if not stressor:
                continue
            org = O.find("organism", sent)
            tis = O.find("tissue", sent)
            genes = [e.id for e, _ in O.find("gene", sent)[:3]]
            cm = O.find("countermeasure", sent)
            cm_id, cm_eff = None, None
            if cm and (O.PREVENT.search(sent) or O.NOT_PREVENT.search(sent)):
                cm_id = cm[0][0].id
                cm_eff = "ineffective" if O.NOT_PREVENT.search(sent) else "effective"
            key = (stressor, outcome.id, direction, tis[0][0].id if tis else None)
            if key in seen:
                continue
            seen.add(key)
            explicit = bool(st) + bool(org) + bool(tis)
            out.append({
                "organism": org[0][0].id if org else (profile["organisms"][0] if profile["organisms"] else None),
                "stressor": stressor,
                "tissue": tis[0][0].id if tis else (profile["tissues"][0] if profile["tissues"] else None),
                "outcome": outcome.id,
                "direction": direction,
                "genes": genes,
                "countermeasure": cm_id,
                "countermeasure_effect": cm_eff,
                "evidence_quote": sent.strip(),
                "section": sec["type"],
                "confidence": round(0.45 + 0.1 * explicit + (0.1 if sec["type"] in ("ABSTRACT", "RESULTS") else 0), 2),
                "method": "rules",
            })
    # prefer abstract/results + higher confidence
    out.sort(key=lambda f: (-f["confidence"], FINDING_SECTIONS.index(f["section"])))
    return out[:max_findings]


def extractive_summaries(paper: dict, profile: dict, fnds: list[dict]) -> dict:
    sents = [s for s in SENT_SPLIT.split(paper["abstract"]) if len(s) > 30]
    conclusion = next((s for s in reversed(sents) if re.search(r"\b(?:suggest|indicate|conclu|demonstrat|show|reveal)\w*", s, re.I)), sents[-1] if sents else "")
    lab = lambda ids: ", ".join(O.BY_ID[i].label for i in ids) or "n/a"
    design = [x for x in (f"n = {profile['sample_size']}" if profile.get("sample_size") else None,
                          f"{profile['duration']['value']:g} {profile['duration']['unit']}" if profile.get("duration") else None,
                          ", ".join(profile.get("missions") or []) or None, profile.get("dose")) if x]
    return {
        "l1": conclusion or paper["title"],
        "l2": [f"Studied: {lab(profile['organisms'])} · {lab(profile['stressors'])}",
               f"Platform: {lab(profile['platforms'])}" + (f" · {' · '.join(design)}" if design else "")] + [f["evidence_quote"] for f in fnds[:2]],
        "l3": paper["abstract"] or paper["title"],
        "key_finding": conclusion or paper["title"],
        "method": "extractive",
    }

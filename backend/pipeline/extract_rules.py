"""Rule-based structured extraction (no API key needed).

Uses the ontology to pull paper-level metadata (fuel, condition, platform,
geometry, microgravity test time, study type, named flight experiment) and
sentence-level findings from Abstract / Results / Discussion / Conclusion.
Every finding's `evidence_quote` is a verbatim sentence from the paper, so it
is grounded by construction.

The Claude extractor (extract_llm.py) produces the same schema with higher
recall and precision; build.py prefers it when present.
"""
from __future__ import annotations

import re

from pipeline import ontology as O

FINDING_SECTIONS = ("ABSTRACT", "RESULTS", "DISCUSS", "CONCL")
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\[])")
HEDGE_OR_BACKGROUND = re.compile(r"\b(?:previous(?:ly)? (?:studies|reports?|work)|has been (?:shown|reported)|have been (?:shown|reported)|it is (?:well )?known|et al\.|we hypothesi[sz]ed|aim of this (?:study|work|project)|in this (?:study|work|paper),? we (?:investigated|examined|aimed|will)|future (?:studies|work|research|experiments)|further (?:studies|research|work)|should be|are needed|is needed|remains? (?:unclear|unknown)|could potentially|we propose|will be (?:conducted|performed|measured|used)|may be (?:used|useful)|in order to|(?:are|is|been) known to|(?:more|additional|further) (?:\w+ )?studies|fig(?:ure)?s?\.? ?S?\d|panels? [A-H]\b|table ?S?\d|(?:is|are) (?:given|shown|presented|depicted) in|representative)\b", re.I)
DURATION = re.compile(r"\b(\d{1,4}(?:\.\d{1,2})?)[- ]?(s|sec|seconds?|min|minutes?|hours?|hrs?)\b", re.I)
MU_CONTEXT = re.compile(r"micro-?gravity|(?:µ|μ)g|low[- ]gravity|reduced[- ]gravity|free[- ]?fall|weightless|test time|drop|parabola|experiment time|zero[- ]?g", re.I)
UNIT_S = {"s": 1, "sec": 1, "second": 1, "seconds": 1, "min": 60, "minute": 60, "minutes": 60, "hour": 3600, "hours": 3600, "hr": 3600, "hrs": 3600}
# typical freefall time per platform, used when the paper does not state it
PLATFORM_SECONDS = {"platform:drop_tower": 5.0, "platform:parabolic": 20.0, "platform:sounding_rocket": 360.0}
ORBITAL_SECONDS = 3600.0


def _top(entity_type: str, text: str, k: int = 3, min_count: int = 1) -> list[str]:
    return [e.id for e, n in O.find(entity_type, text)[:k] if n >= min_count]


def study_type(platforms: list[str], conditions: list[str], title_abs: str) -> str:
    """flight | both | short_ug | ground | computational | review."""
    if re.search(r"\b(?:review|overview|perspective|survey of|we summari[sz]e|status report|lessons learned)\b", title_abs[:600], re.I):
        return "review"
    groups = {O.BY_ID[p].group for p in platforms}
    orbital, short, ground, model = O.ORBITAL in groups, O.SHORT_UG in groups, O.GROUND in groups, O.MODEL in groups
    if orbital and (short or ground):
        return "both"
    if orbital:
        return "flight"
    if short or (O.MICROGRAVITY in conditions and not ground and not model):
        return "short_ug"
    if model and not ground:
        return "computational"
    return "ground"


def duration(text: str, platforms: list[str]) -> dict | None:
    """Freefall test time: stated in the text near a microgravity cue, else the platform's typical time."""
    for m in DURATION.finditer(text):
        val, unit = float(m.group(1)), m.group(2).lower()
        secs = val * UNIT_S.get(unit, UNIT_S.get(unit.rstrip("s"), 1))
        if 0.5 <= secs <= 30 * 86400 and MU_CONTEXT.search(text[max(0, m.start() - 60):m.end() + 60]):
            return {"value": val, "unit": unit, "seconds": secs, "inferred": False}
    if any(O.BY_ID[p].group == O.ORBITAL for p in platforms):
        return {"value": 1, "unit": "h+ (orbital)", "seconds": ORBITAL_SECONDS, "inferred": True}
    known = [PLATFORM_SECONDS[p] for p in platforms if p in PLATFORM_SECONDS]
    if known:
        secs = max(known)
        return {"value": secs if secs < 60 else secs / 60, "unit": "s" if secs < 60 else "min", "seconds": secs, "inferred": True}
    return None


def paper_profile(paper: dict) -> dict:
    title_abs = f"{paper['title']}. {paper['abstract']}"
    body = " ".join(s["text"] for s in paper["sections"] if s["type"] in ("METHODS", "RESULTS", "ABSTRACT"))
    fuels = _top("fuel", title_abs, 3) or _top("fuel", body, 2, 3)
    conditions = _top("condition", title_abs, 3) or _top("condition", body, 2, 3)
    platforms = _top("platform", title_abs + " " + body, 3, 1)
    geometries = _top("geometry", title_abs, 3) or _top("geometry", body, 2, 3)
    methods = " ".join(s["text"] for s in paper["sections"] if s["type"] == "METHODS") or body
    text = title_abs + " " + body
    return {"fuels": fuels, "conditions": conditions, "platforms": platforms, "geometries": geometries,
            "study_type": study_type(platforms, conditions, title_abs), "duration": duration(title_abs + " " + body[:8000], platforms),
            "n_tests": n_tests(methods, title_abs), "missions": missions(text), "experiments": experiments(text),
            "atmosphere": atmosphere(title_abs + " " + methods), "limitations": limitations(paper)}


# ----------------------------------------------------------------------------- study-design fields
TESTS_N = re.compile(r"\b(\d{1,4}) (?:(?:separate|successful|individual|flight|drop|ground|normal-gravity|microgravity) )*"
                     r"(?:tests|experiments|runs|trials|drops|parabolas|samples|burns|test points|firings)\b", re.I)
MISSION = re.compile(r"\b(STS-\d{1,3}|USML-\d|MSL-1R?|Spacelab[- ]\w+|Expedition \d{1,2}|Increment \d{1,2}|NG-\d{1,2}|OA-\d{1,2}|"
                     r"CRS-\d{1,2}|SJ-10|Mir|Shenzhou-\d{1,2}|Cygnus)\b")
EXPERIMENT = {
    "Saffire": r"Saffire(?:[- ]?(?:VI|V|IV|III|II|I|[1-6]))?",
    "BASS": r"BASS(?:-?(?:II|2))?", "FLEX": r"FLEX(?:-?(?:2|ICE))?", "ACME": r"ACME", "SoFIE": r"SoFIE|SOFIE",
    "CFI": r"CFI(?:-G)?", "DCE": r"DCE", "FEANICS": r"FEANICS", "SOFBALL": r"SOFBALL", "ELF": r"ELF", "MIST": r"MIST",
    "LSP": r"LSP", "SAME": r"SAME", "SSCE": r"SSCE", "CFM": r"CFM", "FSDC": r"FSDC", "RITSI": r"RITSI", "SAL": r"SAL",
    "TGDF": r"TGDF", "MDCA": r"MDCA", "SPICE": r"SPICE", "FLARE": r"FLARE", "S-Flame": r"s-Flame|S-Flame",
}
EXPERIMENT_RX = re.compile(r"(?<![\w-])(" + "|".join(f"(?:{p})" for p in EXPERIMENT.values()) + r")(?![\w-])")
O2_PCT = re.compile(r"\b(\d{1,3}(?:\.\d)?) ?% ?(?:O2|O₂|oxygen)\b", re.I)
PRESSURE = re.compile(r"\b(\d{1,3}(?:\.\d{1,2})?) ?(kPa|psia|psi|atm)\b")
LIMITATION = re.compile(r"\b(?:limitations? (?:of|to|in) (?:this|our|the present)|(?:this|our|the present) (?:study|work) (?:has|had) (?:several |some )?limitations?|"
                        r"a (?:major |key |main )?limitation|one limitation|is limited by|were limited by|limited (?:microgravity |test |experiment )?time|"
                        r"short (?:test|microgravity) (?:time|duration)|g-jitter|residual (?:gravity|acceleration)|small number of tests)\b", re.I)


def n_tests(methods: str, title_abs: str) -> int | None:
    """Largest plausible number of tests / runs reported."""
    ns = [int(x) for x in TESTS_N.findall(title_abs + " " + methods[:6000]) if 1 < int(x) <= 5000]
    return max(ns) if ns else None


def missions(text: str) -> list[str]:
    seen: dict[str, str] = {}
    for m in MISSION.findall(text):
        seen.setdefault(re.sub(r"\s+", " ", m), m)
    return list(seen)[:6]


def experiments(text: str) -> list[str]:
    """Named flight combustion experiments (Saffire, BASS, FLEX, ACME, SoFIE ...), normalised."""
    seen: dict[str, None] = {}
    for m in EXPERIMENT_RX.finditer(text):
        name = m.group(1)
        # short acronyms (SAME, MIST, ELF ...) are ordinary words in all-caps OCR text: need lower-case context
        if len(name) <= 4 and not re.search(r"[a-z]{3}", text[max(0, m.start() - 40):m.end() + 40]):
            continue
        seen.setdefault(re.sub(r"\s+", "-", name).replace("SOFIE", "SoFIE"), None)
    return list(seen)[:8]


def atmosphere(text: str) -> str | None:
    """Most-mentioned test atmosphere, e.g. '34% O₂ · 56.5 kPa'."""
    def top(rx, fmt):
        counts: dict[str, int] = {}
        for m in rx.findall(text):
            k = fmt(m)
            if k:
                counts[k] = counts.get(k, 0) + 1
        return max(counts, key=counts.get) if counts else None
    o2 = top(O2_PCT, lambda v: f"{float(v):g}% O₂" if 10 <= float(v) <= 100 else None)
    p = top(PRESSURE, lambda m: f"{float(m[0]):g} {m[1]}" if float(m[0]) > 0 else None)
    return " · ".join(x for x in (o2, p) if x) or None


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
            co = O.find("condition", sent)
            condition = co[0][0].id if co else (profile["conditions"][0] if profile["conditions"] else None)
            if not condition:
                continue
            fu = O.find("fuel", sent)
            ge = O.find("geometry", sent)
            species = [e.id for e, _ in O.find("species", sent)[:3]]
            cm = O.find("countermeasure", sent)
            cm_id, cm_eff = None, None
            if cm and (O.PREVENT.search(sent) or O.NOT_PREVENT.search(sent)):
                cm_id = cm[0][0].id
                cm_eff = "ineffective" if O.NOT_PREVENT.search(sent) else "effective"
            key = (condition, outcome.id, direction, ge[0][0].id if ge else None)
            if key in seen:
                continue
            seen.add(key)
            explicit = bool(co) + bool(fu) + bool(ge)
            out.append({
                "fuel": fu[0][0].id if fu else (profile["fuels"][0] if profile["fuels"] else None),
                "condition": condition,
                "geometry": ge[0][0].id if ge else (profile["geometries"][0] if profile["geometries"] else None),
                "outcome": outcome.id,
                "direction": direction,
                "species": species,
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


def duration_label(d: dict | None) -> str | None:
    if not d:
        return None
    return f"{'~' if d.get('inferred') else ''}{d['value']:g} {d['unit']}"


def extractive_summaries(paper: dict, profile: dict, fnds: list[dict]) -> dict:
    sents = [s for s in SENT_SPLIT.split(paper["abstract"]) if len(s) > 30]
    conclusion = next((s for s in reversed(sents) if re.search(r"\b(?:suggest|indicate|conclu|demonstrat|show|reveal)\w*", s, re.I)), sents[-1] if sents else "")
    lab = lambda ids: ", ".join(O.BY_ID[i].label for i in ids) or "n/a"
    design = [x for x in (f"{profile['n_tests']} tests" if profile.get("n_tests") else None,
                          f"{duration_label(profile.get('duration'))} freefall" if profile.get("duration") else None,
                          ", ".join(profile.get("experiments") or []) or None,
                          ", ".join(profile.get("missions") or []) or None, profile.get("atmosphere")) if x]
    return {
        "l1": conclusion or paper["title"],
        "l2": [f"Studied: {lab(profile['fuels'])} · {lab(profile['conditions'])}",
               f"Platform: {lab(profile['platforms'])}" + (f" · {' · '.join(design)}" if design else "")] + [f["evidence_quote"] for f in fnds[:2]],
        "l3": paper["abstract"] or paper["title"],
        "key_finding": conclusion or paper["title"],
        "method": "extractive",
    }

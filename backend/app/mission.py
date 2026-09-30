"""Mission briefing: rank fire-safety risks for a mission profile and attach the evidence."""
from __future__ import annotations

from app.kb import KB
from pipeline import ontology as O
from pipeline.risks import MISSION_PRESETS, TIME_SCALED, atmosphere, exposure

LONG_BURN_S = 3600  # an orbital test long enough to reach steady burning / slow smolder, not just a drop-tower transient


def _dur_factor(profile: dict) -> float:
    return min(profile.get("duration_days", 1) / 900, 1.0)


def _fmt_s(s: float) -> str:
    return f"{s:g} s" if s < 120 else f"{s / 60:.0f} min" if s < 7200 else f"{s / 3600:.0f} h"


def briefing(kb: KB, profile: dict) -> dict:
    ex = exposure(profile)
    dur = _dur_factor(profile)
    risks = []
    for r in kb.risks:
        vals = [ex.get(c, 0.0) for c in r["conditions"]]
        e = max(vals + [0.0])
        if r["id"] in TIME_SCALED:  # grows with time away from Earth (self-sufficiency) rather than a single condition
            e = max(e * 0.5, dur)
        relevance = round(r["severity"] / 5 * e, 3)
        strength = r["strength"]["score"]
        material = r["n_material"] / max(r["n_papers"], 1)
        # uncertainty is high when evidence is thin, lab-fuel-only, or drop-tower/1g-only
        uncertainty = round(1 - strength * (0.55 + 0.25 * min(material * 3, 1) + 0.2 * min(r["n_flight"] / 10, 1)), 3)
        priority = round(relevance * (0.5 + 0.5 * uncertainty), 3)
        gaps = list(r["gaps"])
        if profile.get("partial_gravity_days", 0) > 0 and O.PARTIAL_GRAVITY in r["conditions"] and \
                not r["evidence_by_condition"].get(O.PARTIAL_GRAVITY):
            gaps.append("Mission includes partial gravity but no corpus study measures it for this risk")
        if profile.get("o2_percent", 21) > 24 and not r["evidence_by_condition"].get("condition:elevated_o2") and \
                "condition:elevated_o2" in r["conditions"]:
            gaps.append(f"Mission runs at {profile['o2_percent']:g}% O₂ but no corpus study measures elevated oxygen for this risk")
        if (r.get("max_seconds") or 0) < LONG_BURN_S:
            gaps.append("No long-duration orbital burn in the corpus for this risk")
        risks.append({
            "id": r["id"], "name": r["name"], "severity": r["severity"], "exposure": round(e, 3), "relevance": relevance,
            "uncertainty": uncertainty, "priority": priority,
            "evidence": {"strength": r["strength"], "n_papers": r["n_papers"], "n_findings": r["n_findings"],
                         "n_material": r["n_material"], "n_flight": r["n_flight"], "by_condition": r["evidence_by_condition"]},
            "key_findings": [kb.finding_card(f) for f in r["key_findings"][:4] if f in kb.finding],
            "countermeasures": r["countermeasures"][:4],
            "contradictions": [{"id": c, "label": " · ".join(filter(None, (kb.label(x) for x in c.split("|"))))}
                               for c in r["contradictions"]],
            "gaps": list(dict.fromkeys(gaps)), "readiness": readiness(r, profile),
        })
    risks.sort(key=lambda x: -x["priority"])
    for r in risks:
        r["tier"] = "high" if r["priority"] >= 0.45 else "medium" if r["priority"] >= 0.22 else "low"
    return {"profile": profile, "atmosphere": atmosphere(profile),
            "exposure": {k: round(v, 3) for k, v in ex.items()}, "risks": risks, "summary": narrative(profile, risks)}


def narrative(profile: dict, risks: list[dict]) -> str:
    top = [r for r in risks if r["tier"] == "high"][:3] or risks[:2]
    thin = [r for r in risks if r["relevance"] >= 0.3 and r["evidence"]["n_material"] < 3]
    atm = atmosphere(profile)
    s = (f"For a {profile.get('duration_days')}-day {profile.get('destination', '')} mission "
         f"({atm['o2_percent']:g}% O₂ at {atm['pressure_kpa']:g} kPa / {atm['pressure_psia']:g} psia), "
         "the highest-priority fire-safety risks are " + ", ".join(r["name"].lower() for r in top) + ". ")
    if thin:
        s += ("Evidence for " + ", ".join(r["name"].lower() for r in thin[:3])
              + " rests mainly on laboratory fuels (PMMA, cellulose, hydrocarbons) and short drop-tower or parabolic tests, "
                "so large-scale burns of real spacecraft materials remain the key gap. ")
    cms = [c["label"] for r in top for c in r["countermeasures"][:1]]
    if cms:
        s += "Countermeasures studied in the corpus include " + ", ".join(dict.fromkeys(cms)).lower() + "."
    return s


def presets() -> list[dict]:
    return [p | {"atmosphere": atmosphere(p)} for p in MISSION_PRESETS.values()]


def readiness(r: dict, profile: dict) -> dict:
    """Evidence readiness for this mission: five transparent checks, not a validated NASA metric."""
    cms = [c for c in r["countermeasures"] if c.get("effective")]
    max_s = r.get("max_seconds") or 0
    checks = [
        {"label": "Effect well characterised", "ok": r["n_papers"] >= 10 and r["strength"]["score"] >= 0.5,
         "detail": f"{r['n_papers']} papers, evidence strength {r['strength']['label']}"},
        {"label": "Real materials tested in orbit", "ok": r["n_material"] >= 3 and r["n_flight"] >= 3,
         "detail": f"{r['n_material']} spacecraft-material studies, {r['n_flight']} orbital-flight studies"},
        {"label": "Long-duration burn observed", "ok": max_s >= LONG_BURN_S,
         "detail": f"longest freefall test {_fmt_s(max_s)}" if max_s else "no freefall test time reported"},
        {"label": "Partial gravity studied", "ok": bool(r.get("has_partial_gravity")) or not profile.get("partial_gravity_days"),
         "detail": "not needed for this profile" if not profile.get("partial_gravity_days") else
                   ("measured" if r.get("has_partial_gravity") else "no Moon/Mars-gravity evidence")},
        {"label": "Countermeasure shown to work", "ok": bool(cms),
         "detail": ", ".join(c["label"] for c in cms[:2]) if cms else "none reported effective in the corpus"},
    ]
    level = sum(c["ok"] for c in checks)
    return {"level": level, "of": len(checks), "label": ["not ready", "early", "early", "partial", "partial", "ready"][level], "checks": checks}

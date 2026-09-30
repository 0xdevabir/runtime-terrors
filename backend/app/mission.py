"""Mission briefing: rank biological risks for a mission profile and attach the evidence."""
from __future__ import annotations

from app.kb import KB
from pipeline.risks import MISSION_PRESETS, exposure, total_dose


def _dur_factor(profile: dict) -> float:
    return min(profile.get("duration_days", 1) / 900, 1.0)


def briefing(kb: KB, profile: dict) -> dict:
    ex = exposure(profile)
    dur = _dur_factor(profile)
    risks = []
    for r in kb.risks:
        vals = [ex.get(s, 0.0) for s in r["stressors"]]
        e = max(vals + [0.0])
        if r["id"] in ("microbial", "food", "reproduction"):  # scale with time away from Earth rather than a single stressor
            e = max(e * 0.5, dur)
        relevance = round(r["severity"] / 5 * e, 3)
        strength = r["strength"]["score"]
        human = r["n_human"] / max(r["n_papers"], 1)
        # uncertainty is high when evidence is thin, animal/cell-only, or analog-only
        uncertainty = round(1 - strength * (0.55 + 0.25 * min(human * 3, 1) + 0.2 * min(r["n_flight"] / 10, 1)), 3)
        priority = round(relevance * (0.5 + 0.5 * uncertainty), 3)
        gaps = list(r["gaps"])
        if profile.get("partial_gravity_days", 0) > 0 and "stressor:partial_gravity" in r["stressors"] and \
                not r["evidence_by_stressor"].get("stressor:partial_gravity"):
            gaps.append("Mission includes partial gravity but no corpus study measures it for this risk")
        if profile.get("duration_days", 0) > 365:
            gaps.append("Longest studies in corpus are far shorter than this mission")
        risks.append({
            "id": r["id"], "name": r["name"], "severity": r["severity"], "exposure": round(e, 3), "relevance": relevance,
            "uncertainty": uncertainty, "priority": priority,
            "evidence": {"strength": r["strength"], "n_papers": r["n_papers"], "n_findings": r["n_findings"],
                         "n_human": r["n_human"], "n_flight": r["n_flight"], "by_stressor": r["evidence_by_stressor"]},
            "key_findings": [kb.finding_card(f) for f in r["key_findings"][:4] if f in kb.finding],
            "countermeasures": r["countermeasures"][:4],
            "contradictions": [{"id": c, "label": " · ".join(filter(None, (kb.label(x) for x in c.split("|"))))}
                               for c in r["contradictions"]],
            "gaps": list(dict.fromkeys(gaps)), "readiness": readiness(r, profile),
        })
    risks.sort(key=lambda x: -x["priority"])
    for i, r in enumerate(risks):
        r["tier"] = "high" if r["priority"] >= 0.45 else "medium" if r["priority"] >= 0.22 else "low"
    return {"profile": profile, "total_dose_msv": total_dose(profile),
            "exposure": {k: round(v, 3) for k, v in ex.items()}, "risks": risks, "summary": narrative(profile, risks)}


def narrative(profile: dict, risks: list[dict]) -> str:
    top = [r for r in risks if r["tier"] == "high"][:3] or risks[:2]
    thin = [r for r in risks if r["relevance"] >= 0.3 and r["evidence"]["n_human"] < 3]
    s = (f"For a {profile.get('duration_days')}-day {profile.get('destination', '')} mission "
         f"(~{total_dose(profile)} mSv total dose), the highest-priority biological risks are "
         + ", ".join(r["name"].lower() for r in top) + ". ")
    if thin:
        s += ("Evidence for " + ", ".join(r["name"].lower() for r in thin[:3])
              + " rests mainly on animal, cell or analog studies, so human spaceflight data remain the key gap. ")
    cms = [c["label"] for r in top for c in r["countermeasures"][:1]]
    if cms:
        s += "Countermeasures studied in the corpus include " + ", ".join(dict.fromkeys(cms)).lower() + "."
    return s


def presets() -> list[dict]:
    return list(MISSION_PRESETS.values())


def readiness(r: dict, profile: dict) -> dict:
    """Evidence readiness for this mission: five transparent checks, not a validated NASA metric."""
    need_days = profile.get("duration_days", 0)
    cms = [c for c in r["countermeasures"] if c.get("effective")]
    checks = [
        {"label": "Effect well characterised", "ok": r["n_papers"] >= 10 and r["strength"]["score"] >= 0.5,
         "detail": f"{r['n_papers']} papers, evidence strength {r['strength']['label']}"},
        {"label": "Human spaceflight data", "ok": r["n_human"] >= 3 and r["n_flight"] >= 3,
         "detail": f"{r['n_human']} human studies, {r['n_flight']} flight studies"},
        {"label": "Duration covered", "ok": bool(r.get("max_days")) and r["max_days"] >= min(need_days, 365),
         "detail": f"longest study {int(r.get('max_days') or 0)} days vs {need_days}-day mission"},
        {"label": "Partial gravity studied", "ok": bool(r.get("has_partial_gravity")) or not profile.get("partial_gravity_days"),
         "detail": "not needed for this profile" if not profile.get("partial_gravity_days") else
                   ("measured" if r.get("has_partial_gravity") else "no Moon/Mars-gravity evidence")},
        {"label": "Countermeasure shown to work", "ok": bool(cms),
         "detail": ", ".join(c["label"] for c in cms[:2]) if cms else "none reported effective in the corpus"},
    ]
    level = sum(c["ok"] for c in checks)
    return {"level": level, "of": len(checks), "label": ["not ready", "early", "early", "partial", "partial", "ready"][level], "checks": checks}

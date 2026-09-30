"""Mission-planning model: spacecraft fire risks, mission profiles and exposure.

Risk names follow the hazards NASA's spacecraft fire-safety roadmap works on
(material flammability, detection, suppression, post-fire recovery, exploration
atmospheres). `severity` is a transparent team prior (1-5) the UI labels as such;
the *evidence* side is computed from the corpus, never hard-coded.

Cabin atmosphere references (shown in the UI):
- ISS: 101.3 kPa (14.7 psia), ~21% O2
- NASA exploration atmosphere (Exploration Atmospheres Working Group): 56.5 kPa (8.2 psia), 34% O2
- Airlock / suit pre-breathe campaigns: 70.3 kPa (10.2 psia), 26.5% O2
"""
from __future__ import annotations

MU, PG, O2, LOWP = "condition:microgravity", "condition:partial_gravity", "condition:elevated_o2", "condition:reduced_pressure"
SOLID = ["geometry:thin_sheet", "geometry:thick_slab", "geometry:rod"]

RISKS = [
    {"id": "solid_spread", "name": "Flame spread over cabin materials", "severity": 5,
     "conditions": [MU, PG, "condition:opposed_flow", "condition:concurrent_flow", O2],
     "outcomes": ["outcome:flame_spread", "outcome:burning_rate", "outcome:flame_shape", "outcome:heat_release"], "geometries": SOLID},
    {"id": "flammability_limits", "name": "Material flammability limits in low gravity", "severity": 5,
     "conditions": [MU, PG, O2, LOWP, "condition:opposed_flow"],
     "outcomes": ["outcome:extinction", "outcome:flammability"], "geometries": SOLID + ["geometry:wire"]},
    {"id": "exploration_atmosphere", "name": "Oxygen-enriched exploration atmospheres", "severity": 5,
     "conditions": [O2, LOWP],
     "outcomes": ["outcome:flammability", "outcome:flame_spread", "outcome:extinction", "outcome:ignition"], "geometries": []},
    {"id": "ignition", "name": "Ignition of materials and overheated components", "severity": 4,
     "conditions": [MU, "condition:radiant_heating", O2],
     "outcomes": ["outcome:ignition", "outcome:pyrolysis"], "geometries": SOLID + ["geometry:wire"]},
    {"id": "electrical", "name": "Electrical wire-insulation fires", "severity": 5,
     "conditions": [MU, "condition:opposed_flow", O2, LOWP],
     "outcomes": ["outcome:ignition", "outcome:flame_spread", "outcome:extinction", "outcome:pyrolysis"], "geometries": ["geometry:wire"]},
    {"id": "smoldering", "name": "Smoldering and hidden fires", "severity": 4,
     "conditions": [MU, "condition:quiescent", "condition:opposed_flow"],
     "outcomes": ["outcome:smoldering", "outcome:pyrolysis"], "geometries": ["geometry:porous"]},
    {"id": "detection", "name": "Delayed smoke and fire detection", "severity": 4,
     "conditions": [MU, "condition:quiescent", "condition:opposed_flow"],
     "outcomes": ["outcome:detection", "outcome:soot"], "geometries": []},
    {"id": "suppression", "name": "Fire suppression effectiveness", "severity": 5,
     "conditions": [MU, "condition:diluent", "condition:opposed_flow"],
     "outcomes": ["outcome:suppression", "outcome:extinction"], "geometries": []},
    {"id": "post_fire", "name": "Toxic combustion products and post-fire cleanup", "severity": 4,
     "conditions": [MU, "condition:quiescent"],
     "outcomes": ["outcome:toxic_products", "outcome:soot"], "geometries": []},
    {"id": "liquid_fuel", "name": "Liquid-fuel, droplet and spray fires", "severity": 3,
     "conditions": [MU, "condition:elevated_pressure", "condition:diluent"],
     "outcomes": ["outcome:burning_rate", "outcome:extinction", "outcome:cool_flame", "outcome:microexplosion", "outcome:ignition"],
     "geometries": ["geometry:droplet", "geometry:spray", "geometry:pool"]},
    {"id": "gas_leak", "name": "Gaseous-fuel leaks and jet flames", "severity": 3,
     "conditions": [MU, "condition:diluent", "condition:opposed_flow"],
     "outcomes": ["outcome:soot", "outcome:flame_shape", "outcome:extinction", "outcome:radiation", "outcome:flame_temp"],
     "geometries": ["geometry:jet_flame", "geometry:spherical", "geometry:counterflow", "geometry:premixed"]},
    {"id": "partial_gravity", "name": "Fire behavior on the Moon and Mars", "severity": 4,
     "conditions": [PG, LOWP, O2],
     "outcomes": ["outcome:flame_spread", "outcome:extinction", "outcome:flammability"], "geometries": []},
    {"id": "soot_radiation", "name": "Soot and radiative heat transfer", "severity": 3,
     "conditions": [MU, "condition:quiescent"],
     "outcomes": ["outcome:soot", "outcome:radiation", "outcome:flame_temp"], "geometries": []},
]
# risks that grow with time away from Earth (self-sufficiency) rather than with a single condition
TIME_SCALED = ("detection", "post_fire", "suppression")

MISSION_PRESETS = {
    "iss": {"id": "iss", "name": "ISS increment", "destination": "LEO", "duration_days": 180,
            "microgravity_days": 180, "partial_gravity_days": 0, "o2_percent": 21.0, "pressure_kpa": 101.3, "comm_delay_min": 0, "crew": 4,
            "blurb": "Six months in low Earth orbit at sea-level pressure and 21% O₂, forced ventilation, and a return vehicle always docked."},
    "artemis": {"id": "artemis", "name": "Artemis lunar surface", "destination": "Moon", "duration_days": 45,
                "microgravity_days": 12, "partial_gravity_days": 33, "o2_percent": 34.0, "pressure_kpa": 56.5, "comm_delay_min": 0.02, "crew": 4,
                "blurb": "Cislunar transit, then a month at 0.16 g in an 8.2 psia / 34% O₂ exploration atmosphere that eases EVA pre-breathe."},
    "mars": {"id": "mars", "name": "Mars conjunction-class", "destination": "Mars", "duration_days": 1000,
             "microgravity_days": 420, "partial_gravity_days": 580, "o2_percent": 30.0, "pressure_kpa": 70.3, "comm_delay_min": 22, "crew": 4,
             "blurb": "~7 months of freefall each way and ~18 months at 0.38 g, no abort-to-Earth and up to 22-minute comms delay."},
}


def _clamp(x: float) -> float:
    return max(0.0, min(x, 1.0))


def exposure(profile: dict) -> dict[str, float]:
    """Normalised (0-1) exposure per condition for a mission profile."""
    mu = profile.get("microgravity_days", 0)
    pg = profile.get("partial_gravity_days", 0)
    o2 = profile.get("o2_percent", 21.0)
    p = profile.get("pressure_kpa", 101.3)
    return {
        MU: _clamp(mu / 180),
        PG: _clamp(pg / 180),
        O2: _clamp((o2 - 21) / (34 - 21)),          # 21% -> 0, exploration atmosphere (34%) -> 1
        LOWP: _clamp((101.3 - p) / (101.3 - 56.5)),  # sea level -> 0, 8.2 psia -> 1
        "condition:opposed_flow": 0.8 if mu else 0.5,  # cabin ventilation keeps air moving at ~0.1-0.2 m/s
        "condition:concurrent_flow": 0.5,
        "condition:quiescent": 0.6 if mu else 0.2,    # dead zones behind racks / after ventilation shutdown
        "condition:radiant_heating": 0.4,
        "condition:diluent": 0.3,
        "condition:normal_gravity": 0.1,
        "condition:elevated_pressure": 0.05,
        "condition:hypergravity": 0.05,
    }


def atmosphere(profile: dict) -> dict:
    o2, p = profile.get("o2_percent", 21.0), profile.get("pressure_kpa", 101.3)
    return {"o2_percent": o2, "pressure_kpa": p, "pressure_psia": round(p / 6.895, 1), "ppo2_kpa": round(o2 / 100 * p, 1)}

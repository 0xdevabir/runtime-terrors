"""Mission-planning model: biological risks, mission profiles and exposure.

Risk names follow the spirit of NASA's Human Research Program (HRP) risk list.
`severity` is a transparent team prior (1-5) the UI labels as such; the
*evidence* side is computed from the corpus, never hard-coded.

Exposure references (shown in the UI):
- Mars cruise dose ~1.8 mSv/day, Mars surface ~0.64 mSv/day (MSL/RAD, Zeitlin 2013; Hassler 2014)
- Lunar surface ~1.4 mSv/day (Chang'e-4 LND, Zhang 2020)
- ISS ~0.3-0.8 mSv/day depending on solar cycle / shielding
"""
from __future__ import annotations

RISKS = [
    {"id": "bone", "name": "Bone loss & fracture risk", "severity": 4,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:partial_gravity", "stressor:space_radiation"],
     "outcomes": ["outcome:bone_mass"], "tissues": ["tissue:bone"]},
    {"id": "muscle", "name": "Muscle atrophy & reduced performance", "severity": 4,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:partial_gravity"],
     "outcomes": ["outcome:muscle_mass"], "tissues": ["tissue:muscle"]},
    {"id": "cardio", "name": "Cardiovascular deconditioning & disease", "severity": 4,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:space_radiation"],
     "outcomes": ["outcome:cardio_function", "outcome:fluid_shift"], "tissues": ["tissue:heart"]},
    {"id": "sans", "name": "Neuro-ocular syndrome (SANS)", "severity": 4,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:atmosphere"],
     "outcomes": ["outcome:vision", "outcome:fluid_shift"], "tissues": ["tissue:eye"]},
    {"id": "cns", "name": "CNS & cognitive effects of radiation", "severity": 5,
     "stressors": ["stressor:space_radiation", "stressor:microgravity_flight"],
     "outcomes": ["outcome:cognition"], "tissues": ["tissue:brain"]},
    {"id": "cancer", "name": "Radiation carcinogenesis & DNA damage", "severity": 5,
     "stressors": ["stressor:space_radiation"],
     "outcomes": ["outcome:dna_damage", "outcome:cancer_risk", "outcome:telomere"], "tissues": []},
    {"id": "immune", "name": "Immune dysregulation & infection", "severity": 4,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:space_radiation", "stressor:isolation"],
     "outcomes": ["outcome:immune_function", "outcome:inflammation"], "tissues": ["tissue:immune", "tissue:blood"]},
    {"id": "microbial", "name": "Microbial virulence, resistance & microbiome shifts", "severity": 3,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity"],
     "outcomes": ["outcome:virulence", "outcome:antibiotic_resistance", "outcome:biofilm_formation", "outcome:microbiome_composition"], "tissues": ["tissue:biofilm", "tissue:gut"]},
    {"id": "oxidative", "name": "Oxidative stress & metabolic dysfunction", "severity": 3,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:space_radiation"],
     "outcomes": ["outcome:oxidative_stress", "outcome:mitochondria", "outcome:metabolism"], "tissues": ["tissue:liver", "tissue:adipose", "tissue:kidney"]},
    {"id": "behavior", "name": "Behavioral health, sleep & circadian", "severity": 4,
     "stressors": ["stressor:isolation", "stressor:circadian", "stressor:microgravity_flight"],
     "outcomes": ["outcome:cognition", "outcome:circadian_rhythm"], "tissues": ["tissue:brain"]},
    {"id": "sensorimotor", "name": "Sensorimotor & vestibular adaptation", "severity": 3,
     "stressors": ["stressor:microgravity_flight", "stressor:partial_gravity", "stressor:hypergravity"],
     "outcomes": ["outcome:cognition"], "tissues": ["tissue:vestibular"]},
    {"id": "tissue_repair", "name": "Impaired tissue repair & regeneration", "severity": 3,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:space_radiation"],
     "outcomes": ["outcome:wound_healing", "outcome:differentiation"], "tissues": ["tissue:stem_cells", "tissue:skin"]},
    {"id": "reproduction", "name": "Reproduction & multigenerational effects", "severity": 2,
     "stressors": ["stressor:microgravity_flight", "stressor:space_radiation"],
     "outcomes": ["outcome:reproduction"], "tissues": ["tissue:reproductive"]},
    {"id": "food", "name": "Crop production & bioregenerative life support", "severity": 3,
     "stressors": ["stressor:microgravity_flight", "stressor:simulated_microgravity", "stressor:partial_gravity", "stressor:space_radiation"],
     "outcomes": ["outcome:plant_growth", "outcome:gravitropism"], "tissues": ["tissue:root", "tissue:shoot", "tissue:seed"]},
]

# exposure per stressor on a 0-1 scale is derived from mission parameters
MISSION_PRESETS = {
    "iss": {"id": "iss", "name": "ISS increment", "destination": "LEO", "duration_days": 180,
            "microgravity_days": 180, "partial_gravity_days": 0, "dose_msv_per_day": 0.5, "comm_delay_min": 0, "crew": 4,
            "blurb": "Six months in low Earth orbit, inside the magnetosphere, with resupply and fast return."},
    "artemis": {"id": "artemis", "name": "Artemis lunar surface", "destination": "Moon", "duration_days": 45,
                "microgravity_days": 12, "partial_gravity_days": 33, "dose_msv_per_day": 1.4, "comm_delay_min": 0.02, "crew": 4,
                "blurb": "Cislunar transit and a month-long stay at 0.16 g outside the magnetosphere."},
    "mars": {"id": "mars", "name": "Mars conjunction-class", "destination": "Mars", "duration_days": 1000,
             "microgravity_days": 420, "partial_gravity_days": 580, "dose_msv_per_day": 1.1, "comm_delay_min": 22, "crew": 4,
             "blurb": "~7 months transit each way, ~18 months at 0.38 g, deep-space radiation and up to 22-minute comms delay."},
}


def exposure(profile: dict) -> dict[str, float]:
    """Normalised (0-1) exposure per stressor for a mission profile."""
    d = max(profile.get("duration_days", 1), 1)
    mu = profile.get("microgravity_days", 0)
    pg = profile.get("partial_gravity_days", 0)
    dose = profile.get("dose_msv_per_day", 0.5) * d  # total mSv
    return {
        "stressor:microgravity_flight": min(mu / 365, 1.0),
        "stressor:simulated_microgravity": min(mu / 365, 1.0) * 0.8,  # analog evidence informs the same exposure
        "stressor:partial_gravity": min(pg / 365, 1.0),
        "stressor:space_radiation": min(dose / 1000, 1.0),           # 1 Sv ~ career-limit scale
        "stressor:isolation": min(d / 900, 1.0) * (1.0 if profile.get("comm_delay_min", 0) > 5 else 0.6),
        "stressor:circadian": min(d / 900, 1.0) * 0.7,
        "stressor:atmosphere": min(d / 900, 1.0) * 0.5,
        "stressor:hypergravity": 0.1,
        "stressor:hypomagnetic": 0.8 if profile.get("destination") in ("Moon", "Mars") else 0.0,
    }


def total_dose(profile: dict) -> float:
    return round(profile.get("dose_msv_per_day", 0.5) * profile.get("duration_days", 0))

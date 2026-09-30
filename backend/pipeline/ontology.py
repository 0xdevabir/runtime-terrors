"""Canonical vocabularies for microgravity-combustion and fire-safety entities.

Every entity has a stable id, a display label, a group and a list of regex
synonyms. Both the rule-based extractor and the LLM normaliser map raw strings
onto these ids, so "weightlessness", "micro-gravity" and "µg" all become
`condition:microgravity`.

Entity types:
  fuel            what burns (PMMA, cotton-fiberglass, n-heptane droplets, ethylene ...)
  condition       the environment it burns in (gravity level, O2, pressure, flow, heating)
  platform        where the test ran (ISS, drop tower, parabolic aircraft, 1g lab, model)
  geometry        fuel / flame configuration (thin sheet, droplet, wire, jet flame ...)
  outcome         what was measured (spread rate, extinction limit, soot, ...)
  countermeasure  fire-safety measure (detection, extinguishers, material screening ...)
  species         chemical species / diagnostics (CO, HCN, soot particulates, OH* ...)

Where a standard identifier exists we record it (PubChem CID for pure chemicals).
Platforms carry the distinction that matters most scientifically and that the UI
surfaces everywhere: *orbital flight* (long-duration freefall) vs *short-duration
microgravity* (drop towers, parabolic flights, sounding rockets) vs *1g ground* tests.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Entity:
    id: str
    type: str
    label: str
    group: str
    patterns: list[str]
    ontology: str | None = None
    implied_direction: dict[str, str] = field(default_factory=dict)  # pattern -> direction
    _rx: re.Pattern | None = None

    @property
    def rx(self) -> re.Pattern:
        if self._rx is None:
            self._rx = re.compile(r"(?<![\w-])(?:" + "|".join(self.patterns) + r")(?![\w-])", re.I)
        return self._rx


def E(type_, key, label, group, patterns, ontology=None, implied=None):
    return Entity(f"{type_}:{key}", type_, label, group, patterns, ontology, implied or {})


MU = r"(?:µ|μ|u)g"  # "µg" written with the micro sign, the Greek mu or a plain u

# ----------------------------------------------------------------------------- fuels
FUELS = [
    E("fuel", "pmma", "PMMA (acrylic)", "Solid", [r"PMMA", r"poly ?\(?methyl ?methacrylate\)?", r"plexiglas+", r"acrylic(?: sheets?| slabs?| rods?)?"]),
    E("fuel", "cellulose", "Paper / cellulose", "Solid",
      [r"(?:ashless |filter |tissue |thin |kimwipe )paper", r"paper (?:sheets?|samples?|fuels?|strips?)", r"cellulos\w*", r"kimwipes?"]),
    E("fuel", "cotton_fiberglass", "Cotton-fiberglass fabric (SIBAL)", "Spacecraft material",
      [r"SIBAL", r"cotton[- /]fiber ?glass", r"cotton[- /]fibre ?glass", r"fiberglass[- /]cotton"]),
    E("fuel", "fabric", "Fabrics & textiles (Nomex, cotton)", "Spacecraft material",
      [r"nomex", r"fabrics?", r"textiles?", r"cotton", r"clothing", r"garments?"]),
    E("fuel", "wire_insulation", "Wire insulation (PTFE, ETFE, polyethylene)", "Spacecraft material",
      [r"wire insulation", r"insulated wires?", r"PTFE", r"teflon", r"ETFE", r"tefzel", r"kapton", r"polyimide", r"cable insulation"]),
    E("fuel", "polyethylene", "Polyethylene / polyolefins", "Solid", [r"polyethylene", r"LDPE", r"HDPE", r"polypropylene", r"polyolefins?"]),
    E("fuel", "polymer", "Other polymers (Delrin, polycarbonate ...)", "Solid",
      [r"delrin", r"polyoxymethylene", r"POM", r"polycarbonate", r"polystyrene", r"nylon", r"epoxy", r"silicone", r"thermoplastics?", r"polymers?", r"plastics?"]),
    E("fuel", "foam", "Polyurethane foam", "Solid", [r"polyurethane(?: foam)?", r"open-cell foam", r"foam (?:samples?|fuels?)"]),
    E("fuel", "candle", "Candle / paraffin wax", "Solid", [r"candles?", r"paraffin(?: wax)?", r"wax"]),
    E("fuel", "metal", "Metals (Al, Mg, Ti, Fe)", "Solid",
      [r"metals? (?:combustion|burning|flammability)", r"alumin(?:i)?um", r"magnesium", r"titanium", r"iron rods?", r"steel"]),
    E("fuel", "heptane", "n-Heptane", "Liquid", [r"n-?heptane", r"heptane"], "PubChem:8900"),
    E("fuel", "alkane", "Larger alkanes (decane, dodecane ...)", "Liquid",
      [r"n-?decane", r"decane", r"n-?dodecane", r"dodecane", r"hexadecane", r"n-?octane", r"iso-?octane", r"alkanes?"]),
    E("fuel", "alcohol", "Alcohols (methanol, ethanol)", "Liquid", [r"methanol", r"ethanol", r"propanol", r"butanol", r"alcohols?"]),
    E("fuel", "jet_fuel", "Practical liquid fuels (kerosene, JP-8, diesel)", "Liquid",
      [r"kerosene", r"JP-?\d+", r"jet fuels?", r"diesel", r"biodiesel", r"biofuels?", r"liquid fuels?", r"fuel blends?"]),
    E("fuel", "methane", "Methane", "Gas", [r"methane", r"CH4", r"natural gas"], "PubChem:297"),
    E("fuel", "ethylene", "Ethylene", "Gas", [r"ethylene", r"C2H4"], "PubChem:6325"),
    E("fuel", "propane", "Propane", "Gas", [r"propane", r"C3H8"], "PubChem:6334"),
    E("fuel", "hydrogen", "Hydrogen", "Gas", [r"hydrogen(?! (?:cyanide|chloride|fluoride))", r"H2"], "PubChem:783"),
    E("fuel", "other_gas", "Other gaseous fuels (ethane, butane, acetylene)", "Gas", [r"ethane", r"butane", r"acetylene", r"gaseous fuels?"]),
]

# ----------------------------------------------------------------------------- conditions (environment)
CONDITIONS = [
    E("condition", "microgravity", "Microgravity (freefall)", "Gravity",
      [r"micro-?gravity", MU, r"weightless\w*", r"zero[- ]?g(?:ravity)?", r"0[- ]?g", r"reduced[- ]gravity", r"low[- ]gravity",
       r"free[- ]?fall", r"buoyancy[- ]free", r"non-?buoyant", r"in space", r"on[- ]orbit", r"spacecraft environment"]),
    E("condition", "normal_gravity", "Normal gravity (1g)", "Gravity",
      [r"normal[- ]gravity", r"1[- ]?g", r"earth gravity", r"terrestrial gravity", r"buoyant (?:flames?|flow|convection)", r"natural convection"]),
    E("condition", "partial_gravity", "Partial gravity (Moon / Mars)", "Gravity",
      [r"partial[- ]gravity", r"lunar gravity", r"martian gravity", r"mars gravity", r"0\.38 ?g", r"0\.16 ?g", r"1/6 ?g", r"lunar", r"martian"]),
    E("condition", "hypergravity", "Elevated gravity (> 1g)", "Gravity", [r"hypergravity", r"super-?gravity", r"centrifuge"]),
    E("condition", "elevated_o2", "Elevated oxygen (O₂-enriched)", "Atmosphere",
      [r"oxygen[- ]enriched", r"enriched[- ]oxygen", r"elevated oxygen", r"high(?:er)? oxygen", r"pure oxygen",
       r"(?:2[5-9]|[3-9]\d|100)(?:\.\d)? ?% ?(?:O2|O₂|oxygen)", r"exploration atmospheres?", r"hyperoxi[ac]"]),
    E("condition", "reduced_pressure", "Reduced pressure", "Atmosphere",
      [r"reduced (?:ambient |total )?pressures?", r"low(?:er)? (?:ambient |total )?pressures?", r"sub-?atmospheric", r"8\.2 ?psia?",
       r"10\.2 ?psia?", r"56\.5 ?kPa", r"70 ?kPa", r"hypobaric"]),
    E("condition", "elevated_pressure", "Elevated pressure / supercritical", "Atmosphere",
      [r"high[- ]pressures?", r"elevated (?:ambient )?pressures?", r"supercritical", r"super-?atmospheric"]),
    E("condition", "diluent", "Diluent / inert gas (N₂, CO₂, He)", "Atmosphere",
      [r"diluents?", r"dilution", r"inert gas(?:es)?", r"helium", r"argon", r"xenon", r"sulfur hexafluoride", r"SF6", r"nitrogen[- ]diluted", r"CO2[- ]diluted"]),
    E("condition", "opposed_flow", "Opposed / forced flow", "Flow",
      [r"opposed[- ]flow", r"opposing flow", r"forced (?:flow|convection|air ?flow)", r"flow velocit(?:y|ies)", r"air ?flow", r"ventilation flow", r"imposed flow"]),
    E("condition", "concurrent_flow", "Concurrent (flow-assisted) flow", "Flow",
      [r"con-?current[- ]flow", r"co-?current", r"concurrent", r"flow-assisted", r"wind-aided"]),
    E("condition", "quiescent", "Quiescent (no flow)", "Flow", [r"quiescent", r"no[- ]flow", r"stagnant", r"still air"]),
    E("condition", "radiant_heating", "External radiant heating", "Heating",
      [r"external (?:radiant )?(?:heat flux|heating|radiation)", r"radiant heat(?:er|ing|s)?", r"imposed (?:radiant )?heat flux", r"irradiance", r"radiant flux"]),
]

# ----------------------------------------------------------------------------- platforms (where the test ran)
PLATFORMS = [
    E("platform", "iss", "International Space Station", "Orbital flight",
      [r"international space station", r"ISS", r"combustion integrated rack", r"CIR", r"microgravity science glovebox", r"MSG"]),
    E("platform", "shuttle", "Space Shuttle / Spacelab", "Orbital flight", [r"space shuttle", r"shuttle", r"STS-?\d+", r"spacelab", r"USML-?\d", r"MSL-?1"]),
    E("platform", "cygnus", "Uncrewed vehicle (Cygnus, Saffire)", "Orbital flight",
      [r"cygnus", r"un(?:crewed|manned) (?:vehicle|spacecraft|resupply)", r"cargo (?:vehicle|spacecraft)", r"saffire"]),
    E("platform", "mir", "Mir", "Orbital flight", [r"mir space station", r"mir"]),
    E("platform", "other_orbital", "Other orbital (Shijian, Foton, Kibo)", "Orbital flight",
      [r"shijian", r"SJ-10", r"tiangong", r"foton", r"kibo", r"JEM", r"orbital experiments?"]),
    E("platform", "sounding_rocket", "Sounding rocket", "Short-duration µg", [r"sounding rockets?", r"suborbital", r"TEXUS", r"MASER", r"MAXUS"]),
    E("platform", "parabolic", "Parabolic-flight aircraft", "Short-duration µg",
      [r"parabolic (?:flights?|aircraft|trajector(?:y|ies)|maneuvers?)", r"KC-?135", r"DC-?9", r"reduced[- ]gravity aircraft", r"zero-?g aircraft",
       r"learjet", r"airbus A300", r"aircraft (?:tests?|experiments?)"]),
    E("platform", "drop_tower", "Drop tower / drop tube", "Short-duration µg",
      [r"drop (?:towers?|tubes?|shafts?|facilit(?:y|ies)|tests?|experiments?)", r"2\.2[- ]?s(?:ec(?:ond)?)?", r"5\.18?[- ]?s(?:ec(?:ond)?)?",
       r"zero[- ]gravity research facility", r"ZGRF", r"ZARM", r"JAMIC", r"MGLAB", r"bremen"]),
    E("platform", "ground_lab", "1g laboratory apparatus", "Ground (1g)",
      [r"normal[- ]gravity (?:tests?|experiments?)", r"ground[- ]based (?:tests?|experiments?)", r"laboratory (?:tests?|experiments?)",
       r"narrow[- ]channel apparatus", r"NCA", r"wind tunnel", r"combustion tunnel"]),
    E("platform", "std_6001", "NASA-STD-6001 flammability test", "Ground (1g)",
      [r"NASA-?STD-?6001\w*", r"NHB ?8060\.1\w*", r"upward flammability", r"test ?1 (?:upward|flammability)", r"white sands test facility", r"WSTF"]),
    E("platform", "calorimeter", "Cone calorimeter / FIST / LIFT", "Ground (1g)",
      [r"cone calorimeters?", r"FIST", r"forced-flow ignition and flame[- ]spread test", r"LIFT apparatus", r"FAA (?:tests?|burner)"]),
    E("platform", "model", "Numerical model / simulation", "Computational",
      [r"numerical (?:simulations?|models?|stud(?:y|ies)|results|predictions)", r"computational fluid dynamics", r"CFD", r"direct numerical simulations?",
       r"fire dynamics simulator", r"FDS", r"(?:asymptotic|analytical|theoretical) (?:models?|analys[ie]s)"]),
]

# ----------------------------------------------------------------------------- geometries (fuel / flame configuration)
GEOMETRIES = [
    E("geometry", "thin_sheet", "Thin sheet / film", "Solid configuration",
      [r"thin (?:solid )?(?:fuels?|sheets?|samples?|films?)", r"thermally thin", r"sheets?", r"films?"]),
    E("geometry", "thick_slab", "Thick slab / block", "Solid configuration",
      [r"thick (?:solid )?(?:fuels?|slabs?|samples?|sheets?)", r"thermally thick", r"slabs?", r"blocks?"]),
    E("geometry", "rod", "Cylinder / rod", "Solid configuration",
      [r"cylind\w+ (?:fuels?|rods?|samples?)", r"rods?", r"cylinders?"]),
    E("geometry", "wire", "Wire / cable", "Solid configuration", [r"wires?", r"electrical wires?", r"cables?", r"harness(?:es)?"]),
    E("geometry", "porous", "Porous fuel (smolder)", "Solid configuration",
      [r"porous (?:fuels?|media|materials?|beds?)", r"packed beds?", r"foams?"]),
    E("geometry", "droplet", "Isolated droplet / droplet array", "Liquid configuration",
      [r"droplets?", r"fuel drops?", r"drop combustion", r"droplet arrays?"]),
    E("geometry", "spray", "Spray / particle cloud", "Liquid configuration",
      [r"sprays?", r"particle clouds?", r"dust clouds?", r"aerosols?", r"mists?"]),
    E("geometry", "pool", "Pool / liquid layer", "Liquid configuration", [r"pools?", r"pool fires?", r"liquid layers?", r"fuel pools?"]),
    E("geometry", "candle_wick", "Candle / wick", "Liquid configuration", [r"candles?", r"wicks?"]),
    E("geometry", "jet_flame", "Gas-jet diffusion flame", "Gas flame",
      [r"(?:gas[- ])?jet (?:diffusion )?flames?", r"laminar diffusion flames?", r"co-?flow(?:ing)? (?:flames?|burners?)", r"burke-schumann",
       r"diffusion flames?", r"burners?"]),
    E("geometry", "spherical", "Spherical / porous-sphere flame", "Gas flame",
      [r"spherical (?:burners?|flames?|diffusion flames?)", r"porous[- ]spheres?", r"spherical symmetry"]),
    E("geometry", "counterflow", "Counterflow / stagnation-point flame", "Gas flame",
      [r"counter-?flow", r"opposed[- ]jets?", r"stagnation[- ]point", r"stagnation (?:region|flow)"]),
    E("geometry", "premixed", "Premixed flame / flame ball", "Gas flame",
      [r"premixed (?:flames?|gas(?:es)?|mixtures?)", r"flame balls?", r"premixed"]),
]

# ----------------------------------------------------------------------------- outcomes (what was measured)
OUTCOMES = [
    E("outcome", "flame_spread", "Flame spread rate", "Flame behavior",
      [r"flame[- ]spread\w*", r"spread rates?", r"flame propagation", r"spread velocit(?:y|ies)", r"flame front (?:velocity|speed)"]),
    E("outcome", "extinction", "Extinction / flammability limit", "Limits",
      [r"extinction", r"blow-?off", r"quench\w*", r"flammability (?:limits?|boundar(?:y|ies)|maps?|diagrams?)",
       r"limiting oxygen (?:index|concentration)", r"LOI", r"LOC", r"MOC", r"minimum oxygen concentration", r"self-extinguish\w*"]),
    E("outcome", "flammability", "Material flammability", "Limits", [r"flammab\w+", r"combustib\w+", r"fire hazard\w*"]),
    E("outcome", "ignition", "Ignition delay / energy", "Ignition",
      [r"ignit\w*", r"auto-?ignition", r"ignition (?:delay|time|energy|temperature)"]),
    E("outcome", "cool_flame", "Cool flames / low-temperature chemistry", "Ignition",
      [r"cool[- ]flames?", r"low[- ]temperature (?:chemistry|combustion|oxidation)", r"NTC", r"negative temperature coefficient", r"two-stage ignition"]),
    E("outcome", "burning_rate", "Burning / mass-loss rate", "Flame behavior",
      [r"burn(?:ing)? rates?", r"mass[- ](?:loss|burning) rates?", r"regression rates?", r"burning (?:rate )?constants?", r"d\^?2[- ]law", r"burning velocit(?:y|ies)"]),
    E("outcome", "flame_temp", "Flame temperature", "Thermal",
      [r"flame temperatures?", r"temperature (?:fields?|profiles?|distributions?)", r"peak temperatures?", r"adiabatic flame"]),
    E("outcome", "heat_release", "Heat release rate", "Thermal", [r"heat release(?: rates?)?", r"HRR", r"heat of combustion"]),
    E("outcome", "radiation", "Radiative heat loss", "Thermal",
      [r"radiative (?:heat )?(?:loss(?:es)?|transfer|emission|feedback|flux)", r"radiation (?:loss(?:es)?|heat transfer)", r"radiant (?:loss(?:es)?|emission)"]),
    E("outcome", "soot", "Soot formation / smoke yield", "Emissions",
      [r"soot\w*", r"smoke (?:yield|production|point|particles?)", r"smoke", r"luminosity", r"luminous"]),
    E("outcome", "toxic_products", "Toxic products / combustion gases", "Emissions",
      [r"toxic\w*", r"combustion products", r"products of combustion", r"off-?gas\w*", r"pyrolysis products", r"post-?fire atmosphere"]),
    E("outcome", "flame_shape", "Flame shape / size / standoff", "Flame behavior",
      [r"flame (?:shape|size|length|height|standoff|stand-off|geometry|radius|diameter|width|structure)", r"standoff ratio"]),
    E("outcome", "oscillation", "Flame oscillation / instability", "Flame behavior",
      [r"oscillat\w+", r"instabilit(?:y|ies)", r"flicker\w*", r"pulsat\w+", r"cellular flames?", r"flamelets?", r"fingering"]),
    E("outcome", "smoldering", "Smoldering / smolder-to-flame transition", "Flame behavior",
      [r"smoulder\w*", r"smolder\w*", r"transition to flaming", r"glowing combustion"]),
    E("outcome", "pyrolysis", "Pyrolysis / material degradation", "Material response",
      [r"pyroly\w+", r"thermal (?:decomposition|degradation)", r"charring", r"char (?:yield|layer|formation)", r"melting", r"dripping"]),
    E("outcome", "microexplosion", "Micro-explosion / disruptive burning", "Flame behavior",
      [r"micro-?explosions?", r"disruptive burning", r"droplet (?:disruption|breakup)", r"puffing"]),
    E("outcome", "suppression", "Suppression / extinguishment", "Fire response",
      [r"(?:fire|flame) suppression", r"suppression (?:agents?|systems?|effectiveness|tests?)", r"suppressants?",
       r"extinguish(?:ment|ers?|ing agents?)", r"(?:fire|flame)s? (?:was |were )?extinguished", r"fire ?fighting"]),
    E("outcome", "detection", "Smoke / fire detectability", "Fire response",
      [r"detection (?:time|threshold|performance)", r"detectab\w+", r"particle size distributions?", r"smoke characteri[sz]ation"]),
]

# ----------------------------------------------------------------------------- countermeasures (fire-safety measures)
COUNTERMEASURES = [
    E("countermeasure", "detection", "Smoke / fire detection", "Detection",
      [r"(?:smoke|fire|gas|ionization|photoelectric) (?:detect\w+|sensors?|alarms?)", r"detectors?", r"early (?:fire )?warning", r"combustion product monitor\w*"]),
    E("countermeasure", "co2_extinguisher", "CO₂ extinguisher", "Suppression",
      [r"CO2 (?:extinguish\w+|suppress\w+|agent)", r"carbon dioxide (?:extinguish\w+|suppress\w+|agent)", r"portable fire extinguishers?", r"PFE"]),
    E("countermeasure", "water_mist", "Water mist / water spray", "Suppression",
      [r"water[- ]mist", r"fine water (?:sprays?|mists?)", r"water-based (?:suppression|extinguish\w+)", r"PWFE", r"water sprays?"]),
    E("countermeasure", "foam_agent", "Foam agent", "Suppression", [r"foam (?:extinguish\w+|agents?)", r"aqueous film", r"AFFF"]),
    E("countermeasure", "inert_agent", "Inert / halon / chemical agents", "Suppression",
      [r"halons?", r"nitrogen (?:suppression|flooding|inerting)", r"inert(?:ing)? (?:agents?|suppression)", r"clean agents?", r"FM-?200", r"chemical suppressants?", r"inerting"]),
    E("countermeasure", "depressurization", "Depressurization / venting", "Suppression", [r"depressuri[sz]\w+", r"venting", r"vent(?:ed)? to vacuum"]),
    E("countermeasure", "vent_shutdown", "Ventilation shutdown", "Response",
      [r"ventilation (?:shut ?down|off|shut-?off)", r"turn(?:ing)? off (?:the )?(?:ventilation|fans?)", r"fans? (?:shut ?down|off)"]),
    E("countermeasure", "material_selection", "Material selection / screening", "Prevention",
      [r"materials? (?:selection|screening|acceptance|testing|control)", r"flame[- ]retardan\w+", r"fire[- ](?:resistant|retardant)", r"non-?flammable materials?",
       r"NASA-?STD-?6001\w*"]),
    E("countermeasure", "low_o2_atmosphere", "Lower-O₂ / normoxic cabin atmosphere", "Prevention",
      [r"(?:lower|reduced) oxygen (?:atmospheres?|concentrations?|levels?)", r"normoxic", r"oxygen control"]),
    E("countermeasure", "ppe", "Crew masks / PPE", "Response", [r"masks?", r"respirators?", r"emergency breathing", r"PBA", r"protective equipment"]),
    E("countermeasure", "cleanup", "Post-fire cleanup / filtration", "Recovery",
      [r"post-?fire (?:clean-?up|recovery)", r"clean-?up", r"filtration", r"filters?", r"scrubb\w+", r"smoke eaters?", r"air purification"]),
]

# ----------------------------------------------------------------------------- chemical species / diagnostics
SPECIES = [
    E("species", "co", "Carbon monoxide (CO)", "Toxic gas", [r"carbon monoxide", r"CO"], "PubChem:281"),
    E("species", "co2", "Carbon dioxide (CO₂)", "Major product", [r"carbon dioxide", r"CO2", r"CO₂"], "PubChem:280"),
    E("species", "hcn", "Hydrogen cyanide (HCN)", "Toxic gas", [r"HCN", r"hydrogen cyanide"], "PubChem:768"),
    E("species", "acid_gas", "Acid gases (HCl, HF, COF₂)", "Toxic gas",
      [r"HCl", r"HF", r"hydrogen (?:chloride|fluoride)", r"acid gas(?:es)?", r"COF2", r"carbonyl fluoride"]),
    E("species", "particulate", "Soot particulates / PM", "Particulate",
      [r"soot particles?", r"particulates?", r"PM ?2\.5", r"smoke particles?", r"primary particles?", r"aggregates?"]),
    E("species", "oh", "OH* / CH* chemiluminescence", "Radical diagnostic", [r"OH\*?", r"hydroxyl", r"CH\*", r"chemiluminescen\w+"]),
    E("species", "nox", "Nitrogen oxides (NOx)", "Toxic gas", [r"NOx", r"nitric oxide", r"NO2", r"nitrogen oxides?"]),
    E("species", "radicals", "Radicals / chain chemistry", "Kinetics", [r"radicals?", r"chain[- ]branching", r"chemical kinetics", r"reaction mechanisms?"]),
    E("species", "pah", "PAHs (soot precursors)", "Particulate", [r"PAHs?", r"polycyclic aromatic\w*", r"soot precursors?"]),
    E("species", "o2_consumption", "Oxygen consumption", "Major product", [r"oxygen consumption", r"O2 consumption", r"oxygen depletion"]),
]

ALL_ENTITIES: list[Entity] = FUELS + CONDITIONS + PLATFORMS + GEOMETRIES + OUTCOMES + COUNTERMEASURES + SPECIES

BY_ID = {e.id: e for e in ALL_ENTITIES}
BY_TYPE: dict[str, list[Entity]] = {}
for _e in ALL_ENTITIES:
    BY_TYPE.setdefault(_e.type, []).append(_e)

ENTITY_TYPES = ("fuel", "condition", "platform", "geometry", "outcome", "countermeasure", "species")
MICROGRAVITY = "condition:microgravity"
NORMAL_GRAVITY = "condition:normal_gravity"
PARTIAL_GRAVITY = "condition:partial_gravity"
ORBITAL, SHORT_UG, GROUND, MODEL = "Orbital flight", "Short-duration µg", "Ground (1g)", "Computational"

# ----------------------------------------------------------------------------- direction cues
INCREASE = re.compile(r"\b(?:increas\w*|elevat\w*|enhanc\w*|higher|greater|larger|faster|longer|stronger|induc\w*|promot\w*|accelerat\w*|augment\w*|stimulat\w*|intensif\w*|grow\w*)\b", re.I)
DECREASE = re.compile(r"\b(?:decreas\w*|reduc\w*|lower\w*|smaller|slower|shorter|weaker|narrower|loss|lost|impair\w*|suppress\w*|inhibit\w*|attenuat\w*|diminish\w*|declin\w*|depress\w*|less|fewer|deplet\w*|delay\w*|weaken\w*)\b", re.I)
NOCHANGE = re.compile(r"\b(?:no (?:significant )?(?:change|difference|effect|alteration|dependence)s?|not (?:significantly )?(?:alter\w*|affect\w*|chang\w*|differ\w*|reduc\w*|increas\w*|depend\w*)|(?:did|does|do) not (?:\w+ )?(?:alter|affect|change|reduce|increase|differ|depend)\w*|unchanged|unaffected|independent of|insensitive to|comparable|similar (?:to|between))\b", re.I)
PREVENT = re.compile(r"\b(?:prevent\w*|mitigat\w*|attenuat\w*|protect\w*|extinguish\w*|suppress\w*|counteract\w*|reduc\w* the (?:risk|hazard)|inhibit\w*|quench\w*)\b", re.I)
NOT_PREVENT = re.compile(r"\b(?:did not|failed to|could not|was not able to|insufficient to|does not|unable to) (?:\w+ )?(?:prevent|mitigat|protect|extinguish|suppress|counteract|quench|inhibit)\w*", re.I)


def find(entity_type: str, text: str) -> list[tuple[Entity, int]]:
    """Return entities of a type mentioned in text with mention counts."""
    out = []
    for e in BY_TYPE[entity_type]:
        n = len(e.rx.findall(text))
        if n:
            out.append((e, n))
    out.sort(key=lambda x: -x[1])
    return out


def normalize(entity_type: str, raw: str | None) -> str | None:
    """Map a free-text string (e.g. from the LLM) onto a canonical entity id."""
    if not raw:
        return None
    if raw in BY_ID and BY_ID[raw].type == entity_type:
        return raw
    hits = find(entity_type, raw)
    if hits:
        return hits[0][0].id
    raw_l = raw.lower()
    for e in BY_TYPE[entity_type]:
        if e.label.lower() in raw_l or raw_l in e.label.lower():
            return e.id
    return None

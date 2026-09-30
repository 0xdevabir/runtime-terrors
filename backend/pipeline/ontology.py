"""Canonical vocabularies for space-biology entities.

Every entity has a stable id, a display label, a group and a list of regex
synonyms. Both the rule-based extractor and the LLM normaliser map raw strings
onto these ids, so "weightlessness", "micro-gravity" and "µg" all become
`stressor:microgravity_flight`.

Where a standard ontology exists we record its id (NCBI Taxonomy, UBERON, GO).
Stressors have no good public ontology, so we define a small hierarchy that
separates *real spaceflight* from *ground analogs* - a distinction that matters
scientifically and that the UI surfaces everywhere ("flight only" toggle).
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


# ----------------------------------------------------------------------------- organisms
ORGANISMS = [
    E("organism", "human", "Human", "Human", [r"humans?", r"astronauts?", r"cosmonauts?", r"crew ?members?", r"participants", r"subjects", r"twins? study", r"homo sapiens"], "NCBITaxon:9606"),
    E("organism", "human_cells", "Human cells (in vitro)", "Cell culture", [r"human (?:\w+ )?cells?", r"HUVECs?", r"lymphocytes", r"fibroblasts", r"keratinocytes", r"osteoblasts?", r"iPSC-?CMs?", r"cardiomyocytes", r"mesenchymal stem cells", r"MSCs?"], None),
    E("organism", "mouse", "Mouse", "Rodent", [r"mice", r"mouse", r"murine", r"mus musculus", r"C57BL/?6J?", r"BALB/c"], "NCBITaxon:10090"),
    E("organism", "rat", "Rat", "Rodent", [r"rats?", r"rattus", r"sprague[- ]dawley", r"wistar"], "NCBITaxon:10116"),
    E("organism", "primate", "Non-human primate", "Other animal", [r"rhesus", r"macaques?", r"monkeys?", r"non-human primates?"], "NCBITaxon:9544"),
    E("organism", "zebrafish", "Zebrafish", "Other animal", [r"zebrafish", r"danio rerio"], "NCBITaxon:7955"),
    E("organism", "medaka", "Medaka", "Other animal", [r"medaka", r"oryzias latipes"], "NCBITaxon:8090"),
    E("organism", "xenopus", "Xenopus", "Other animal", [r"xenopus"], "NCBITaxon:8355"),
    E("organism", "newt", "Newt", "Other animal", [r"newts?", r"pleurodeles"], None),
    E("organism", "drosophila", "Fruit fly", "Other animal", [r"drosophila", r"fruit fl(?:y|ies)"], "NCBITaxon:7227"),
    E("organism", "c_elegans", "C. elegans", "Other animal", [r"c\. ?elegans", r"caenorhabditis", r"nematodes?"], "NCBITaxon:6239"),
    E("organism", "tardigrade", "Tardigrade", "Other animal", [r"tardigrades?"], None),
    E("organism", "planarian", "Planarian", "Other animal", [r"planarians?", r"dugesia", r"schmidtea"], None),
    E("organism", "squid", "Bobtail squid", "Other animal", [r"euprymna", r"bobtail squid", r"squid"], None),
    E("organism", "arabidopsis", "Arabidopsis", "Plant", [r"arabidopsis", r"thale cress"], "NCBITaxon:3702"),
    E("organism", "brassica", "Brassica", "Plant", [r"brassica", r"mizuna", r"mustard"], None),
    E("organism", "rice", "Rice", "Plant", [r"rice", r"oryza sativa"], "NCBITaxon:4530"),
    E("organism", "wheat", "Wheat", "Plant", [r"wheat", r"triticum"], None),
    E("organism", "lettuce", "Lettuce", "Plant", [r"lettuce", r"lactuca"], None),
    E("organism", "tomato", "Tomato", "Plant", [r"tomato(?:es)?", r"solanum lycopersicum"], None),
    E("organism", "moss", "Moss", "Plant", [r"physcomitrella", r"physcomitrium", r"moss"], None),
    E("organism", "fern", "Fern (Ceratopteris)", "Plant", [r"ceratopteris", r"fern spores?"], None),
    E("organism", "algae", "Algae", "Plant", [r"chlamydomonas", r"microalgae", r"euglena", r"algae"], None),
    E("organism", "e_coli", "E. coli", "Microbe", [r"e\. ?coli", r"escherichia coli"], "NCBITaxon:562"),
    E("organism", "b_subtilis", "Bacillus", "Microbe", [r"b\. ?subtilis", r"bacillus(?: \w+)?"], "NCBITaxon:1423"),
    E("organism", "s_aureus", "Staphylococcus", "Microbe", [r"s\. ?aureus", r"staphylococcus(?: \w+)?"], None),
    E("organism", "salmonella", "Salmonella", "Microbe", [r"salmonella(?: \w+)?", r"s\. ?typhimurium"], None),
    E("organism", "pseudomonas", "Pseudomonas", "Microbe", [r"pseudomonas(?: \w+)?", r"p\. ?aeruginosa"], None),
    E("organism", "streptococcus", "Streptococcus", "Microbe", [r"streptococcus(?: \w+)?", r"s\. ?mutans"], None),
    E("organism", "klebsiella", "Klebsiella / Enterobacter", "Microbe", [r"klebsiella", r"enterobacter(?: \w+)?"], None),
    E("organism", "yeast", "Yeast", "Microbe", [r"yeast", r"saccharomyces", r"s\. ?cerevisiae", r"candida albicans"], "NCBITaxon:4932"),
    E("organism", "fungi", "Filamentous fungi", "Microbe", [r"aspergillus(?: \w+)?", r"fungi", r"fungal", r"penicillium"], None),
    E("organism", "microbiome", "Microbial community", "Microbe", [r"microbiome", r"microbiota", r"microbial communit(?:y|ies)", r"metagenom\w*"], None),
    E("organism", "virus", "Virus", "Microbe", [r"virus(?:es)?", r"viral reactivation", r"herpesvirus", r"EBV", r"VZV"], None),
]

# ----------------------------------------------------------------------------- stressors
STRESSORS = [
    E("stressor", "microgravity_flight", "Spaceflight microgravity", "Flight",
      [r"space ?flights?", r"microgravity", r"micro-gravity", r"weightlessness", r"orbital flight", r"space environment",
       r"international space station", r"ISS", r"in space", r"flight animals", r"space-flown", r"flown"]),
    E("stressor", "simulated_microgravity", "Simulated microgravity (analog)", "Ground analog",
      [r"simulated microgravity", r"hind ?limb (?:unloading|suspension)", r"hindlimb-unloaded", r"HLU", r"HU mice",
       r"clinostats?", r"clinorotation", r"random positioning machine", r"RPM", r"rotating wall vessel", r"RWV",
       r"head-down (?:tilt )?bed rest", r"bed rest", r"HDBR", r"dry immersion", r"unloading", r"diamagnetic levitation"]),
    E("stressor", "space_radiation", "Space / ionizing radiation", "Radiation",
      [r"ionizing radiation", r"space radiation", r"cosmic radiation", r"galactic cosmic rays?", r"GCR", r"HZE",
       r"heavy[- ]ions?", r"high-LET", r"(?:56)?Fe (?:ions?|particles?)", r"iron ions?", r"protons? (?:irradiation|radiation)",
       r"gamma[- ]?(?:rays?|radiation|irradiation)", r"X-?ray irradiation", r"solar particle events?", r"irradiat(?:ion|ed)", r"radiation exposure"]),
    E("stressor", "hypergravity", "Hypergravity", "Gravity",
      [r"hypergravity", r"centrifugation", r"\d(?:\.\d)? ?g centrifug\w*", r"high[- ]g"]),
    E("stressor", "partial_gravity", "Partial gravity (Moon / Mars)", "Gravity",
      [r"partial (?:gravity|weight ?bearing)", r"lunar gravity", r"martian gravity", r"mars gravity", r"0\.38 ?g", r"0\.16 ?g", r"1/6 ?g"]),
    E("stressor", "isolation", "Isolation & confinement", "Behavioral",
      [r"isolation and confinement", r"isolated,? confined", r"confinement", r"social isolation", r"mars-?500", r"HERA", r"antarctic\w*", r"analog missions?"]),
    E("stressor", "atmosphere", "Altered atmosphere (O₂ / CO₂)", "Environment",
      [r"hypoxi[ac]", r"hypercapni[ac]", r"elevated CO2", r"carbon dioxide", r"hyperoxi[ac]"]),
    E("stressor", "circadian", "Circadian / sleep disruption", "Behavioral",
      [r"circadian (?:disruption|misalignment)", r"sleep (?:loss|deprivation|restriction)", r"light[- ]dark cycles?", r"shift ?work"]),
    E("stressor", "hypomagnetic", "Hypomagnetic field", "Environment",
      [r"hypomagnetic", r"geomagnetic field", r"magnetic field"]),
]

# ----------------------------------------------------------------------------- platforms / missions
PLATFORMS = [
    E("platform", "iss", "International Space Station", "Flight", [r"international space station", r"ISS"]),
    E("platform", "shuttle", "Space Shuttle", "Flight", [r"space shuttle", r"STS-?\d+"]),
    E("platform", "bion", "Bion / Foton", "Flight", [r"bion-?m ?1?", r"bion", r"foton(?:-m\d)?"]),
    E("platform", "rodent_research", "Rodent Research (ISS)", "Flight", [r"rodent research(?:-\d+)?", r"RR-\d+"]),
    E("platform", "twins", "NASA Twins Study", "Flight", [r"twins? study"]),
    E("platform", "spacelab", "Spacelab / SLS", "Flight", [r"spacelab", r"SLS-\d"]),
    E("platform", "mir", "Mir", "Flight", [r"mir space station", r"\bmir\b"]),
    E("platform", "tiangong", "Chinese station / Shenzhou", "Flight", [r"tiangong", r"shenzhou", r"SJ-10", r"shijian"]),
    E("platform", "commercial", "Commercial / short-duration flight", "Flight", [r"inspiration4", r"spacex", r"axiom"]),
    E("platform", "parabolic", "Parabolic flight / sounding rocket", "Short microgravity", [r"parabolic flights?", r"sounding rockets?", r"drop tower"]),
    E("platform", "hindlimb", "Hindlimb unloading", "Ground analog", [r"hind ?limb (?:unloading|suspension)", r"hindlimb-unloaded", r"HLU"]),
    E("platform", "bedrest", "Head-down bed rest", "Ground analog", [r"head-down (?:tilt )?bed rest", r"bed rest", r"HDBR"]),
    E("platform", "clinostat", "Clinostat / RPM / RWV", "Ground analog", [r"clinostats?", r"clinorotation", r"random positioning machine", r"rotating wall vessel", r"RWV", r"RPM"]),
    E("platform", "nsrl", "NASA Space Radiation Laboratory", "Ground analog", [r"NSRL", r"NASA space radiation laborator\w*", r"brookhaven"]),
    E("platform", "isolation_analog", "Isolation analog (HERA / Mars-500 / Antarctica)", "Ground analog", [r"HERA", r"mars-?500", r"antarctic\w*", r"concordia"]),
]

# ----------------------------------------------------------------------------- tissues / systems
TISSUES = [
    E("tissue", "bone", "Bone / skeleton", "Musculoskeletal", [r"bones?", r"skeletal system", r"femur", r"tibia", r"pelvi[cs]", r"trabecular", r"cortical bone", r"osteo\w+"], "UBERON:0002481"),
    E("tissue", "muscle", "Skeletal muscle", "Musculoskeletal", [r"skeletal muscles?", r"muscles?", r"soleus", r"gastrocnemius", r"quadriceps", r"myofib\w+", r"myotubes?"], "UBERON:0001134"),
    E("tissue", "cartilage", "Cartilage / joints / spine", "Musculoskeletal", [r"cartilage", r"intervertebral discs?", r"spine", r"tendons?"], None),
    E("tissue", "heart", "Heart / cardiovascular", "Cardiovascular", [r"heart", r"cardiac", r"cardiovascular", r"cardiomyocytes?", r"arter(?:y|ies|ial)", r"vascular", r"endothelial", r"aorta"], "UBERON:0004535"),
    E("tissue", "blood", "Blood / hematopoiesis", "Immune & blood", [r"blood", r"erythrocytes?", r"red blood cells", r"hematopoie\w+", r"bone marrow", r"plasma"], None),
    E("tissue", "immune", "Immune system", "Immune & blood", [r"immune", r"immunity", r"T[- ]cells?", r"B[- ]cells?", r"macrophages?", r"thymus", r"spleen", r"leukocytes?", r"lymphocytes?", r"NK cells?", r"cytokines?"], "UBERON:0002405"),
    E("tissue", "brain", "Brain / CNS", "Nervous system", [r"brain", r"central nervous system", r"CNS", r"hippocamp\w+", r"cortex", r"neurons?", r"neural", r"cerebr\w+"], "UBERON:0000955"),
    E("tissue", "eye", "Eye / retina", "Nervous system", [r"eyes?", r"retina\w*", r"ocular", r"optic nerve", r"SANS", r"choroid"], "UBERON:0000970"),
    E("tissue", "vestibular", "Vestibular / sensorimotor", "Nervous system", [r"vestibular", r"inner ear", r"sensorimotor", r"otolith\w*"], None),
    E("tissue", "liver", "Liver", "Metabolic", [r"liver", r"hepat\w+"], "UBERON:0002107"),
    E("tissue", "kidney", "Kidney", "Metabolic", [r"kidneys?", r"renal"], "UBERON:0002113"),
    E("tissue", "adipose", "Adipose tissue", "Metabolic", [r"adipose", r"fat tissue", r"adipocytes?"], None),
    E("tissue", "gut", "Gut / GI tract", "Metabolic", [r"gut", r"intestin\w+", r"colon", r"gastrointestinal", r"fecal"], "UBERON:0001555"),
    E("tissue", "skin", "Skin", "Other tissue", [r"skin", r"dermal", r"epiderm\w+", r"wound"], "UBERON:0002097"),
    E("tissue", "lung", "Lung", "Other tissue", [r"lungs?", r"pulmonary"], "UBERON:0002048"),
    E("tissue", "reproductive", "Reproductive system", "Other tissue", [r"testis", r"testes", r"ovar(?:y|ies|ian)", r"sperm\w*", r"oocytes?", r"reproductive", r"embryos?", r"embryonic"], None),
    E("tissue", "stem_cells", "Stem cells", "Other tissue", [r"stem cells?", r"progenitor cells?", r"pluripotent"], None),
    E("tissue", "root", "Root", "Plant tissue", [r"roots?", r"root tips?", r"root hairs?"], None),
    E("tissue", "shoot", "Shoot / leaf", "Plant tissue", [r"shoots?", r"leaf", r"leaves", r"hypocotyls?", r"seedlings?", r"chloroplasts?"], None),
    E("tissue", "seed", "Seed / germination", "Plant tissue", [r"seeds?", r"germination", r"flowering"], None),
    E("tissue", "cell_wall", "Cell wall", "Plant tissue", [r"cell walls?", r"lignin"], None),
    E("tissue", "biofilm", "Biofilm", "Microbial", [r"biofilms?"], None),
]

# ----------------------------------------------------------------------------- outcomes (processes / phenotypes)
OUTCOMES = [
    E("outcome", "bone_mass", "Bone mass / density", "Structure",
      [r"bone (?:mineral )?density", r"bone loss", r"bone mass", r"BMD", r"osteopenia", r"bone volume", r"trabecular (?:thickness|number)", r"bone formation"],
      "GO:0046849", implied={"bone loss": "decrease", "osteopenia": "decrease"}),
    E("outcome", "muscle_mass", "Muscle mass / function", "Structure",
      [r"muscle atrophy", r"atrophy", r"muscle mass", r"muscle (?:strength|function|force)", r"fiber (?:size|cross-sectional area)", r"muscle wasting", r"sarcopenia"],
      "GO:0014889", implied={"muscle atrophy": "decrease", "atrophy": "decrease", "muscle wasting": "decrease", "sarcopenia": "decrease"}),
    E("outcome", "oxidative_stress", "Oxidative stress", "Cellular stress",
      [r"oxidative stress", r"reactive oxygen species", r"ROS", r"lipid peroxidation", r"antioxidant (?:capacity|enzymes?)", r"NRF2", r"Nrf2"], "GO:0006979"),
    E("outcome", "dna_damage", "DNA damage & repair", "Cellular stress",
      [r"DNA damage", r"DNA repair", r"double[- ]strand breaks?", r"γ-?H2AX", r"gamma-?H2AX", r"chromosom\w+ aberrations?", r"genomic instability", r"mutations?"], "GO:0006974"),
    E("outcome", "inflammation", "Inflammation", "Immune",
      [r"inflammat\w+", r"pro-inflammatory", r"IL-?6", r"IL-?1β?", r"TNF-?α?", r"NF-?κB", r"NF-?kB"], "GO:0006954"),
    E("outcome", "immune_function", "Immune function", "Immune",
      [r"immune (?:function|response|dysregulation|suppression|dysfunction)", r"immunosuppress\w+", r"T[- ]cell activation", r"viral reactivation", r"antibod(?:y|ies)"], "GO:0006955"),
    E("outcome", "gene_expression", "Gene expression / transcriptome", "Molecular",
      [r"gene expression", r"transcriptom\w+", r"differentially expressed genes", r"DEGs?", r"RNA-?seq", r"transcripts?"], "GO:0010467"),
    E("outcome", "epigenetic", "Epigenetics / methylation", "Molecular",
      [r"DNA methylation", r"epigenetic\w*", r"histone modifications?", r"microRNAs?", r"miRNAs?"], None),
    E("outcome", "telomere", "Telomere length", "Molecular", [r"telomeres?", r"telomere length"], None),
    E("outcome", "apoptosis", "Apoptosis / cell death", "Cell fate", [r"apoptosis", r"apoptotic", r"cell death", r"caspase-?\d?"], "GO:0006915"),
    E("outcome", "proliferation", "Proliferation / cell cycle", "Cell fate", [r"proliferation", r"cell cycle", r"cell growth", r"p21", r"CDKN1A", r"cell division"], "GO:0008283"),
    E("outcome", "differentiation", "Differentiation / regeneration", "Cell fate", [r"differentiation", r"regenerat\w+", r"stemness", r"self-renewal"], "GO:0030154"),
    E("outcome", "senescence", "Senescence / aging", "Cell fate", [r"senescen\w+", r"aging", r"ageing"], None),
    E("outcome", "mitochondria", "Mitochondrial function", "Metabolism", [r"mitochondri\w+", r"oxidative phosphorylation", r"OXPHOS", r"ATP production"], "GO:0007005"),
    E("outcome", "metabolism", "Metabolism (lipid / glucose)", "Metabolism",
      [r"metabolism", r"metabolic", r"lipid\w*", r"glucose", r"insulin (?:resistance|sensitivity)", r"fatty acids?", r"cholesterol"], "GO:0008152"),
    E("outcome", "cognition", "Cognition / behavior", "Neuro",
      [r"cognit\w+", r"behavio(?:u)?r\w*", r"memory", r"learning", r"anxiety", r"neurobehavio\w+", r"performance deficits?"], None),
    E("outcome", "vision", "Vision / ocular structure", "Neuro", [r"visual (?:acuity|impairment)", r"optic disc edema", r"SANS", r"intraocular pressure", r"retinal (?:thickness|damage)"], None),
    E("outcome", "circadian_rhythm", "Circadian rhythm / sleep", "Neuro", [r"circadian rhythms?", r"clock genes?", r"sleep"], "GO:0007623"),
    E("outcome", "cardio_function", "Cardiovascular function", "Physiology",
      [r"cardiac (?:function|output|atrophy|remodeling)", r"blood pressure", r"orthostatic intolerance", r"arterial stiffness", r"vascular (?:function|remodeling)", r"heart rate"], None),
    E("outcome", "fluid_shift", "Fluid shift", "Physiology", [r"fluid shifts?", r"headward fluid", r"cephalad"], None),
    E("outcome", "virulence", "Virulence", "Microbial", [r"virulence", r"pathogenicity", r"infectivity"], None),
    E("outcome", "antibiotic_resistance", "Antimicrobial resistance", "Microbial", [r"antibiotic resistance", r"antimicrobial resistance", r"drug resistance", r"resistance to antibiotics"], None),
    E("outcome", "biofilm_formation", "Biofilm formation", "Microbial", [r"biofilm formation", r"biofilms?"], None),
    E("outcome", "microbiome_composition", "Microbiome composition", "Microbial", [r"microbial (?:diversity|composition)", r"dysbiosis", r"relative abundance", r"alpha diversity"], None),
    E("outcome", "plant_growth", "Plant growth & development", "Plant",
      [r"plant growth", r"root growth", r"root length", r"biomass", r"growth rate", r"seed production", r"photosynthe\w+"], None),
    E("outcome", "gravitropism", "Gravitropism / gravity sensing", "Plant", [r"gravitrop\w+", r"gravity sensing", r"gravisens\w+", r"statoliths?", r"auxin"], "GO:0009630"),
    E("outcome", "cytoskeleton", "Cytoskeleton / cell shape", "Cellular", [r"cytoskelet\w+", r"actin", r"microtubules?", r"cell morphology", r"cell shape"], "GO:0007010"),
    E("outcome", "calcium", "Calcium signaling", "Cellular", [r"calcium signal\w+", r"Ca2\+", r"calcium"], None),
    E("outcome", "stress_response", "Stress response (heat shock / UPR)", "Cellular stress",
      [r"stress response", r"heat shock proteins?", r"HSPs?", r"unfolded protein response", r"ER stress"], "GO:0033554"),
    E("outcome", "wound_healing", "Wound healing", "Physiology", [r"wound healing", r"tissue repair"], None),
    E("outcome", "cancer_risk", "Carcinogenesis / tumor risk", "Cellular stress", [r"carcinogen\w+", r"tumou?r\w*", r"cancer risk", r"oncogen\w+", r"cancer"], None),
    E("outcome", "reproduction", "Reproduction / development", "Physiology", [r"fertility", r"embryonic development", r"spermatogenesis", r"reproduct\w+ success", r"development"], None),
]

# ----------------------------------------------------------------------------- countermeasures
COUNTERMEASURES = [
    E("countermeasure", "exercise", "Exercise (resistive / aerobic)", "Physical", [r"exercise", r"resistive training", r"ARED", r"treadmill", r"cycle ergometer", r"physical training"]),
    E("countermeasure", "artificial_gravity", "Artificial gravity", "Physical", [r"artificial gravity", r"(?:short-arm |onboard )?centrifug\w+ (?:as|countermeasure)", r"1 ?g centrifuge"]),
    E("countermeasure", "vibration", "Vibration / mechanical loading", "Physical", [r"vibration", r"mechanical (?:loading|stimulation)", r"reloading"]),
    E("countermeasure", "bisphosphonate", "Bisphosphonates", "Pharmacological", [r"bisphosphonates?", r"zoledron\w+", r"alendronate", r"risedronate"]),
    E("countermeasure", "rankl_inhibitor", "RANKL / sclerostin inhibition", "Pharmacological", [r"RANKL (?:inhibit\w+|antibod\w+|blockade)", r"denosumab", r"sclerostin antibod\w+", r"OPG-?Fc", r"romosozumab"]),
    E("countermeasure", "myostatin", "Myostatin / activin inhibition", "Pharmacological", [r"myostatin (?:inhibit\w+|antibod\w+)", r"activin", r"ACVR2B", r"follistatin"]),
    E("countermeasure", "antioxidant", "Antioxidants", "Nutritional", [r"antioxidants?", r"N-acetyl ?cysteine", r"NAC", r"vitamin [CE]", r"catalase over-?expression", r"resveratrol", r"CDDO"]),
    E("countermeasure", "nutrition", "Nutrition / supplements", "Nutritional", [r"diet(?:ary)?", r"nutrition\w*", r"supplement\w*", r"vitamin D", r"omega-3", r"probiotics?", r"fiber-rich"]),
    E("countermeasure", "shielding", "Radiation shielding", "Engineering", [r"shielding", r"polyethylene"]),
    E("countermeasure", "radioprotector", "Radioprotective drugs", "Pharmacological", [r"radioprotect\w+", r"amifostine", r"radiomitigat\w+"]),
    E("countermeasure", "lbnp", "Lower-body negative pressure", "Physical", [r"lower[- ]body negative pressure", r"LBNP", r"thigh cuffs?"]),
    E("countermeasure", "melatonin", "Melatonin / lighting", "Behavioral", [r"melatonin", r"lighting countermeasure", r"light therapy"]),
    E("countermeasure", "hormone", "Hormonal therapy", "Pharmacological", [r"testosterone", r"growth hormone", r"IGF-?1 (?:treatment|administration)", r"estrogen (?:treatment|replacement)"]),
]

# ----------------------------------------------------------------------------- genes / pathways worth a node
GENES = [
    E("gene", "cdkn1a", "CDKN1A / p21", "Cell cycle", [r"CDKN1a", r"p21(?:Cip1|WAF1)?"]),
    E("gene", "tp53", "TP53 / p53", "Cell cycle", [r"TP53", r"p53", r"Trp53"]),
    E("gene", "rankl", "RANKL / OPG", "Bone remodeling", [r"RANKL", r"Tnfsf11", r"osteoprotegerin", r"OPG"]),
    E("gene", "sost", "Sclerostin (SOST)", "Bone remodeling", [r"sclerostin", r"SOST"]),
    E("gene", "mstn", "Myostatin (MSTN)", "Muscle", [r"myostatin", r"MSTN"]),
    E("gene", "foxo", "FOXO", "Muscle", [r"FOXO\d?\w?", r"atrogin-?1", r"MuRF-?1", r"Fbxo32", r"Trim63"]),
    E("gene", "mtor", "mTOR / IGF-1 / Akt", "Growth signaling", [r"mTOR\w*", r"IGF-?1", r"Akt", r"PI3K"]),
    E("gene", "nrf2", "NRF2 / KEAP1", "Oxidative stress", [r"NRF2", r"Nfe2l2", r"KEAP1"]),
    E("gene", "hif1a", "HIF-1α", "Hypoxia", [r"HIF-?1α?", r"HIF1A"]),
    E("gene", "nfkb", "NF-κB", "Inflammation", [r"NF-?κB", r"NF-?kB", r"NFKB1"]),
    E("gene", "tgfb", "TGF-β", "Growth signaling", [r"TGF-?β\d?", r"TGF-?beta", r"TGFB1"]),
    E("gene", "wnt", "Wnt / β-catenin", "Growth signaling", [r"Wnt\w*", r"β-catenin", r"beta-catenin"]),
    E("gene", "hsp", "Heat shock proteins", "Stress response", [r"HSP\d+\w?", r"heat shock proteins?"]),
    E("gene", "pgc1a", "PGC-1α", "Mitochondria", [r"PGC-?1α", r"PGC-?1alpha", r"Ppargc1a"]),
    E("gene", "clock", "Clock genes (Per / Bmal1)", "Circadian", [r"Bmal1", r"Arntl", r"Per[12]", r"Cry[12]", r"Clock gene\w*"]),
    E("gene", "il6", "IL-6", "Inflammation", [r"IL-?6", r"interleukin-?6"]),
    E("gene", "tnf", "TNF-α", "Inflammation", [r"TNF-?α", r"TNF-alpha", r"tumou?r necrosis factor"]),
    E("gene", "auxin", "Auxin signaling (PIN / ARF)", "Plant signaling", [r"PIN[1-7]", r"auxin transport\w*", r"ARF\d+"]),
    E("gene", "hfq", "Hfq (bacterial regulator)", "Microbial", [r"Hfq"]),
]

ALL_ENTITIES: list[Entity] = ORGANISMS + STRESSORS + PLATFORMS + TISSUES + OUTCOMES + COUNTERMEASURES + GENES

# Cross-references for entries defined without one (NCBITaxon, UBERON, PO, CL, GO, MeSH, HGNC).
# Only unambiguous mappings; umbrella entries (e.g. "Algae", "Clock genes") deliberately stay unmapped.
EXTRA_IDS = {
    "organism:tardigrade": "NCBITaxon:42241", "organism:squid": "NCBITaxon:6613", "organism:brassica": "NCBITaxon:3705",
    "organism:wheat": "NCBITaxon:4565", "organism:lettuce": "NCBITaxon:4236", "organism:tomato": "NCBITaxon:4081",
    "organism:fern": "NCBITaxon:49495", "organism:s_aureus": "NCBITaxon:1279", "organism:salmonella": "NCBITaxon:590",
    "organism:pseudomonas": "NCBITaxon:286", "organism:streptococcus": "NCBITaxon:1301", "organism:virus": "NCBITaxon:10239",
    "stressor:microgravity_flight": "MESH:D018474", "stressor:simulated_microgravity": "MESH:D018767",
    "stressor:space_radiation": "MESH:D003358",
    "tissue:cartilage": "UBERON:0002418", "tissue:blood": "UBERON:0000178", "tissue:adipose": "UBERON:0001013",
    "tissue:reproductive": "UBERON:0000990", "tissue:stem_cells": "CL:0000034", "tissue:root": "PO:0009005",
    "tissue:shoot": "PO:0009006", "tissue:seed": "PO:0009010", "tissue:cell_wall": "GO:0005618",
    "outcome:telomere": "GO:0000781", "outcome:senescence": "GO:0090398", "outcome:antibiotic_resistance": "GO:0046677",
    "outcome:biofilm_formation": "GO:0042710", "outcome:calcium": "GO:0019722", "outcome:wound_healing": "GO:0042060",
    "outcome:cancer_risk": "MESH:D063646", "outcome:reproduction": "GO:0000003",
    "countermeasure:exercise": "MESH:D015444", "countermeasure:bisphosphonate": "MESH:D004164",
    "countermeasure:antioxidant": "MESH:D000975", "countermeasure:melatonin": "MESH:D008550",
    "countermeasure:lbnp": "MESH:D008165", "countermeasure:radioprotector": "MESH:D011837",
    "gene:cdkn1a": "HGNC:1784", "gene:tp53": "HGNC:11998", "gene:rankl": "HGNC:11926", "gene:sost": "HGNC:13771",
    "gene:mstn": "HGNC:4223", "gene:mtor": "HGNC:3942", "gene:nrf2": "HGNC:7782", "gene:hif1a": "HGNC:4910",
    "gene:nfkb": "HGNC:7794", "gene:tgfb": "HGNC:11766", "gene:wnt": "HGNC:2514", "gene:pgc1a": "HGNC:9237",
    "gene:il6": "HGNC:6018", "gene:tnf": "HGNC:11892",
}
for _e in ALL_ENTITIES:
    _e.ontology = _e.ontology or EXTRA_IDS.get(_e.id)

BY_ID = {e.id: e for e in ALL_ENTITIES}
BY_TYPE: dict[str, list[Entity]] = {}
for _e in ALL_ENTITIES:
    BY_TYPE.setdefault(_e.type, []).append(_e)

FLIGHT_STRESSOR = "stressor:microgravity_flight"
ANALOG_STRESSOR = "stressor:simulated_microgravity"

# ----------------------------------------------------------------------------- direction cues
INCREASE = re.compile(r"\b(?:increas\w*|elevat\w*|up-?regulat\w*|enhanc\w*|higher|greater|induc\w*|promot\w*|accelerat\w*|augment\w*|stimulat\w*|activat\w*)\b", re.I)
DECREASE = re.compile(r"\b(?:decreas\w*|reduc\w*|down-?regulat\w*|lower\w*|loss|lost|impair\w*|suppress\w*|inhibit\w*|attenuat\w*|diminish\w*|declin\w*|atroph\w*|depress\w*|less|fewer|deplet\w*|delay\w*)\b", re.I)
NOCHANGE = re.compile(r"\b(?:no (?:significant )?(?:change|difference|effect|alteration)s?|not (?:significantly )?(?:alter\w*|affect\w*|chang\w*|differ\w*|reduc\w*|increas\w*|impair\w*)|(?:did|does|do) not (?:\w+ )?(?:alter|affect|change|reduce|increase|impair|differ)\w*|unchanged|unaffected|comparable|similar (?:to|between))\b", re.I)
PREVENT = re.compile(r"\b(?:prevent\w*|mitigat\w*|attenuat\w*|protect\w*|rescu\w*|restor\w*|counteract\w*|ameliorat\w*|preserv\w*|blunt\w*|abrogat\w*)\b", re.I)
NOT_PREVENT = re.compile(r"\b(?:did not|failed to|could not|was not able to|insufficient to|does not) (?:\w+ )?(?:prevent|mitigat|protect|rescu|restor|counteract|attenuat)\w*", re.I)


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
    hits = find(entity_type, raw)
    if hits:
        return hits[0][0].id
    raw_l = raw.lower()
    for e in BY_TYPE[entity_type]:
        if e.label.lower() in raw_l or raw_l in e.label.lower():
            return e.id
    return None

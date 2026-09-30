"""Plain-language glossary of space-biology jargon (used by the glossary page and the student persona)."""
from __future__ import annotations

import re

GLOSSARY: dict[str, str] = {
    "microgravity": "The near-weightless condition in orbit, where objects and fluids float because everything is in free fall together.",
    "simulated microgravity": "Ground experiments that imitate weightlessness, e.g. by constantly rotating samples or unloading an animal's legs.",
    "hindlimb unloading": "A ground model where a rodent's hind legs are lifted off the floor so they carry no weight, imitating spaceflight's effect on bones and muscles.",
    "bed rest": "Volunteers lie in bed, usually tilted head-down by 6°, for weeks to mimic the fluid shift and inactivity of spaceflight.",
    "clinostat": "A device that slowly rotates samples so gravity's pull averages out, used to imitate weightlessness for cells and plants.",
    "random positioning machine": "A two-axis rotating device that keeps changing a sample's orientation to simulate microgravity.",
    "rotating wall vessel": "A spinning, fluid-filled culture chamber that keeps cells in gentle free fall.",
    "galactic cosmic rays": "Very high-energy particles from outside the solar system; hard to shield and a major health risk beyond Earth orbit.",
    "hze": "High-charge, high-energy particles (like iron nuclei) in cosmic rays that cause dense tracks of damage in cells.",
    "high-let": "High linear energy transfer: radiation that deposits a lot of energy per distance travelled, so it is more damaging to cells.",
    "gy": "Gray, the unit of absorbed radiation dose (1 joule per kilogram of tissue).",
    "sievert": "Unit of radiation dose weighted by biological harm; astronauts on a Mars mission might receive around 1 Sv.",
    "osteopenia": "Lower-than-normal bone density; a milder form of bone loss than osteoporosis.",
    "bone mineral density": "How much mineral (mostly calcium) is packed into bone; it drops about 1–1.5% per month in orbit.",
    "osteoclast": "A cell that breaks down bone; more active in microgravity.",
    "osteoblast": "A cell that builds new bone; less active in microgravity.",
    "atrophy": "Wasting away or shrinking of a tissue, such as muscle that isn't used.",
    "sarcopenia": "Loss of muscle mass and strength.",
    "oxidative stress": "Damage caused when reactive oxygen molecules outnumber the body's antioxidant defences.",
    "reactive oxygen species": "Unstable oxygen-containing molecules that can damage DNA, proteins and fats.",
    "apoptosis": "Programmed cell death: a controlled way for damaged cells to remove themselves.",
    "senescence": "A state where cells stop dividing but stay alive, often linked to aging.",
    "telomere": "Protective caps at the ends of chromosomes that usually shorten with age.",
    "epigenetic": "Changes in how genes are switched on or off without changing the DNA sequence itself.",
    "transcriptome": "The full set of RNA messages a cell is producing, showing which genes are active.",
    "gene expression": "How actively a gene is being read to make RNA and protein.",
    "omics": "Large-scale measurement of all molecules of one kind, e.g. genomics (DNA), proteomics (proteins).",
    "sans": "Spaceflight-associated neuro-ocular syndrome: swelling of the optic disc and eye-shape changes seen in astronauts.",
    "fluid shift": "Movement of body fluids toward the head in weightlessness, causing puffy faces and possibly eye changes.",
    "orthostatic intolerance": "Dizziness or fainting when standing up, common after returning from space.",
    "vestibular": "Relating to the inner-ear balance system, which is confused by weightlessness.",
    "immune dysregulation": "The immune system working abnormally, too weakly or too strongly.",
    "cytokine": "A small signalling protein immune cells use to communicate, e.g. IL-6 or TNF-α.",
    "inflammation": "The body's defensive response to injury or infection; harmful when it lasts too long.",
    "microbiome": "The community of microbes living in and on a body or habitat.",
    "biofilm": "A slimy, protective layer of microbes stuck to a surface; harder to clean and to treat with antibiotics.",
    "virulence": "How capable a microbe is of causing disease.",
    "gravitropism": "A plant's ability to sense gravity and grow roots down and shoots up.",
    "countermeasure": "Anything used to prevent or reduce a spaceflight health effect, such as exercise or medication.",
    "bisphosphonate": "A class of drugs that slow bone breakdown, tested to prevent bone loss in astronauts.",
    "in vitro": "Experiments on cells or molecules in a dish or tube, outside a living organism.",
    "in vivo": "Experiments in a whole living organism.",
    "ground analog": "An Earth-based experiment that imitates part of the spaceflight environment.",
    "osdr": "NASA's Open Science Data Repository, which stores raw data from space-biology experiments.",
    "genelab": "NASA's omics database, now part of OSDR.",
    "iss": "The International Space Station, a laboratory orbiting about 400 km above Earth.",
    "meta-analysis": "A study that statistically combines the results of many other studies.",
}
_RX = {term: re.compile(rf"(?<![\w-]){re.escape(term)}s?(?![\w-])", re.I) for term in GLOSSARY}


def terms_in(text: str, limit: int = 4) -> list[dict]:
    """Glossary terms that appear in a piece of text, in order of first appearance."""
    hits = sorted(((m.start(), t) for t, rx in _RX.items() if (m := rx.search(text))), key=lambda x: x[0])
    seen, out = set(), []
    for _, t in hits:
        if t not in seen:
            seen.add(t)
            out.append({"term": t, "definition": GLOSSARY[t]})
    return out[:limit]


def all_terms() -> list[dict]:
    return [{"term": t, "definition": d} for t, d in sorted(GLOSSARY.items())]

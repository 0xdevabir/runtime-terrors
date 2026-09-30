"""Plain-language glossary of microgravity-combustion and spacecraft fire-safety jargon (glossary page + student persona)."""
from __future__ import annotations

import re

GLOSSARY: dict[str, str] = {
    "microgravity": "The near-weightless condition in orbit or free fall, where hot gas no longer rises, so flames lose the buoyant flow that feeds them on Earth.",
    "free fall": "Falling freely under gravity, so everything inside feels weightless; drop towers, parabolic flights and orbiting spacecraft all use it.",
    "buoyancy": "The upward push on hot, light gas; on Earth it draws fresh air into a flame, in freefall it disappears.",
    "partial gravity": "Gravity weaker than Earth's, such as the Moon (0.16 g) or Mars (0.38 g).",
    "drop tower": "A tall shaft where an experiment is dropped to get a few seconds (about 2–10 s) of weightlessness.",
    "parabolic flight": "An aircraft flying up-and-over arcs to give about 20 seconds of weightlessness at a time.",
    "sounding rocket": "A small research rocket that gives several minutes of weightlessness before falling back to Earth.",
    "flame spread": "How fast a flame moves across the surface of a material such as paper, fabric or plastic.",
    "opposed flow": "Air flowing against the direction a flame is spreading; it slows the flame and can blow it out.",
    "concurrent flow": "Air flowing in the same direction a flame is spreading; it usually makes the flame grow faster.",
    "quiescent": "Still air with no flow; in freefall a flame in still air can starve itself of oxygen.",
    "thermally thin": "A fuel so thin (like paper) that it heats up all the way through at once.",
    "thermally thick": "A fuel thick enough that only its surface heats up quickly, like a block of plastic.",
    "extinction": "When a flame goes out, for example because it gets too little oxygen or loses too much heat.",
    "flammability limit": "The edge between conditions where a material can keep burning and where it cannot.",
    "limiting oxygen index": "The lowest oxygen level at which a material keeps burning; in freefall it can differ from Earth tests.",
    "maximum oxygen concentration": "The highest oxygen level at which a material will not keep burning in a standard test.",
    "pmma": "Polymethyl methacrylate, a clear plastic (acrylic) often used as a standard test fuel.",
    "sibal": "A cotton-fiberglass fabric blend flown in Saffire tests as a realistic spacecraft material.",
    "pyrolysis": "The breakdown of a solid by heat into flammable gases, before it actually burns.",
    "smoldering": "Slow, flameless burning, like glowing embers; it can hide inside foam or insulation and later burst into flame.",
    "soot": "Tiny carbon particles made by flames; they make flames glow yellow and make smoke.",
    "radiation": "Heat carried by light and infrared rays; in freefall it can be the main way a flame loses heat.",
    "cool flame": "A faint, low-temperature flame seen with some liquid fuels such as heptane droplets.",
    "droplet combustion": "Burning a single drop of liquid fuel; in freefall the flame forms a perfect sphere around the drop.",
    "diffusion flame": "A flame where fuel and oxygen meet and mix at the flame itself, like a candle.",
    "premixed flame": "A flame where fuel and oxygen are mixed before burning, like a gas stove.",
    "flame ball": "A tiny, stable, ball-shaped flame that can only exist in freefall with very lean fuel mixtures.",
    "heat release rate": "How much heat a fire gives off per second; the main measure of how dangerous a fire is.",
    "ignition delay": "The time between heating a material and it catching fire.",
    "suppression": "Putting out a fire, for example with carbon dioxide, water mist or by cutting off ventilation.",
    "extinguisher": "A device that puts out fire; the ISS carries carbon-dioxide and water-mist extinguishers.",
    "depressurization": "Letting a module's air out to space so a fire has no oxygen left to burn.",
    "exploration atmosphere": "The 8.2 psia, 34% oxygen cabin air NASA considers for Moon and Mars missions, which eases spacewalk prep but raises fire risk.",
    "psia": "Pounds per square inch absolute, a unit of pressure; sea-level air is 14.7 psia (101.3 kPa).",
    "kpa": "Kilopascal, a unit of pressure; sea-level air is about 101 kPa.",
    "oxygen concentration": "The share of the air that is oxygen; about 21% on Earth. Higher levels make fires much easier to start and harder to stop.",
    "saffire": "Spacecraft Fire Safety Experiment: large fire tests flown inside Cygnus cargo ships after they leave the ISS.",
    "nasa-std-6001": "NASA's standard set of flammability tests every material must pass before it can fly on a spacecraft.",
    "upward flame spread": "The main NASA-STD-6001 test (Test 1): a sample is lit at the bottom and must self-extinguish within a short length.",
    "combustion products": "The gases and particles a fire makes, such as carbon monoxide, hydrogen cyanide and acid gases.",
    "carbon monoxide": "A colourless, poisonous gas made when things burn without enough oxygen.",
    "iss": "The International Space Station, a laboratory orbiting about 400 km above Earth.",
    "cir": "The Combustion Integrated Rack on the ISS, which hosts flame experiments like FLEX and ACME.",
    "g-jitter": "Small vibrations and accelerations that keep a spacecraft or aircraft from being perfectly weightless.",
    "countermeasure": "Anything used to prevent, detect or fight a fire, such as material selection, smoke detectors or extinguishers.",
    "ntrs": "The NASA Technical Reports Server, the public library of NASA research reports this tool is built from.",
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

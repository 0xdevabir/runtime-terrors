"""Fast unit tests for the pure pipeline / answering helpers (no KB or network needed)."""
from app.answer import compare_sides, confidence, contextualize, sentence_support, swap_entities
from app.export import bibtex, ris
from app.glossary import terms_in
from pipeline import extract_rules as R
from pipeline import ontology as O
from pipeline import risks as K
from pipeline.process import _clean_body, parse_text


def test_clean_body_strips_citations_and_figure_refs():
    s = _clean_body("Flame spread was 40% slower [3, 5–7] in microgravity (Olson et al., 2019; Lee and Park, 2020) (Fig. 2A).")
    assert s == "Flame spread was 40% slower in microgravity."
    assert "(n = 6)" in _clean_body("The value (n = 6) stays.")


def test_parse_text_sections_and_references_stop():
    raw = ("ABSTRACT\n\nFlames spread slowly over thin cellulose in quiescent microgravity conditions.\n\n"
           "1. INTRODUCTION\n\nSpacecraft fire safety depends on how materials burn without buoyant flow.\n\n"
           "3. RESULTS AND DISCUSSION\n\nThe spread rate decreased with decreasing opposed-flow velocity in all tests.\n\n"
           "REFERENCES\n\n" + "1. Olson, S. L. Combustion Science and Technology, 1991, pages 1-20 of the journal. " * 40)
    secs = parse_text(raw)
    assert [s["type"] for s in secs] == ["ABSTRACT", "INTRO", "RESULTS"]
    assert all("Olson" not in s["text"] for s in secs)


def test_study_design_fields():
    assert R.n_tests("We conducted 24 drop tests and 3 parabolas.", "") == 24
    assert R.missions("Samples burned on STS-75 during USML-2 and later on NG-14 (Cygnus)") == ["STS-75", "USML-2", "NG-14", "Cygnus"]
    assert R.experiments("The Saffire-II and BASS-II experiments, and ACME in the CIR.") == ["Saffire-II", "BASS-II", "ACME"]
    assert R.experiments("THE SAME RESULT WAS SEEN IN THE MIST") == []
    assert R.atmosphere("tests at 34% O2 and 56.5 kPa; again at 34% oxygen") == "34% O₂ · 56.5 kPa"
    d = R.duration("", ["platform:drop_tower"])
    assert d["seconds"] == 5 and d["inferred"]


def test_ontology_ids_and_find():
    assert O.BY_ID["fuel:pmma"].group == "Solid"
    assert O.BY_ID["fuel:cotton_fiberglass"].group == "Spacecraft material"
    assert [e.id for e, _ in O.find("condition", "flames in microgravity at 34% O2")][:1] == ["condition:microgravity"]


def test_mission_atmosphere_and_exposure():
    art = K.MISSION_PRESETS["artemis"]
    a = K.atmosphere(art)
    assert a["pressure_psia"] == 8.2 and a["ppo2_kpa"] == 19.2
    ex = K.exposure(art)
    assert ex["condition:elevated_o2"] == 1.0 and ex["condition:reduced_pressure"] == 1.0
    assert K.exposure(K.MISSION_PRESETS["iss"])["condition:elevated_o2"] == 0.0


def test_follow_up_and_comparison_rewriting():
    assert swap_entities("flame spread over PMMA", "cotton") == "flame spread over cotton"
    assert contextualize("what about heptane?", [{"q": "How fast do ethanol droplets burn in microgravity?"}]) == \
        "How fast do heptane droplets burn in microgravity?"
    assert contextualize("How does oxygen affect soot?", [{"q": "flame spread over PMMA"}]) == "How does oxygen affect soot?"
    assert compare_sides("Compare flame spread over PMMA and cotton") == ("flame spread over PMMA", "flame spread over cotton")
    assert compare_sides("How does microgravity affect flame spread?") is None


def test_sentence_support_and_confidence():
    passages = [{"text": "Microgravity reduced the opposed-flow flame spread rate over thin cellulose by 40 percent.",
                 "study_type": "flight", "paper_id": "A"}]
    sup = sentence_support("Microgravity reduced the flame spread rate over thin cellulose [1]. Unrelated claim about rocket nozzles erosion [1].", passages)
    assert sup[0]["score"] > 0.8 and sup[1]["score"] < 0.4
    assert confidence(sup, passages, refused=False)["label"] in ("low", "medium", "high")
    assert confidence([], passages, refused=True)["score"] == 0


def test_exports_and_glossary():
    p = {"id": "20170001234", "title": "Flame & smoke in space", "authors": ["Olson, Sandra L."], "year": 2020, "center": "GRC",
         "doi": "10/x", "url": "https://ntrs.nasa.gov/citations/20170001234", "abstract": "A."}
    b = bibtex([p])
    assert b.startswith("@techreport{Olson2020flame") and r"\&" in b and "NTRS ID: 20170001234" in b
    assert "TY  - RPRT" in ris([p]) and "ER  - " in ris([p])
    assert [t["term"] for t in terms_in("Microgravity changes flame spread.")] == ["microgravity", "flame spread"]

"""Fast unit tests for the pure pipeline / answering helpers (no KB or network needed)."""
from app.answer import compare_sides, confidence, contextualize, sentence_support, swap_entities
from app.export import bibtex, ris
from app.glossary import terms_in
from pipeline import extract_rules as R
from pipeline import ontology as O
from pipeline.process import _clean_body


def test_clean_body_strips_citations_and_figure_refs():
    s = _clean_body("Bone loss was 12% [3, 5–7] in mice (Smith et al., 2019; Lee and Park, 2020) (Fig. 2A).")
    assert s == "Bone loss was 12% in mice."
    assert "(n = 6)" in _clean_body("The value (n = 6) stays.")


def test_study_design_fields():
    assert R.sample_size("Mice (n = 10) and controls (n = 12).", "") == 12
    assert R.sample_size("", "We studied 20 male C57BL/6J mice.") == 20
    assert R.missions("Samples from STS-135 and Rodent Research-1 and Bion-M 1") == ["STS-135", "RR-1", "BION-M1"]
    assert R.dose("mice received 0.5 Gy of 56Fe; a second group 0.5 Gy") == "0.5 Gy"


def test_ontology_ids_and_find():
    assert O.BY_ID["organism:mouse"].ontology == "NCBITaxon:10090"
    assert O.BY_ID["gene:tp53"].ontology == "HGNC:11998"
    assert [e.id for e, _ in O.find("stressor", "hindlimb unloading for 14 days")] == ["stressor:simulated_microgravity"]


def test_follow_up_and_comparison_rewriting():
    assert swap_entities("bone loss in mice", "humans") == "bone loss in humans"
    assert contextualize("what about in rats?", [{"q": "How does spaceflight affect bone density in mice?"}]) == \
        "How does spaceflight affect bone density in rats?"
    assert contextualize("How does radiation affect the heart?", [{"q": "bone loss in mice"}]) == "How does radiation affect the heart?"
    assert compare_sides("Compare bone loss in mice and humans") == ("bone loss in mice", "bone loss in humans")
    assert compare_sides("How does spaceflight affect bone?") is None


def test_sentence_support_and_confidence():
    passages = [{"text": "Spaceflight reduced femoral bone volume in mice by 20 percent.", "study_type": "flight", "paper_id": "A"}]
    sup = sentence_support("Spaceflight reduced femoral bone volume in mice [1]. Unrelated claim about zebrafish hearts [1].", passages)
    assert sup[0]["score"] > 0.8 and sup[1]["score"] < 0.4
    assert confidence(sup, passages, refused=False)["label"] in ("low", "medium", "high")
    assert confidence([], passages, refused=True)["score"] == 0


def test_exports_and_glossary():
    p = {"id": "PMC1", "title": "Bone & muscle in space", "authors": ["Ada Lovelace"], "year": 2020, "journal": "J", "doi": "10/x",
         "url": "https://example.org", "abstract": "A."}
    assert bibtex([p]).startswith("@article{Lovelace2020bone") and r"\&" in bibtex([p])
    assert "TY  - JOUR" in ris([p]) and "ER  - " in ris([p])
    assert [t["term"] for t in terms_in("Microgravity causes osteopenia.")] == ["microgravity", "osteopenia"]

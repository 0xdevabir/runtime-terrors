"""Flammability explorer: envelope guard + oxygen boundary."""
from __future__ import annotations

from app.predict import predict, reload


def setup_module():
    reload()


def test_low_oxygen_less_spread_than_cabin():
    cabin = predict(21.0, 101.3, 5.0, "fuel:pmma")
    low = predict(17.0, 101.3, 5.0, "fuel:pmma")
    assert cabin["in_training_range"] and low["in_training_range"]
    assert cabin["probabilities"] and low["probabilities"]
    assert low["probabilities"]["spread"] < cabin["probabilities"]["spread"]
    assert low["prediction"] == "no_spread"
    assert cabin["prediction"] == "spread"


def test_artemis_atmosphere_predicts_spread():
    r = predict(34.0, 56.5, 5.0, "fuel:fabric")
    assert r["in_training_range"]
    assert r["prediction"] == "spread"
    assert r["nearest_experiments"]


def test_out_of_envelope_refuses():
    r = predict(5.0, 101.3, 5.0, "fuel:pmma")  # below published O₂ minimum
    assert r["in_training_range"] is False
    assert r["prediction"] is None
    assert r["out_of_range_reasons"]


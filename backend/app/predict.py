"""Serve flammability-regime predictions with an envelope guard and nearest experiments."""
from __future__ import annotations

import json
from functools import lru_cache

import numpy as np

from pipeline.paths import KB_DIR
from pipeline.predict_model import CLASSES, KnnSoftmax


def _vec(oxygen: float, pressure: float, flow: float, material: str, materials: list[str]) -> np.ndarray:
    onehot = [0.0] * len(materials)
    try:
        onehot[materials.index(material if material in materials else "other")] = 1.0
    except ValueError:
        onehot[-1] = 1.0
    return np.asarray([oxygen, pressure, flow, *onehot], dtype=np.float64)


@lru_cache(maxsize=1)
def _load() -> dict:
    meta_path = KB_DIR / "predict_meta.json"
    exp_path = KB_DIR / "experiments.json"
    if not meta_path.exists() or not exp_path.exists():
        raise FileNotFoundError("run `uv run python -m pipeline.predict_model` first")
    meta = json.loads(meta_path.read_text())
    rows = json.loads(exp_path.read_text())
    materials = meta["model"]["materials"]
    joblib_path = KB_DIR / "predict_model.joblib"
    npz_path = KB_DIR / "predict_model.npz"
    clf = None
    knn = None
    if joblib_path.exists():
        import joblib
        bundle = joblib.load(joblib_path)
        clf = bundle["clf"]
        materials = bundle.get("materials", materials)
    elif npz_path.exists():
        data = np.load(npz_path)
        knn = KnnSoftmax(k=int(data["k"][0]))
        knn.X = data["X"]
        knn.y = data["y"]
        knn.scale = data["scale"]
    else:
        # rebuild knn from rows on the fly
        from pipeline.predict_model import _encode, _train_knn
        X, y, materials = _encode(rows, materials)
        knn, _, _ = _train_knn(X, y)
    return {"meta": meta, "rows": rows, "materials": materials, "clf": clf, "knn": knn}


def meta() -> dict:
    return _load()["meta"]


def materials() -> list[dict]:
    m = _load()["meta"]
    labels = m["material_labels"]
    return [{"id": mid, "label": labels.get(mid, mid)} for mid in m["model"]["materials"]]


def _in_range(inputs: dict, ranges: dict) -> tuple[bool, list[str]]:
    reasons = []
    for key, label in (("oxygen_pct", "oxygen"), ("pressure_kpa", "pressure"), ("flow_cm_s", "flow")):
        lo, hi = ranges[key]["min"], ranges[key]["max"]
        v = inputs[key]
        if v < lo or v > hi:
            reasons.append(f"{label} {v:g} is outside the published envelope [{lo:g}, {hi:g}]")
    return (not reasons), reasons


def _predict_proba(bundle: dict, x: np.ndarray) -> np.ndarray:
    if bundle["clf"] is not None:
        return bundle["clf"].predict_proba(x.reshape(1, -1))[0]
    assert bundle["knn"] is not None
    return bundle["knn"].predict_proba(x.reshape(1, -1))[0]


def _nearest(rows: list[dict], inputs: dict, k: int = 3) -> list[dict]:
    # Prefer same material; fall back to all
    same = [r for r in rows if r["material"] == inputs["material"]] or rows
    def dist(r: dict) -> float:
        return (
            ((r["oxygen_pct"] - inputs["oxygen_pct"]) / 10.0) ** 2
            + ((r["pressure_kpa"] - inputs["pressure_kpa"]) / 50.0) ** 2
            + ((r["flow_cm_s"] - inputs["flow_cm_s"]) / 5.0) ** 2
            + (0.0 if r["material"] == inputs["material"] else 0.5)
        )
    ranked = sorted(same, key=dist)
    out = []
    seen = set()
    for r in ranked:
        if r["report_id"] in seen:
            continue
        seen.add(r["report_id"])
        out.append({
            "report_id": r["report_id"],
            "title": r["title"],
            "year": r["year"],
            "oxygen_pct": r["oxygen_pct"],
            "pressure_kpa": r["pressure_kpa"],
            "flow_cm_s": r["flow_cm_s"],
            "material": r["material"],
            "outcome": r["regime"],
            "direction": r["direction"],
            "study_type": r["study_type"],
            "quote": r["quote"],
            "source_url": r["source_url"],
            "o2_source": r["o2_source"],
        })
        if len(out) >= k:
            break
    return out


def _explain(pred: dict) -> str:
    if not pred["in_training_range"]:
        reasons = "; ".join(pred["out_of_range_reasons"])
        return (
            f"No prediction. Requested conditions fall outside the published experimental envelope "
            f"({reasons}). Emberfall refuses to extrapolate for fire-safety use."
        )
    label = pred["prediction"]
    probs = pred["probabilities"]
    nearest = pred["nearest_experiments"]
    cite = ", ".join(f"NTRS {n['report_id']}" for n in nearest[:3]) or "no nearby reports"
    return (
        f"Under {pred['inputs']['oxygen_pct']:g}% O₂, {pred['inputs']['pressure_kpa']:g} kPa and "
        f"{pred['inputs']['flow_cm_s']:g} cm/s for {pred['inputs']['material']}, the model predicts "
        f"{label.replace('_', ' ')} "
        f"(P={probs[label]:.0%}; no-spread {probs['no_spread']:.0%}, marginal {probs['marginal_spread']:.0%}, "
        f"spread {probs['spread']:.0%}). Nearest published experiments: {cite}."
    )


def predict(oxygen_pct: float, pressure_kpa: float, flow_cm_s: float, material: str) -> dict:
    bundle = _load()
    meta = bundle["meta"]
    materials = bundle["materials"]
    if material not in materials:
        material = "other"
    inputs = {
        "oxygen_pct": float(oxygen_pct),
        "pressure_kpa": float(pressure_kpa),
        "flow_cm_s": float(flow_cm_s),
        "material": material,
    }
    ok, reasons = _in_range(inputs, meta["ranges"])
    nearest = _nearest(bundle["rows"], inputs, k=3)
    model_info = {
        "type": meta["model"]["type"],
        "n_train": meta["model"]["n_train"],
        "cv_accuracy": meta["model"]["cv_accuracy"],
        "features": meta["model"]["features"],
    }
    base = {
        "inputs": inputs,
        "in_training_range": ok,
        "out_of_range_reasons": reasons,
        "model": model_info,
        "nearest_experiments": nearest,
        "probabilities": None,
        "prediction": None,
        "explanation": "",
    }
    if not ok:
        base["explanation"] = _explain(base)
        return base

    x = _vec(inputs["oxygen_pct"], inputs["pressure_kpa"], inputs["flow_cm_s"], material, materials)
    proba = _predict_proba(bundle, x)
    probs = {CLASSES[i]: round(float(proba[i]), 4) for i in range(len(CLASSES))}
    pred_cls = CLASSES[int(np.argmax(proba))]
    base["probabilities"] = probs
    base["prediction"] = pred_cls
    base["explanation"] = _explain(base)
    return base


def oxygen_sweep(
    pressure_kpa: float, flow_cm_s: float, material: str,
    o2_min: float = 15.0, o2_max: float = 40.0, steps: int = 26,
) -> dict:
    """O₂ sweep for the decision-boundary chart (killer demo: 21% → 17%)."""
    xs = np.linspace(o2_min, o2_max, steps)
    points = []
    for o2 in xs:
        p = predict(float(o2), pressure_kpa, flow_cm_s, material)
        points.append({
            "oxygen_pct": round(float(o2), 3),
            "in_training_range": p["in_training_range"],
            "prediction": p["prediction"],
            "probabilities": p["probabilities"],
        })
    return {
        "pressure_kpa": pressure_kpa,
        "flow_cm_s": flow_cm_s,
        "material": material,
        "points": points,
    }


def reload() -> None:
    _load.cache_clear()

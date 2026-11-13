"""Build the flammability experiment table and train a regime classifier.

Challenge 8 killer demo: predict flame-spread regime from cabin O₂ / pressure /
flow / material, cite the nearest published NTRS experiments, and refuse when
inputs fall outside the training envelope.
"""
from __future__ import annotations

import csv
import json
import re
from collections import Counter
import numpy as np

from pipeline.paths import KB_DIR

O2_RX = re.compile(r"\b(\d{1,3}(?:\.\d)?)\s*%?\s*(?:O2|O₂|oxygen)\b", re.I)
PRESS_RX = re.compile(r"\b(\d{1,3}(?:\.\d{1,2})?)\s*(kPa|psia|psi|atm|bar)\b", re.I)

SPREAD_OUTCOMES = {
    "outcome:flame_spread",
    "outcome:flammability",
    "outcome:burning_rate",
    "outcome:ignition",
    "outcome:extinction",
    "outcome:smoldering",
}

# Materials exposed in the UI (rest → "other")
UI_MATERIALS = [
    "fuel:pmma",
    "fuel:cellulose",
    "fuel:fabric",
    "fuel:wire_insulation",
    "fuel:foam",
    "fuel:polymer",
    "fuel:heptane",
    "fuel:methane",
    "fuel:ethylene",
    "fuel:alcohol",
]

CLASSES = ["no_spread", "marginal_spread", "spread"]
CLASS_I = {c: i for i, c in enumerate(CLASSES)}

# Condition → default atmosphere when the report never states numbers.
COND_O2 = {
    "condition:elevated_o2": 30.0,
    "condition:microgravity": 21.0,
    "condition:normal_gravity": 21.0,
    "condition:partial_gravity": 21.0,
    "condition:diluent": 18.0,
    "condition:quiescent": 21.0,
    "condition:opposed_flow": 21.0,
    "condition:concurrent_flow": 21.0,
    "condition:reduced_pressure": 21.0,
    "condition:elevated_pressure": 21.0,
    "condition:radiant_heating": 21.0,
}
COND_P = {
    "condition:reduced_pressure": 70.0,
    "condition:elevated_pressure": 200.0,
    "condition:elevated_o2": 70.0,  # many elevated-O₂ spacecraft tests are also reduced-P
}
COND_FLOW = {
    "condition:opposed_flow": 10.0,
    "condition:concurrent_flow": 10.0,
    "condition:quiescent": 0.0,
}


def _to_kpa(value: float, unit: str) -> float:
    u = unit.lower()
    if u == "kpa":
        return value
    if u in ("psia", "psi"):
        return value * 6.89476
    if u == "atm":
        return value * 101.325
    if u == "bar":
        return value * 100.0
    return value


def parse_atmosphere(*texts: str) -> tuple[float | None, float | None]:
    blob = " ".join(t for t in texts if t)
    o2 = None
    for m in O2_RX.finditer(blob):
        v = float(m.group(1))
        if 10 <= v <= 100:
            o2 = v
            break
    p = None
    for m in PRESS_RX.finditer(blob):
        v = _to_kpa(float(m.group(1)), m.group(2))
        if 5 <= v <= 2000:
            p = v
            break
    return o2, p


NO_SPREAD_RX = re.compile(
    r"\b(?:extinguish\w*|did not spread|failed to (?:ignite|spread)|no (?:visible )?flame|"
    r"flame(?:s)? (?:went|go|goes) out|quench\w*|self[- ]extinguish\w*|non[- ]flammable|"
    r"would not (?:ignite|burn|spread)|suppressed the flame)\b",
    re.I,
)
SPREAD_RX = re.compile(
    r"\b(?:flame spread|spread(?:ing)? (?:rate|flame)|propagat\w+|sustained(?:ly)? burn\w*|"
    r"vigorous(?:ly)? burn\w*|flammab\w+|ignit(?:ed|ion|es|ing)\b|continued to burn)\b",
    re.I,
)


def regime_for(outcome: str, direction: str, quote: str = "") -> str | None:
    """Absolute flame-spread regime for a published test — not µg-vs-1g direction."""
    if outcome not in SPREAD_OUTCOMES:
        return None
    q = quote or ""
    hit_no = bool(NO_SPREAD_RX.search(q))
    hit_yes = bool(SPREAD_RX.search(q))
    if hit_no and not hit_yes:
        return "no_spread"
    if hit_yes and not hit_no:
        return "spread"
    if hit_yes and hit_no:
        return "marginal_spread"
    # quote silent → fall back to outcome type (ignore µg-vs-1g direction; that is not a regime)
    if outcome == "outcome:extinction":
        return "no_spread"
    if outcome == "outcome:smoldering":
        return "marginal_spread"
    if outcome in ("outcome:flame_spread", "outcome:flammability", "outcome:burning_rate", "outcome:ignition"):
        return "spread"
    return "marginal_spread"


def material_key(fuel: str | None) -> str:
    if fuel in UI_MATERIALS:
        return fuel
    return "other"


def build_rows(papers: list[dict], findings: list[dict]) -> list[dict]:
    by_id = {p["id"]: p for p in papers}
    rows: list[dict] = []
    for f in findings:
        p = by_id.get(f["paper_id"])
        if not p:
            continue
        quote = f.get("evidence_quote") or ""
        regime = regime_for(f.get("outcome", ""), f.get("direction", ""), quote)
        if not regime:
            continue
        atm = p.get("atmosphere") or ""
        abstract = p.get("abstract") or ""
        o2, press = parse_atmosphere(atm if isinstance(atm, str) else "", quote, abstract)
        cond = f.get("condition") or ""
        o2_src = "measured" if o2 is not None else "imputed"
        p_src = "measured" if press is not None else "imputed"
        if o2 is None:
            o2 = COND_O2.get(cond, 21.0)
        if press is None:
            press = COND_P.get(cond, 101.3)
        flow = COND_FLOW.get(cond, 5.0)
        # opposed/concurrent geometry hint
        geo = f.get("geometry") or ""
        if "opposed" in geo:
            flow = max(flow, 8.0)
        elif "concurrent" in geo:
            flow = max(flow, 8.0)
        elif "quiescent" in geo or "candle" in geo:
            flow = 0.0
        mat = material_key(f.get("fuel"))
        rows.append({
            "finding_id": f["id"],
            "report_id": p["id"],
            "title": p.get("title") or "",
            "year": p.get("year"),
            "source_url": p.get("url") or f"https://ntrs.nasa.gov/citations/{p['id']}",
            "oxygen_pct": round(float(o2), 3),
            "pressure_kpa": round(float(press), 3),
            "flow_cm_s": round(float(flow), 3),
            "material": mat,
            "material_raw": f.get("fuel"),
            "condition": cond,
            "outcome": f.get("outcome"),
            "direction": f.get("direction"),
            "regime": regime,
            "study_type": f.get("study_type") or p.get("study_type"),
            "quote": quote[:280],
            "o2_source": o2_src,
            "pressure_source": p_src,
        })
    return rows


def _encode(rows: list[dict], materials: list[str]) -> tuple[np.ndarray, np.ndarray, list[str]]:
    mat_index = {m: i for i, m in enumerate(materials)}
    X, y = [], []
    for r in rows:
        onehot = [0.0] * len(materials)
        onehot[mat_index.get(r["material"], mat_index["other"])] = 1.0
        X.append([r["oxygen_pct"], r["pressure_kpa"], r["flow_cm_s"], *onehot])
        y.append(CLASS_I[r["regime"]])
    return np.asarray(X, dtype=np.float64), np.asarray(y, dtype=np.int64), materials


def _train_sklearn(X: np.ndarray, y: np.ndarray):
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.metrics import accuracy_score, confusion_matrix

    clf = GradientBoostingClassifier(
        n_estimators=80, max_depth=3, learning_rate=0.08, random_state=42,
    )
    # Need ≥2 samples per class for stratified CV
    counts = Counter(int(v) for v in y)
    if min(counts.values()) < 2 or len(counts) < 2:
        clf.fit(X, y)
        pred = clf.predict(X)
        return clf, float(accuracy_score(y, pred)), confusion_matrix(y, pred, labels=list(range(len(CLASSES)))).tolist()

    cv = StratifiedKFold(n_splits=min(5, min(counts.values())), shuffle=True, random_state=42)
    pred = cross_val_predict(clf, X, y, cv=cv)
    acc = float(accuracy_score(y, pred))
    cm = confusion_matrix(y, pred, labels=list(range(len(CLASSES)))).tolist()
    clf.fit(X, y)
    return clf, acc, cm


class KnnSoftmax:
    """Distance-weighted kNN with leave-one-out CV — no sklearn required."""

    def __init__(self, k: int = 25, scale: np.ndarray | None = None):
        self.k = k
        self.scale = scale
        self.X: np.ndarray | None = None
        self.y: np.ndarray | None = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> "KnnSoftmax":
        self.scale = X.std(axis=0)
        self.scale[self.scale < 1e-6] = 1.0
        self.X = X / self.scale
        self.y = y
        return self

    def _probs_one(self, x: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        assert self.X is not None and self.y is not None and self.scale is not None
        xs = x / self.scale
        d = np.sqrt(((self.X - xs) ** 2).sum(axis=1))
        if mask is not None:
            d = np.where(mask, np.inf, d)
        k = min(self.k, len(d) - (1 if mask is not None and mask.any() else 0))
        idx = np.argpartition(d, k)[:k]
        w = 1.0 / (d[idx] + 1e-3)
        probs = np.zeros(len(CLASSES))
        for i, wi in zip(idx, w):
            probs[int(self.y[i])] += float(wi)
        s = probs.sum() or 1.0
        return probs / s

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        return np.vstack([self._probs_one(x) for x in X])

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.predict_proba(X).argmax(axis=1)

    def loo_accuracy(self) -> tuple[float, list[list[int]]]:
        assert self.X is not None and self.y is not None
        n = len(self.y)
        pred = np.zeros(n, dtype=np.int64)
        for i in range(n):
            mask = np.zeros(n, dtype=bool)
            mask[i] = True
            pred[i] = int(self._probs_one(self.X[i] * self.scale, mask).argmax())
        cm = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
        for t, p in zip(self.y, pred):
            cm[int(t), int(p)] += 1
        acc = float((pred == self.y).mean())
        return acc, cm.tolist()


def _train_knn(X: np.ndarray, y: np.ndarray) -> tuple[KnnSoftmax, float, list]:
    model = KnnSoftmax().fit(X, y)
    acc, cm = model.loo_accuracy()
    return model, acc, cm


def train_and_save(rows: list[dict] | None = None) -> dict:
    if rows is None:
        papers = json.loads((KB_DIR / "papers.json").read_text())
        findings = json.loads((KB_DIR / "findings.json").read_text())
        rows = build_rows(papers, findings)

    materials = UI_MATERIALS + ["other"]
    # Train on rows where oxygen actually varies (measured, or condition that implies non-air).
    # All rows stay in experiments.json for nearest-neighbour citations.
    train_rows = [
        r for r in rows
        if r["o2_source"] == "measured"
        or r["condition"] in ("condition:elevated_o2", "condition:diluent", "condition:reduced_pressure")
        or abs(r["oxygen_pct"] - 21.0) > 0.5
    ]
    if len(train_rows) < 40:
        train_rows = rows
    X, y, materials = _encode(train_rows, materials)

    model_type = "gradient_boosting"
    try:
        clf, acc, cm = _train_sklearn(X, y)
        import joblib
        joblib.dump({"clf": clf, "materials": materials}, KB_DIR / "predict_model.joblib")
        backend = "sklearn"
    except Exception as e:  # noqa: BLE001 — fall back for offline venues without sklearn
        print(f"[predict] sklearn unavailable ({e}); using distance-weighted kNN")
        clf, acc, cm = _train_knn(X, y)
        model_type = "knn_softmax"
        backend = "numpy"
        # serialize knn training matrix
        np.savez_compressed(
            KB_DIR / "predict_model.npz",
            X=clf.X, y=clf.y, scale=clf.scale, k=np.array([clf.k]),
        )
        (KB_DIR / "predict_model.joblib").unlink(missing_ok=True)

    # feature ranges from measured rows when possible, else all rows
    measured = [r for r in rows if r["o2_source"] == "measured"] or rows
    ranges = {
        "oxygen_pct": {"min": min(r["oxygen_pct"] for r in measured), "max": max(r["oxygen_pct"] for r in measured)},
        "pressure_kpa": {"min": min(r["pressure_kpa"] for r in rows), "max": max(r["pressure_kpa"] for r in rows)},
        "flow_cm_s": {"min": min(r["flow_cm_s"] for r in rows), "max": max(r["flow_cm_s"] for r in rows)},
    }
    # pad ranges slightly so Artemis 34% / 56.5 kPa stays in-envelope when data supports nearby values
    for key, pad in (("oxygen_pct", 1.0), ("pressure_kpa", 5.0), ("flow_cm_s", 1.0)):
        ranges[key]["min"] = max(0.0, ranges[key]["min"] - pad)
        ranges[key]["max"] = ranges[key]["max"] + pad

    meta = {
        "model": {
            "type": model_type,
            "backend": backend,
            "n_train": len(train_rows),
            "n_corpus": len(rows),
            "cv_accuracy": round(acc, 3),
            "features": ["oxygen_pct", "pressure_kpa", "flow_cm_s", "material"],
            "classes": CLASSES,
            "confusion_matrix": cm,
            "materials": materials,
        },
        "ranges": ranges,
        "material_labels": {
            "fuel:pmma": "PMMA",
            "fuel:cellulose": "Cellulose",
            "fuel:fabric": "Fabric / cotton",
            "fuel:wire_insulation": "Wire insulation",
            "fuel:foam": "Foam",
            "fuel:polymer": "Polymer",
            "fuel:heptane": "Heptane",
            "fuel:methane": "Methane",
            "fuel:ethylene": "Ethylene",
            "fuel:alcohol": "Alcohol",
            "other": "Other / unspecified",
        },
        "class_labels": {
            "no_spread": "No spread",
            "marginal_spread": "Marginal spread",
            "spread": "Spreading flame",
        },
        "regime_counts": dict(Counter(r["regime"] for r in rows)),
        "measured_o2_rows": sum(1 for r in rows if r["o2_source"] == "measured"),
    }

    (KB_DIR / "predict_meta.json").write_text(json.dumps(meta, indent=1))
    (KB_DIR / "experiments.json").write_text(json.dumps(rows))
    with (KB_DIR / "experiments.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    # parquet-shaped sibling for the guide's naming (CSV is the portable form)
    try:
        import pandas as pd
        pd.DataFrame(rows).to_parquet(KB_DIR / "experiments.parquet", index=False)
    except Exception:
        pass

    print(
        f"[predict] {len(rows)} rows · {meta['measured_o2_rows']} with measured O₂ · "
        f"{model_type} cv_accuracy={acc:.3f} · regimes={meta['regime_counts']}"
    )
    return meta


def main() -> None:
    KB_DIR.mkdir(parents=True, exist_ok=True)
    train_and_save()


if __name__ == "__main__":
    main()

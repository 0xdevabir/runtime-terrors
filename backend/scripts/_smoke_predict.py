from app.main import app
from app.predict import reload
import json
from pathlib import Path

reload()
routes = [r.path for r in app.routes if hasattr(r, "path") and "predict" in r.path]
print("routes", routes)
meta = json.loads(Path("../data/kb/predict_meta.json").read_text())
print("cv", meta["model"]["cv_accuracy"], "n", meta["model"]["n_train"], meta["regime_counts"])

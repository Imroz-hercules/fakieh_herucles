"""Serve the trained Predictive Dosing Quality model.

Loads model.joblib once and answers:
  * model_info()  — metrics, feature importances, and form options for the UI
  * predict(...)  — risk of one planned dose being out-of-tolerance
  * top_risks(n)  — the highest-risk material/product doses in the history
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache

import joblib
import pandas as pd

from .. import data
from . import features
from .train import META_PATH, MODEL_PATH

# Human-friendly names for the engineered features (for the importance chart).
FEATURE_LABELS = {
    "setpoint": "Target weight (kg)",
    "log_setpoint": "Target weight (log)",
    "material_code": "Material / ingredient",
    "product_name": "Product recipe",
    "quantity": "Batch size (kg)",
    "is_micro": "Micro-ingredient (<10kg)",
    "category": "Ingredient category",
}

logger = logging.getLogger(__name__)


def is_ready() -> bool:
    """True only if the model can actually be LOADED — not merely that the file exists.

    A bare os.path.exists() check reported the model as ready even when joblib
    could not unpickle it (e.g. artifacts trained on a different scikit-learn
    version), so /api/ai/health advertised the model as healthy while every
    predict call returned 500. Attempting the load is the only honest check.
    _model()/_meta() are lru_cached, so this costs nothing after the first call.
    """
    if not (os.path.exists(MODEL_PATH) and os.path.exists(META_PATH)):
        return False
    try:
        _model()
        _meta()
        return True
    except Exception as exc:  # unpickling / version-mismatch / corrupt file
        logger.warning("Dosing-quality model present but not loadable: %s", exc)
        return False


@lru_cache(maxsize=1)
def _model():
    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def _meta() -> dict:
    with open(META_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def _band(risk: float) -> str:
    if risk >= 0.66:
        return "High"
    if risk >= 0.33:
        return "Medium"
    return "Low"


def model_info() -> dict:
    meta = dict(_meta())
    meta["ready"] = True
    meta["feature_importances"] = [
        {**fi, "label": FEATURE_LABELS.get(fi["feature"], fi["feature"])}
        for fi in meta.get("feature_importances", [])
    ]
    return meta


def predict(material_code: str, product_name: str, setpoint: float,
            quantity: float | None = None, category: str | None = None) -> dict:
    meta = _meta()
    material_code = str(material_code)

    # Auto-fill category / batch size from what's typical if not supplied.
    mat_def = meta.get("material_defaults", {}).get(material_code, {})
    prod_def = meta.get("product_defaults", {}).get(str(product_name), {})
    if category in (None, ""):
        category = mat_def.get("category", "")
    if quantity in (None, "", 0):
        quantity = prod_def.get("typical_quantity", 0.0)

    feat = features.row_to_features(
        {
            "setpoint": setpoint,
            "quantity": quantity,
            "material_code": material_code,
            "product_name": product_name,
            "category": category,
        }
    )
    frame = pd.DataFrame([feat])[features.FEATURE_ORDER]
    risk = float(_model().predict_proba(frame)[:, 1][0])

    # Resolve a display name for the material.
    material_name = next(
        (m["material_name"] for m in meta["options"]["materials"] if str(m["material_code"]) == material_code),
        material_code,
    )
    return {
        "risk": round(risk, 3),
        "risk_pct": round(risk * 100, 1),
        "band": _band(risk),
        "prediction": "Likely out-of-tolerance" if risk >= 0.5 else "Likely on-target",
        "inputs": {
            "material_code": material_code,
            "material_name": material_name,
            "product_name": product_name,
            "setpoint": setpoint,
            "quantity": quantity,
            "category": category,
        },
    }


def predict_batch(rows: list[dict]) -> list[dict | None]:
    """Vectorized version of predict() for many rows at once.

    Building a fresh 1-row DataFrame and calling predict_proba() per row (as
    predict() does) is fine for a single interactive prediction, but far too
    slow for a table of hundreds of rows -- one DataFrame + one predict_proba
    call for the whole batch is orders of magnitude faster. Each input dict
    needs material_code/product_name/setpoint (quantity/category optional).
    Returns one result per input row, in the same order; None for rows
    missing required fields.
    """
    if not rows:
        return []
    meta = _meta()
    valid_idx: list[int] = []
    feats: list[dict] = []
    for i, r in enumerate(rows):
        material_code = str(r.get("material_code") or "")
        product_name = r.get("product_name")
        setpoint = r.get("setpoint")
        if not material_code or not product_name or not setpoint:
            continue
        mat_def = meta.get("material_defaults", {}).get(material_code, {})
        prod_def = meta.get("product_defaults", {}).get(str(product_name), {})
        category = r.get("category") or mat_def.get("category", "")
        quantity = r.get("quantity") or prod_def.get("typical_quantity", 0.0)
        feats.append(
            features.row_to_features(
                {
                    "setpoint": setpoint,
                    "quantity": quantity,
                    "material_code": material_code,
                    "product_name": product_name,
                    "category": category,
                }
            )
        )
        valid_idx.append(i)

    results: list[dict | None] = [None] * len(rows)
    if not feats:
        return results

    frame = pd.DataFrame(feats)[features.FEATURE_ORDER]
    risks = _model().predict_proba(frame)[:, 1]
    for idx, risk in zip(valid_idx, risks):
        risk = float(risk)
        results[idx] = {
            "risk": round(risk, 3),
            "risk_pct": round(risk * 100, 1),
            "band": _band(risk),
        }
    return results


def top_risks(n: int = 8) -> list[dict]:
    """Rank the distinct material x product doses in the history by predicted risk."""
    rows = data.scored_rows()
    if not rows:
        return []
    frame = pd.DataFrame([features.row_to_features(r) for r in rows])[features.FEATURE_ORDER]
    risks = _model().predict_proba(frame)[:, 1]

    best: dict[tuple, dict] = {}
    for r, risk in zip(rows, risks):
        key = (r["material_name"], r["product_name"])
        if key not in best or risk > best[key]["risk"]:
            best[key] = {
                "material_name": r["material_name"],
                "product_name": r["product_name"],
                "setpoint": r["setpoint"],
                "risk": float(risk),
            }
    ranked = sorted(best.values(), key=lambda d: d["risk"], reverse=True)[:n]
    for item in ranked:
        item["risk_pct"] = round(item["risk"] * 100, 1)
        item["band"] = _band(item["risk"])
        item["risk"] = round(item["risk"], 3)
    return ranked

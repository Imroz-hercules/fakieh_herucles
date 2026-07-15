"""Serve the trained Dosing Severity Triage model.

Loads model_severity.joblib once and answers:
  * model_info()  — metrics, feature importances, form options
  * predict(...)  — predicted severity band + per-class probabilities for one planned dose
"""

from __future__ import annotations

import json
import os
from functools import lru_cache

import joblib
import pandas as pd

from . import features, severity
from .train import META_PATH as _BINARY_META_PATH  # reuse material/product defaults
from .train_severity import META_PATH, MODEL_PATH

FEATURE_LABELS = {
    "setpoint": "Target weight (kg)",
    "log_setpoint": "Target weight (log)",
    "material_code": "Material / ingredient",
    "product_name": "Product recipe",
    "quantity": "Batch size (kg)",
    "is_micro": "Micro-ingredient (<10kg)",
    "category": "Ingredient category",
}


def is_ready() -> bool:
    return os.path.exists(MODEL_PATH) and os.path.exists(META_PATH)


@lru_cache(maxsize=1)
def _model():
    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def _meta() -> dict:
    with open(META_PATH, encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def _binary_meta() -> dict:
    # material_defaults / product_defaults live in the binary model's meta;
    # reuse them here instead of duplicating that lookup table.
    with open(_BINARY_META_PATH, encoding="utf-8") as fh:
        return json.load(fh)


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
    bmeta = _binary_meta()
    material_code = str(material_code)

    mat_def = bmeta.get("material_defaults", {}).get(material_code, {})
    prod_def = bmeta.get("product_defaults", {}).get(str(product_name), {})
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
    model = _model()
    proba = model.predict_proba(frame)[0]
    classes = list(model.classes_)
    probs = {cls: round(float(p), 3) for cls, p in zip(classes, proba)}
    # Ensure every known class is present even if the model's classes_ order differs.
    probs = {cls: probs.get(cls, 0.0) for cls in severity.SEVERITY_CLASSES}

    predicted = max(probs, key=probs.get)
    material_name = next(
        (m["material_name"] for m in meta["options"]["materials"] if str(m["material_code"]) == material_code),
        material_code,
    )

    return {
        "severity": predicted,
        "severity_label": severity.SEVERITY_LABELS[predicted],
        "confidence_pct": round(probs[predicted] * 100, 1),
        "probabilities": {cls: round(p * 100, 1) for cls, p in probs.items()},
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
    """Vectorized version of predict() for many rows at once (see predictor.py's
    predict_batch for why: one DataFrame + one predict_proba call instead of
    one of each per row). Returns one result per input row, in order; None
    for rows missing required fields.
    """
    if not rows:
        return []
    meta = _meta()
    bmeta = _binary_meta()
    valid_idx: list[int] = []
    feats: list[dict] = []
    for i, r in enumerate(rows):
        material_code = str(r.get("material_code") or "")
        product_name = r.get("product_name")
        setpoint = r.get("setpoint")
        if not material_code or not product_name or not setpoint:
            continue
        mat_def = bmeta.get("material_defaults", {}).get(material_code, {})
        prod_def = bmeta.get("product_defaults", {}).get(str(product_name), {})
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
    model = _model()
    proba_matrix = model.predict_proba(frame)
    classes = list(model.classes_)

    for row_i, proba in zip(valid_idx, proba_matrix):
        probs = {cls: round(float(p), 3) for cls, p in zip(classes, proba)}
        probs = {cls: probs.get(cls, 0.0) for cls in severity.SEVERITY_CLASSES}
        predicted = max(probs, key=probs.get)
        results[row_i] = {
            "severity": predicted,
            "severity_label": severity.SEVERITY_LABELS[predicted],
            "confidence_pct": round(probs[predicted] * 100, 1),
        }
    return results

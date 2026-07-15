"""Feature engineering shared by training and prediction.

Keeping this in one place guarantees the model is trained and queried with the
exact same feature layout.
"""

from __future__ import annotations

import math

# Setpoints below this (kg) are "micro-ingredients" — premixes, vitamins,
# amino acids — where a few grams of feeder error is a large percentage.
MICRO_THRESHOLD_KG = 10.0

NUMERIC_FEATURES = ["setpoint", "quantity", "log_setpoint", "is_micro"]
CATEGORICAL_FEATURES = ["material_code", "product_name", "category"]
FEATURE_ORDER = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def row_to_features(row: dict) -> dict:
    """Turn a normalized data row (or a prediction request) into model features."""
    setpoint = float(row.get("setpoint") or 0.0)
    quantity = float(row.get("quantity") or 0.0)
    return {
        "setpoint": setpoint,
        "quantity": quantity,
        "log_setpoint": math.log1p(max(setpoint, 0.0)),
        "is_micro": 1 if 0 < setpoint < MICRO_THRESHOLD_KG else 0,
        "material_code": str(row.get("material_code") or ""),
        "product_name": str(row.get("product_name") or ""),
        "category": str(row.get("category") or ""),
    }

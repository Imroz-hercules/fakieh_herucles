"""Train the Dosing Severity Triage model.

Predicts WHICH severity band a planned dose is likely to fall into —
on_target / watch / severe — rather than the binary flagged/not-flagged
output of train.py. Same underlying data (1,000 dose rows) and features,
but a genuinely different modeling problem: multi-class classification
instead of binary, evaluated with macro precision/recall/F1 instead of a
single positive-class score.

Two modeling decisions were tested empirically, not assumed:

1. Plain multi-class RandomForestClassifier vs an ordinal approach
   (RandomForestRegressor on severity rank, rounded back to a class) —
   plain multi-class won on 5-fold CV macro-F1 (0.549 vs 0.512), so the
   ordinal idea was dropped despite severity being conceptually ordered.

2. Originally 4 classes (on_target/minor/moderate/severe), split at the
   33rd/66th percentile of |deviation_pct| among flagged doses. CV showed
   minor and moderate were not reliably separable (F1 0.29 / 0.27 —
   adjacent points on a continuous scale, not a real boundary) and both
   get the same "watch it" operational response anyway. Merging them into
   one "watch" class clearly won on every metric (macro-F1 0.640 vs 0.549,
   accuracy 0.733 vs 0.688), so the final model uses 3 classes.

Run from the Backend/ directory:

    python -m ai_assistant.ml.train_severity
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder

from .. import data
from . import features, severity

_HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_HERE, "model_severity.joblib")
META_PATH = os.path.join(_HERE, "model_severity_meta.json")

CLASSES = severity.SEVERITY_CLASSES  # ["on_target", "minor", "moderate", "severe"]


def _build_frame() -> pd.DataFrame:
    rows = data.scored_rows()
    records = []
    for r in rows:
        feat = features.row_to_features(r)
        feat["severity"] = severity.severity_band(r["deviation_pct"], data.TOLERANCE_PCT)
        records.append(feat)
    return pd.DataFrame.from_records(records)


def train() -> dict:
    df = _build_frame()
    if df.empty:
        raise RuntimeError("No scored rows available to train on.")

    X = df[features.FEATURE_ORDER]
    y = df["severity"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    pre = ColumnTransformer(
        transformers=[
            ("num", "passthrough", features.NUMERIC_FEATURES),
            (
                "cat",
                OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1),
                features.CATEGORICAL_FEATURES,
            ),
        ]
    )
    clf = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    pipe = Pipeline([("pre", pre), ("clf", clf)])

    # 5-fold stratified CV over the full dataset for a robust generalization
    # estimate (macro-averaged since this is multi-class, not binary).
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_results = cross_validate(
        pipe, X, y, cv=cv,
        scoring=["accuracy", "f1_macro", "precision_macro", "recall_macro"], n_jobs=-1,
    )
    cv_summary = {
        metric: {
            "mean": round(float(cv_results[f"test_{metric}"].mean()), 3),
            "std": round(float(cv_results[f"test_{metric}"].std()), 3),
            "folds": [round(float(s), 3) for s in cv_results[f"test_{metric}"]],
        }
        for metric in ["accuracy", "f1_macro", "precision_macro", "recall_macro"]
    }

    # Fit on the 75% split -- same model that gets saved and evaluated below.
    pipe.fit(X_train, y_train)
    preds = pipe.predict(X_test)

    acc = float((preds == y_test.values).mean())
    cm = confusion_matrix(y_test, preds, labels=CLASSES).tolist()  # rows=true, cols=predicted

    report = classification_report(y_test, preds, labels=CLASSES, target_names=CLASSES,
                                    output_dict=True, zero_division=0)
    per_class = {
        cls: {
            "precision": round(report[cls]["precision"], 3),
            "recall": round(report[cls]["recall"], 3),
            "f1_score": round(report[cls]["f1-score"], 3),
            "support": int(report[cls]["support"]),
        }
        for cls in CLASSES
    }
    macro = report["macro avg"]
    weighted = report["weighted avg"]

    importances = pipe.named_steps["clf"].feature_importances_
    importance_pairs = sorted(
        zip(features.FEATURE_ORDER, (round(float(v), 4) for v in importances)),
        key=lambda kv: kv[1],
        reverse=True,
    )

    materials = (
        pd.DataFrame([{"material_code": r["material_code"], "material_name": r["material_name"]}
                       for r in data.scored_rows()])
        .drop_duplicates().sort_values("material_name").to_dict("records")
    )
    products = sorted(df["product_name"].dropna().unique().tolist())

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_type": "RandomForestClassifier (multi-class)",
        "target": "dosing severity band: on_target / watch / severe",
        "classes": CLASSES,
        "severity_boundaries_pct": {
            "on_target": f"<= {data.TOLERANCE_PCT}",
            "watch": f"{data.TOLERANCE_PCT} - {severity.WATCH_MAX_PCT}",
            "severe": f"> {severity.WATCH_MAX_PCT}",
        },
        "n_total": int(len(df)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "class_balance": {cls: int((y == cls).sum()) for cls in CLASSES},
        "model_selection_note": (
            "Two choices were tested via 5-fold CV rather than assumed: (1) plain "
            "multi-class RandomForestClassifier beat an ordinal regression-on-rank "
            "approach (macro-F1 0.549 vs 0.512); (2) merging the original minor+"
            "moderate classes into one 'watch' class beat the 4-class split (macro-F1 "
            "0.640 vs 0.549, accuracy 0.733 vs 0.688) because minor/moderate were not "
            "reliably separable and get the same operational response anyway."
        ),
        "metrics": {
            "accuracy": round(acc, 3),
            "macro_precision": round(macro["precision"], 3),
            "macro_recall": round(macro["recall"], 3),
            "macro_f1": round(macro["f1-score"], 3),
            "weighted_precision": round(weighted["precision"], 3),
            "weighted_recall": round(weighted["recall"], 3),
            "weighted_f1": round(weighted["f1-score"], 3),
            "per_class": per_class,
            "confusion_matrix": cm,
            "confusion_matrix_labels": CLASSES,
            "cross_validation": cv_summary,
        },
        "feature_importances": [{"feature": f, "importance": v} for f, v in importance_pairs],
        "options": {"materials": materials, "products": products},
    }

    joblib.dump(pipe, MODEL_PATH)
    with open(META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    return meta


if __name__ == "__main__":
    m = train()
    met = m["metrics"]
    print("Severity triage model trained and saved.")
    print(f"  rows: {m['n_total']} (train {m['n_train']} / test {m['n_test']})")
    print(f"  class balance: {m['class_balance']}")
    print(f"  accuracy: {met['accuracy']}   macro-F1: {met['macro_f1']}   "
          f"macro-precision: {met['macro_precision']}   macro-recall: {met['macro_recall']}")
    print("  per-class breakdown:")
    for cls, vals in met["per_class"].items():
        print(f"    {cls:<10} precision={vals['precision']}  recall={vals['recall']}  "
              f"f1={vals['f1_score']}  support={vals['support']}")
    print(f"  confusion matrix (rows=true, cols=pred, order={CLASSES}):")
    for row in met["confusion_matrix"]:
        print(f"    {row}")
    print("  5-fold CV (mean +/- std):")
    for metric, vals in met["cross_validation"].items():
        print(f"    {metric:<16} {vals['mean']:.3f} +/- {vals['std']:.3f}")
    print("  top factors:")
    for fi in m["feature_importances"][:6]:
        print(f"    {fi['feature']:<16} {fi['importance']}")

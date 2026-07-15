"""Train the Predictive Dosing Quality model.

Run from the Backend/ directory:

    python -m ai_assistant.ml.train

It loads the batch history, builds features, trains a RandomForest to predict
whether a dose will be out-of-tolerance, evaluates on a held-out test set, and
saves the model + metadata next to this file.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder

from .. import data
from . import features

_HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(_HERE, "model.joblib")
META_PATH = os.path.join(_HERE, "model_meta.json")


def _build_frame() -> pd.DataFrame:
    rows = data.scored_rows()
    records = []
    for r in rows:
        feat = features.row_to_features(r)
        feat["flagged"] = 1 if r["status"] in ("over", "under") else 0
        feat["material_name"] = r["material_name"]
        records.append(feat)
    return pd.DataFrame.from_records(records)


def train() -> dict:
    df = _build_frame()
    if df.empty:
        raise RuntimeError("No scored rows available to train on.")

    X = df[features.FEATURE_ORDER]
    y = df["flagged"]

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

    # 5-fold stratified cross-validation over the FULL dataset — a more robust
    # estimate of generalization than a single train/test split, since every
    # row gets used for testing exactly once across the 5 folds.
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_results = cross_validate(
        pipe, X, y, cv=cv, scoring=["accuracy", "roc_auc", "precision", "recall", "f1"], n_jobs=-1
    )
    cv_summary = {
        metric: {
            "mean": round(float(cv_results[f"test_{metric}"].mean()), 3),
            "std": round(float(cv_results[f"test_{metric}"].std()), 3),
            "folds": [round(float(s), 3) for s in cv_results[f"test_{metric}"]],
        }
        for metric in ["accuracy", "roc_auc", "precision", "recall", "f1"]
    }

    # Fit on the 75% training split. This is also the exact model we save —
    # keeping the deployed artifact identical to the one the metrics below
    # describe (no separate "refit on everything" step that would make the
    # reported numbers not quite match what's actually served).
    pipe.fit(X_train, y_train)

    proba = pipe.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(int)
    acc = accuracy_score(y_test, preds)
    try:
        auc = roc_auc_score(y_test, proba)
    except ValueError:
        auc = None
    cm = confusion_matrix(y_test, preds).tolist()

    # Per-class precision/recall/F1 (0 = on-target, 1 = flagged/out-of-tolerance),
    # plus macro/weighted averages. zero_division=0 avoids warnings if a class
    # is never predicted.
    report = classification_report(y_test, preds, target_names=["on_target", "flagged"],
                                    output_dict=True, zero_division=0)
    class_metrics = {
        cls: {
            "precision": round(report[cls]["precision"], 3),
            "recall": round(report[cls]["recall"], 3),
            "f1_score": round(report[cls]["f1-score"], 3),
            "support": int(report[cls]["support"]),
        }
        for cls in ("on_target", "flagged")
    }
    # "Flagged" is the class we actually care about operationally (catching
    # risky doses), so surface it as the headline precision/recall/F1 too.
    flagged_precision = round(float(precision_score(y_test, preds, pos_label=1, zero_division=0)), 3)
    flagged_recall = round(float(recall_score(y_test, preds, pos_label=1, zero_division=0)), 3)
    flagged_f1 = round(float(f1_score(y_test, preds, pos_label=1, zero_division=0)), 3)

    importances = pipe.named_steps["clf"].feature_importances_
    importance_pairs = sorted(
        zip(features.FEATURE_ORDER, (round(float(v), 4) for v in importances)),
        key=lambda kv: kv[1],
        reverse=True,
    )

    # Options for the prediction form: distinct materials (code -> name),
    # products, and categories present in the data, plus sensible defaults.
    materials = (
        df[["material_code", "material_name"]]
        .drop_duplicates()
        .sort_values("material_name")
        .to_dict("records")
    )
    products = sorted(df["product_name"].dropna().unique().tolist())
    categories = sorted(df["category"].dropna().unique().tolist())

    # Per-material / per-product defaults so the UI can auto-fill quantity & category.
    material_defaults = {}
    for code, grp in df.groupby("material_code"):
        material_defaults[str(code)] = {
            "category": grp["category"].mode().iat[0] if not grp["category"].mode().empty else "",
            "typical_setpoint": round(float(grp["setpoint"].median()), 2),
        }
    product_defaults = {}
    for name, grp in df.groupby("product_name"):
        product_defaults[str(name)] = {
            "typical_quantity": round(float(grp["quantity"].median()), 1),
        }

    meta = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_type": "RandomForestClassifier",
        "target": "dose out-of-tolerance (|actual-setpoint| > tolerance)",
        "tolerance_pct": data.TOLERANCE_PCT,
        "n_total": int(len(df)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "positive_rate": round(float(y.mean()), 3),
        "metrics": {
            "accuracy": round(float(acc), 3),
            "roc_auc": round(float(auc), 3) if auc is not None else None,
            "confusion_matrix": cm,  # [[TN, FP], [FN, TP]]
            # Headline precision/recall/F1 for the positive ("flagged") class —
            # i.e. how well the model catches doses that will actually go bad.
            "precision": flagged_precision,
            "recall": flagged_recall,
            "f1_score": flagged_f1,
            "per_class": class_metrics,
            # 5-fold stratified CV over the full dataset — mean/std per metric,
            # a more robust generalization estimate than the single split above.
            "cross_validation": cv_summary,
        },
        "feature_importances": [{"feature": f, "importance": v} for f, v in importance_pairs],
        "options": {
            "materials": materials,
            "products": products,
            "categories": categories,
        },
        "material_defaults": material_defaults,
        "product_defaults": product_defaults,
    }

    joblib.dump(pipe, MODEL_PATH)
    with open(META_PATH, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=2)

    return meta


if __name__ == "__main__":
    m = train()
    met = m["metrics"]
    print("Model trained and saved.")
    print(f"  rows: {m['n_total']} (train {m['n_train']} / test {m['n_test']})")
    print(f"  out-of-tolerance rate: {m['positive_rate']*100:.1f}%")
    print(f"  accuracy: {met['accuracy']}   ROC-AUC: {met['roc_auc']}")
    print(f"  flagged-class  precision: {met['precision']}  recall: {met['recall']}  F1: {met['f1_score']}")
    print("  per-class breakdown:")
    for cls, vals in met["per_class"].items():
        print(f"    {cls:<10} precision={vals['precision']}  recall={vals['recall']}  "
              f"f1={vals['f1_score']}  support={vals['support']}")
    print(f"  confusion matrix [[TN, FP], [FN, TP]]: {met['confusion_matrix']}")
    print("  5-fold stratified CV (mean +/- std):")
    for metric, vals in met["cross_validation"].items():
        print(f"    {metric:<10} {vals['mean']:.3f} +/- {vals['std']:.3f}   folds={vals['folds']}")
    print("  top factors:")
    for fi in m["feature_importances"][:6]:
        print(f"    {fi['feature']:<16} {fi['importance']}")

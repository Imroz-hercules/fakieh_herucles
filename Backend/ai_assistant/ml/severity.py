"""Severity-band bucketing for the dosing severity triage model.

Originally 4 classes (on_target/minor/moderate/severe), with boundaries at
the 33rd/66th percentile of |deviation_pct| among flagged doses. 5-fold CV
showed minor and moderate were not reliably separable (F1 0.29 / 0.27 --
adjacent points on a continuous scale, not a real decision boundary) and,
operationally, both get the same "keep an eye on it" response from an
operator anyway. Merging them into a single "watch" class was tested and
clearly wins on every metric (macro-F1 0.640 vs 0.549, accuracy 0.733 vs
0.688) -- see ai_assistant/ml/train_severity.py docstring for the numbers.
"""

from __future__ import annotations

SEVERITY_CLASSES = ["on_target", "watch", "severe"]
SEVERITY_RANK = {cls: i for i, cls in enumerate(SEVERITY_CLASSES)}  # for ordinal modeling

# Percentile-derived boundary between "watch" and "severe" (was the
# minor/moderate -> severe boundary in the original 4-class scheme).
WATCH_MAX_PCT = 13.0

SEVERITY_LABELS = {
    "on_target": "On target",
    "watch": "Watch — moderate deviation",
    "severe": "Severe deviation",
}


def severity_band(deviation_pct: float | None, tolerance_pct: float) -> str:
    """Bucket a signed deviation_pct into a severity class by its magnitude."""
    if deviation_pct is None:
        return "unknown"
    d = abs(deviation_pct)
    if d <= tolerance_pct:
        return "on_target"
    if d <= WATCH_MAX_PCT:
        return "watch"
    return "severe"

"""Data-drift detection via the Population Stability Index (PSI).

PSI measures how far a *current* distribution has moved from a *reference*
(training) distribution. It's the standard, interpretable drift metric in
production ML:

    PSI < 0.10   no meaningful shift        (healthy)
    0.10-0.25    moderate shift             (watch)
    PSI >= 0.25  significant shift          (drift — model may be stale)

We compute it per input feature. For categorical features (product recipe,
material) we compare category proportions; for numeric features (setpoint) we
bin into deciles of the reference range and compare bin proportions. A small
epsilon floor avoids div-by-zero / log(0) when a category or bin is unseen in
one of the two samples (which is exactly what happens when a brand-new product
recipe starts running — a genuine, strong drift signal).
"""

from __future__ import annotations

import math
from collections import Counter

# Standard PSI interpretation thresholds.
WATCH = 0.10
DRIFT = 0.25

_EPS = 1e-4


def psi_categorical(reference: list, current: list) -> float:
    """PSI between two categorical samples (lists of raw values)."""
    if not reference or not current:
        return 0.0
    cats = set(reference) | set(current)
    rc = Counter(reference)
    cc = Counter(current)
    nr = len(reference)
    nc = len(current)
    psi = 0.0
    for c in cats:
        e = max(rc[c] / nr, _EPS)
        a = max(cc[c] / nc, _EPS)
        psi += (a - e) * math.log(a / e)
    return psi


def psi_numeric(reference: list, current: list, bins: int = 10) -> float:
    """PSI between two numeric samples, binned on the reference range."""
    ref = [float(v) for v in reference if v is not None]
    cur = [float(v) for v in current if v is not None]
    if not ref or not cur:
        return 0.0
    lo, hi = min(ref), max(ref)
    if hi <= lo:
        return 0.0
    edges = [lo + (hi - lo) * i / bins for i in range(bins + 1)]

    def bucket(x: float) -> int:
        for i in range(bins):
            if x < edges[i + 1]:
                return i
        return bins - 1

    rc = Counter(bucket(x) for x in ref)
    cc = Counter(bucket(x) for x in cur)
    nr, nc = len(ref), len(cur)
    psi = 0.0
    for i in range(bins):
        e = max(rc[i] / nr, _EPS)
        a = max(cc[i] / nc, _EPS)
        psi += (a - e) * math.log(a / e)
    return psi


def band(psi: float) -> str:
    """Map a PSI value to a status label."""
    if psi >= DRIFT:
        return "drift"
    if psi >= WATCH:
        return "watch"
    return "healthy"

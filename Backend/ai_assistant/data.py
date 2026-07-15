"""Load and analyze the Fakieh batch-dosing history.

The dataset is the SIMATIC Batch historian export (SetPoint vs Actual dosed
weight, per material, per batch). We read it with the stdlib ``csv`` module
(no pandas) to stay light on memory-constrained machines.

Every row becomes a normalized record with the dosing deviation pre-computed,
which the insights layer aggregates and the AI layer narrates.
"""

from __future__ import annotations

import csv
import os
from datetime import datetime
from functools import lru_cache
from typing import Optional

# Materials dosed within +/- this percent of target are considered "on target".
# Feed dosing (especially micro-ingredients / premixes) is tight; 2% is a
# reasonable default band for flagging over/under-dosing.
TOLERANCE_PCT = float(os.getenv("AI_DOSING_TOLERANCE_PCT", "2.0"))

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CSV = os.path.join(_HERE, "data", "batch_history.csv")

# Path can be overridden to point at a live export; defaults to the bundled file.
BATCH_CSV = os.getenv("AI_BATCH_CSV", _DEFAULT_CSV)

_DATE_FORMATS = ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S")


def _to_float(value: str) -> Optional[float]:
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _parse_dt(value: str) -> Optional[datetime]:
    value = (value or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _classify(deviation_pct: Optional[float]) -> str:
    if deviation_pct is None:
        return "unknown"
    if deviation_pct > TOLERANCE_PCT:
        return "over"
    if deviation_pct < -TOLERANCE_PCT:
        return "under"
    return "on_target"


@lru_cache(maxsize=1)
def load_rows() -> list[dict]:
    """Read the CSV once and return normalized dosing records.

    Cached for the process lifetime; call ``load_rows.cache_clear()`` if the
    underlying file changes.
    """
    rows: list[dict] = []
    if not os.path.exists(BATCH_CSV):
        return rows

    # utf-8-sig strips the BOM the export starts with.
    with open(BATCH_CSV, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            setpoint = _to_float(raw.get("SetPoint Float"))
            actual = _to_float(raw.get("Actual Value Float"))

            deviation = None
            deviation_pct = None
            if setpoint is not None and actual is not None:
                deviation = actual - setpoint
                if setpoint != 0:
                    deviation_pct = (deviation / setpoint) * 100.0

            start = _parse_dt(raw.get("Batch Act Start", ""))

            rows.append(
                {
                    "batch_guid": (raw.get("Batch GUID") or "").strip(),
                    "order_id": (raw.get("OrderId") or "").strip(),
                    "batch_name": (raw.get("Batch Name") or "").strip(),
                    "product_name": (raw.get("Product Name") or "").strip(),
                    "material_name": (raw.get("Material Name") or "").strip(),
                    "material_code": (raw.get("Material Code") or "").strip(),
                    "category": (raw.get("FormulaCategoryName") or "").strip(),
                    "quantity": _to_float(raw.get("Quantity")),
                    "setpoint": setpoint,
                    "actual": actual,
                    "deviation": deviation,
                    "deviation_pct": deviation_pct,
                    "status": _classify(deviation_pct),
                    "start": start,
                    "start_iso": start.isoformat() if start else None,
                    "date": start.date().isoformat() if start else None,
                }
            )
    return rows


def scored_rows() -> list[dict]:
    """Rows that have a usable deviation percentage (setpoint > 0)."""
    return [r for r in load_rows() if r["deviation_pct"] is not None]


def dataset_meta() -> dict:
    """High-level facts about the loaded dataset (for the AI context header)."""
    rows = load_rows()
    dates = [r["start"] for r in rows if r["start"]]
    products = sorted({r["product_name"] for r in rows if r["product_name"]})
    batches = {r["batch_guid"] for r in rows if r["batch_guid"]}
    return {
        "row_count": len(rows),
        "batch_count": len(batches),
        "product_count": len(products),
        "products": products,
        "date_from": min(dates).isoformat() if dates else None,
        "date_to": max(dates).isoformat() if dates else None,
        "tolerance_pct": TOLERANCE_PCT,
        "source": os.path.basename(BATCH_CSV),
    }

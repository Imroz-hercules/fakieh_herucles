"""Full-column loader for the bundled batch CSV, independent of data.py.

data.py's load_rows() is tailored for the AI Assistant (deviation/status
analytics) and drops columns like Batch Act End / Batch Transfer Time /
Source Server / ROOTGUID that it doesn't need. This module keeps EVERY
column so the local batch-reporting endpoints (kpi/filter-options/calendar)
can serve the exact shape the existing Batch Calendar / Raw Data /
Historical Reports pages already expect from the real SQL Server table —
without touching or risking data.py's already-verified pipeline.
"""

from __future__ import annotations

import csv
from datetime import datetime
from functools import lru_cache

from .data import BATCH_CSV

_DATE_FORMATS = ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S")


def _parse_dt(value: str) -> datetime | None:
    value = (value or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _iso_z(dt: datetime | None) -> str | None:
    """Match Backend/utils/timezone.py format_db_datetime_utc_iso — naive UTC, Z suffix."""
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@lru_cache(maxsize=1)
def load_raw_rows() -> list[dict]:
    """Every column from the bundled CSV, with parsed + ISO-formatted timestamps."""
    rows: list[dict] = []
    with open(BATCH_CSV, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            start_dt = _parse_dt(raw.get("Batch Act Start", ""))
            end_dt = _parse_dt(raw.get("Batch Act End", ""))
            transfer_dt = _parse_dt(raw.get("Batch Transfer Time", ""))

            def _f(key: str) -> float | None:
                v = (raw.get(key) or "").strip()
                if not v:
                    return None
                try:
                    return float(v)
                except ValueError:
                    return None

            rows.append(
                {
                    "Source Server": (raw.get("Source Server") or "").strip(),
                    "Batch GUID": (raw.get("Batch GUID") or "").strip(),
                    "ROOTGUID": (raw.get("ROOTGUID") or "").strip(),
                    "OrderId": (raw.get("OrderId") or "").strip(),
                    "Batch Name": (raw.get("Batch Name") or "").strip(),
                    "Product Name": (raw.get("Product Name") or "").strip(),
                    "Batch Act Start": _iso_z(start_dt),
                    "Batch Act End": _iso_z(end_dt),
                    "Batch Transfer Time": _iso_z(transfer_dt),
                    "Quantity": _f("Quantity"),
                    "Material Name": (raw.get("Material Name") or "").strip(),
                    "Material Code": (raw.get("Material Code") or "").strip(),
                    "SetPoint Float": _f("SetPoint Float"),
                    "Actual Value Float": _f("Actual Value Float"),
                    "FormulaCategoryName": (raw.get("FormulaCategoryName") or "").strip(),
                    # Sort/filter keys (datetime objects, not serialized).
                    "_start_dt": start_dt,
                    "_end_dt": end_dt,
                    "_transfer_dt": transfer_dt,
                }
            )
    return rows

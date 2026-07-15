"""Where live batches come from.

A single ``DataSource`` interface with two implementations:

  * ``CsvReplaySource``  — used now, on the laptop / in the demo. Replays the
    bundled Fakieh historian export (the exact same data the rest of the AI
    feature already uses) in chronological order, so the live monitor has a
    real stream to work on without needing the plant network.

  * ``SqlServerSource``  — used at the plant. Reads the same SIMATIC Batch
    historian table (``BatchMaterials_Shadow`` in ``ASMBatchReports``) that the
    existing Batch Calendar / Raw Data / Historical Reports pages already read
    from. It is fully written and ready; it just needs a reachable server +
    pyodbc, which don't exist on the laptop.

Swapping from replay to the live plant feed is one environment variable:

    AI_LIVE_SOURCE=sqlserver
    AI_LIVE_SQL_CONN="mssql+pyodbc://USER:PASS@HOST/ASMBatchReports?driver=ODBC+Driver+18+for+SQL+Server"

Both return rows in the **same normalized shape** as ``data.scored_rows()`` so
everything downstream (scoring, drift, retrain) is identical regardless of
source.
"""

from __future__ import annotations

import os
from datetime import datetime

from .. import data


class DataSource:
    """A chronological source of scored dosing rows."""

    label = "data source"

    def scored_rows(self) -> list[dict]:
        raise NotImplementedError


class CsvReplaySource(DataSource):
    """Replays the bundled historian export in chronological order."""

    label = "CSV replay · Fakieh SIMATIC Batch historian export"

    def scored_rows(self) -> list[dict]:
        rows = list(data.scored_rows())
        rows.sort(key=lambda r: r.get("start") or datetime.min)
        return rows


class SqlServerSource(DataSource):
    """Live plant feed — reads the SIMATIC Batch historian on SQL Server.

    This is the production adapter. It targets the same table the existing
    Batch reporting pages use, normalizes each row into the shape the AI layer
    expects, and computes the dosing deviation the same way ``data.py`` does.
    Not exercised on the laptop (no server / no pyodbc) but ready to run at the
    plant by setting AI_LIVE_SOURCE=sqlserver and AI_LIVE_SQL_CONN=...
    """

    label = "SQL Server · ASMBatchReports.BatchMaterials_Shadow (live)"

    # The historian table + columns (mirrors the existing Batch pages' source).
    TABLE = os.getenv("AI_LIVE_SQL_TABLE", "BatchMaterials_Shadow")

    def __init__(self) -> None:
        self.conn_str = os.getenv("AI_LIVE_SQL_CONN", "")
        if not self.conn_str:
            raise RuntimeError(
                "AI_LIVE_SOURCE=sqlserver but AI_LIVE_SQL_CONN is not set. "
                "Set it to an mssql+pyodbc SQLAlchemy URL for ASMBatchReports."
            )

    def scored_rows(self) -> list[dict]:
        # Imported lazily so the demo (CSV) never needs SQLAlchemy/pyodbc installed.
        from sqlalchemy import create_engine, text

        engine = create_engine(self.conn_str, pool_pre_ping=True)
        query = text(
            f"""
            SELECT  [Batch GUID]        AS batch_guid,
                    [OrderId]           AS order_id,
                    [Batch Name]        AS batch_name,
                    [Product Name]      AS product_name,
                    [Material Name]     AS material_name,
                    [Material Code]     AS material_code,
                    [FormulaCategoryName] AS category,
                    [Quantity]          AS quantity,
                    [SetPoint Float]    AS setpoint,
                    [Actual Value Float] AS actual,
                    [Batch Act Start]   AS start
            FROM    {self.TABLE}
            WHERE   [SetPoint Float] IS NOT NULL
              AND   [SetPoint Float] <> 0
              AND   [Actual Value Float] IS NOT NULL
            ORDER BY [Batch Act Start] ASC
            """
        )
        rows: list[dict] = []
        with engine.connect() as conn:
            for m in conn.execute(query).mappings():
                setpoint = _to_float(m["setpoint"])
                actual = _to_float(m["actual"])
                deviation = deviation_pct = None
                if setpoint and actual is not None:
                    deviation = actual - setpoint
                    deviation_pct = (deviation / setpoint) * 100.0
                start = m["start"] if isinstance(m["start"], datetime) else None
                rows.append(
                    {
                        "batch_guid": (m["batch_guid"] or "").strip(),
                        "order_id": (m["order_id"] or "").strip(),
                        "batch_name": (m["batch_name"] or "").strip(),
                        "product_name": (m["product_name"] or "").strip(),
                        "material_name": (m["material_name"] or "").strip(),
                        "material_code": (m["material_code"] or "").strip(),
                        "category": (m["category"] or "").strip(),
                        "quantity": _to_float(m["quantity"]),
                        "setpoint": setpoint,
                        "actual": actual,
                        "deviation": deviation,
                        "deviation_pct": deviation_pct,
                        "status": data._classify(deviation_pct),
                        "start": start,
                        "start_iso": start.isoformat() if start else None,
                    }
                )
        return [r for r in rows if r["deviation_pct"] is not None]


def _to_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def get_source() -> DataSource:
    """Pick the source from the AI_LIVE_SOURCE env var (default: csv replay)."""
    kind = os.getenv("AI_LIVE_SOURCE", "csv").strip().lower()
    if kind in ("sql", "sqlserver", "mssql"):
        return SqlServerSource()
    return CsvReplaySource()

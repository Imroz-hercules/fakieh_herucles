# routes/orders_sink.py
from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from sqlalchemy import text
from models import db

# ───────────────────────────── Config ─────────────────────────────
ORDERS_DEDUP_WHOLE_PAYLOAD = False   # set True to drop identical overall snapshots

# ─────────────────────────── State & Locks ────────────────────────
_state_lock = threading.Lock()
_last_payload_sig: Dict[str, str] = {}

@dataclass
class CycleState:
    table: str
    key: Tuple[str, int]          # (section, lineKey)
    row_id: int                   # inserted order id
    last_code: Optional[int] = None
    saw2: bool = False
    saw6: bool = False
    saw8: bool = False
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

# one active row per stream/line (e.g., ("intake", 1))
_active: Dict[Tuple[str, int], CycleState] = {}

# ───────────────────── Schema helpers (cached) ────────────────────
_meta_cache: Dict[str, Dict[str, Dict[str, Any]]] = {}

def _load_table_meta(table: str) -> Dict[str, Dict[str, Any]]:
    if table in _meta_cache:
        return _meta_cache[table]
    sql = text("""
      SELECT column_name, is_nullable, data_type, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=:t
    """)
    with db.engine.connect() as conn:
        rows = conn.execute(sql, {"t": table}).mappings().all()
    meta = {
        r["column_name"]: {
            "nullable": (r["is_nullable"] == "YES"),
            "data_type": (r["data_type"] or "").lower(),
            "default": r["column_default"],
        } for r in rows
    }
    _meta_cache[table] = meta
    return meta

def _cols(table: str) -> List[str]:
    return list(_load_table_meta(table).keys())

# ───────────────────────── Small utils ────────────────────────────
def _sig(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))

def _now():
    return datetime.now(timezone.utc)

def _i(v):
    try:
        return int(v) if v not in (None, "") else None
    except Exception:
        return None

def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except Exception:
        return None

def _auto_timestamps(table: str, row: Dict[str, Any]) -> None:
    cols = _cols(table)
    now = _now()
    if "created_at" in cols and "created_at" not in row:
        row["created_at"] = now
    if "updated_at" in cols:
        row["updated_at"] = now

def _apply_notnull_defaults(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Fill NOT NULL columns that have no DB default and weren't supplied."""
    meta = _load_table_meta(table)
    out = dict(row)
    for col, info in meta.items():
        if col in out:
            continue
        if info.get("nullable", True):
            continue
        if info.get("default") is not None:
            continue
        dt = (info.get("data_type") or "")
        if "char" in dt or "text" in dt:
            out[col] = ""
        elif dt in ("integer", "smallint", "bigint"):
            out[col] = 0
        elif dt in ("numeric", "decimal", "real", "double precision"):
            out[col] = 0.0
        elif dt == "boolean":
            out[col] = False
        elif dt.startswith("timestamp"):
            out[col] = _now()
        else:
            out[col] = 0
    return out

def _map_synonyms(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    """Rename JSON keys to match table columns if needed."""
    cols = set(_cols(table))
    r = dict(row)

    def maybe(src, dst):
        if src in r and r[src] is not None and dst in cols and dst not in r:
            r[dst] = r.pop(src)

    # common
    maybe("dest1", "destination_silo1")
    maybe("dest2", "destination_silo2")
    maybe("material_code", "source_material_code")

    # pit specifics
    maybe("raw_code", "raw_material_code")
    maybe("active_raw_code", "active_raw_material")

    return r

# ─────────────────────── DB I/O helpers ───────────────────────────
def _insert_row(table: str, row: Dict[str, Any]) -> int:
    cols_meta = _load_table_meta(table)
    if not cols_meta:
        raise RuntimeError(f"Table '{table}' not found")

    known = set(cols_meta.keys())
    row = _map_synonyms(table, row)
    row = {k: v for k, v in row.items() if k in known}
    row = {k: v for k, v in row.items() if v is not None}  # let DB defaults apply
    _auto_timestamps(table, row)
    row = _apply_notnull_defaults(table, row)

    keys = sorted(row.keys())
    placeholders = ", ".join(f":{k}" for k in keys)
    columns = ", ".join(keys)

    sql = text(f"INSERT INTO {table} ({columns}) VALUES ({placeholders}) RETURNING id")

    with db.engine.begin() as conn:
        new_id = conn.execute(sql, row).scalar()
    return int(new_id)

def _update_row(table: str, row_id: int, row: Dict[str, Any]) -> None:
    if not row:
        return
    known = set(_cols(table))
    row = _map_synonyms(table, row)
    row = {k: v for k, v in row.items() if k in known}
    row = {k: v for k, v in row.items() if v is not None}
    # always bump updated_at if present
    if "updated_at" in known and "updated_at" not in row:
        row["updated_at"] = _now()

    sets = ", ".join(f"{k} = :{k}" for k in row.keys())
    sql = text(f"UPDATE {table} SET {sets} WHERE id = :_id")
    row["_id"] = row_id

    with db.engine.begin() as conn:
        conn.execute(sql, row)

def _finalize_row(table: str, row_id: int, status_code: Optional[int]) -> None:
    payload = {}
    cols = set(_cols(table))
    if "status_word" in cols and status_code is not None:
        payload["status_word"] = status_code
    if "completed_at" in cols:
        payload["completed_at"] = _now()
    if "is_complete" in cols:
        payload["is_complete"] = True
    _update_row(table, row_id, payload)

# ───────────────────── Cycle logic (the core) ─────────────────────
def _open_if_idle(section: str, table: str, line_key: int, code: Optional[int], base_row: Dict[str, Any]):
    """
    If status is 1 and there is no active cycle, INSERT and start tracking.
    If status is 1 but there IS an active cycle that already completed (saw8),
    finalize the old one and open a new one.
    """
    state = _active.get((section, line_key))

    if code != 1:
        # just remember last code below in _update_active
        return

    if state is None:
        new_id = _insert_row(table, base_row)
        _active[(section, line_key)] = CycleState(
            table=table, key=(section, line_key), row_id=new_id, last_code=1
        )
        return

    # We have a tracked order and status returns to 1.
    # If previous cycle saw 8 (Stopping), consider it completed and start a new one.
    if state.last_code != 1:
        if state.saw8:
            _finalize_row(table, state.row_id, 8)
            new_id = _insert_row(table, base_row)
            _active[(section, line_key)] = CycleState(
                table=table, key=(section, line_key), row_id=new_id, last_code=1
            )
        else:
            # safety: finalize anyway to avoid dangling row
            _finalize_row(table, state.row_id, state.last_code)
            new_id = _insert_row(table, base_row)
            _active[(section, line_key)] = CycleState(
                table=table, key=(section, line_key), row_id=new_id, last_code=1
            )

def _update_active(section: str, table: str, line_key: int, code: Optional[int], partial_update: Dict[str, Any]):
    """
    While not in 1, update the active row (if any) and mark milestones.
    """
    state = _active.get((section, line_key))
    if state is None:
        return  # nothing open; we only open on 1

    # bump status + any realtime fields
    upd = dict(partial_update or {})
    if code is not None:
        upd["status_word"] = code
    _update_row(table, state.row_id, upd)

    # milestone flags
    if code == 2:
        state.saw2 = True
    elif code == 6:
        state.saw6 = True
    elif code == 8:
        state.saw8 = True

    state.last_code = code

# ───────────────────── Public API ──────────────────────────────────
def persist_orders(snapshot: Dict[str, Any]) -> Dict[str, int]:
    """
    Insert on IDLE (1). Update the same row through 2→6→8.
    When it returns to 1 after seeing 8, finalize previous row and open the next.
    """
    if ORDERS_DEDUP_WHOLE_PAYLOAD:
        s = _sig(snapshot)
        if _last_payload_sig.get("plant") == s:
            return {"intake": 0, "outloading": 0, "bulk": 0, "pit": 0}
        _last_payload_sig["plant"] = s

    inserted = {"intake": 0, "outloading": 0, "bulk": 0, "pit": 0}

    with _state_lock:
        # ── Intake lines ─────────────────────────────────────────────
        for rec in (snapshot.get("intake") or []):
            code = _i((rec.get("status_word") or {}).get("code"))
            line = _i(rec.get("line")) or 0
            table = "intake_orders"

            base_row = {
                "badge_no":             _i(rec.get("badge_no")),
                "material_code":        rec.get("material_code"),
                "declared_quantity_kg": _f(rec.get("declared_qty_kg")),
                "dest1":                _i(rec.get("dest1")),
                "dest2":                _i(rec.get("dest2")),
                "rfid_badge_reading":   _f(rec.get("rfid_badge_reading")),
                "active_badge":         _i(rec.get("active_badge")),
                "active_destination":   _i(rec.get("active_destination")),
                "status_word":          code,
                "line":                 line,
            }

            if code == 1:
                before = _active.get(("intake", line))
                _open_if_idle("intake", table, line, code, base_row)
                after = _active.get(("intake", line))
                if before is None and after is not None:
                    inserted["intake"] += 1
            else:
                _update_active("intake", table, line, code, {})

        # ── Outloading lines ────────────────────────────────────────
        for rec in (snapshot.get("outloading") or []):
            code = _i((rec.get("status_word") or {}).get("code"))
            line = _i(rec.get("line")) or 0
            table = "outloading_orders"
            base_row = {
                "badge_no":             _i(rec.get("badge_no")),
                "material_code":        rec.get("material_code"),
                "declared_quantity_kg": _f(rec.get("declared_qty_kg")),
                "dest1":                _i(rec.get("dest1")),
                "dest2":                _i(rec.get("dest2")),
                "rfid_badge_reading":   _f(rec.get("rfid_badge_reading")),
                "active_badge":         _i(rec.get("active_badge")),
                "active_destination":   _i(rec.get("active_destination")),
                "status_word":          code,
                "line":                 line,
                "dest_sel":             _i(rec.get("dest_sel")),
                "active_dest_sel":      _i(rec.get("active_dest_sel")),
            }
            if code == 1:
                before = _active.get(("outloading", line))
                _open_if_idle("outloading", table, line, code, base_row)
                after = _active.get(("outloading", line))
                if before is None and after is not None:
                    inserted["outloading"] += 1
            else:
                _update_active("outloading", table, line, code, {})

        # ── Bulk (single lineKey=1) ────────────────────────────────
        b = snapshot.get("bulk")
        if b:
            code = _i((b.get("status_word") or {}).get("code"))
            table = "bulk_line_orders"
            a = b.get("active") or {}
            base_row = {
                "source_silo":          _i(b.get("source_silo")),
                "dest1":                _i(b.get("dest1")),
                "dest2":                _i(b.get("dest2")),
                "cc25_sel":             _i(b.get("cc25_sel")),
                "declared_quantity_kg": _f(b.get("declared_qty_kg")),
                "scale_sel":            _i(b.get("scale_sel")),
                "status_word":          code,
                "active_source_silo":   _i(a.get("source_silo")),
                "active_dest1":         _i(a.get("dest1")),
                "active_dest2":         _i(a.get("dest2")),
                "active_cc25_sel":      _i(a.get("cc25_sel")),
                "active_qty_kg":        _f(a.get("qty_kg")),
                "active_scale_sel":     _i(a.get("scale_sel")),
            }
            if code == 1:
                before = _active.get(("bulk", 1))
                _open_if_idle("bulk", table, 1, code, base_row)
                after = _active.get(("bulk", 1))
                if before is None and after is not None:
                    inserted["bulk"] += 1
            else:
                _update_active("bulk", table, 1, code, {})

        # ── Pit (single lineKey=1) ─────────────────────────────────
        p = snapshot.get("pit")
        if p:
            code = _i((p.get("status_word") or {}).get("code"))
            table = "pt_line_orders"
            a = p.get("active") or {}
            base_row = {
                "pit_no":               _i(p.get("pit_no")),
                "raw_code":             p.get("raw_code"),
                "dest1":                _i(p.get("dest1")),
                "dest2":                _i(p.get("dest2")),
                "declared_quantity_kg": _f(p.get("declared_qty_kg")),
                "scale_sel":            _i(p.get("scale_sel")),
                "status_word":          code,
                "active_pit_no":        _i(a.get("pit_no")),
                "active_raw_code":      a.get("raw_code"),
                "active_dest1":         _i(a.get("dest1")),
                "active_dest2":         _i(a.get("dest2")),
                "active_qty_kg":        _f(a.get("qty_kg")),
                "active_scale_sel":     _i(a.get("scale_sel")),
            }
            if code == 1:
                before = _active.get(("pit", 1))
                _open_if_idle("pit", table, 1, code, base_row)
                after = _active.get(("pit", 1))
                if before is None and after is not None:
                    inserted["pit"] += 1
            else:
                _update_active("pit", table, 1, code, {})

        # Optional: auto-finalize any cycle that reached 8 and then
        # vanished from the snapshot (e.g., line not reported for a while)
        # — left out by default; add if you need a timeout logic.

    return inserted

# Optional: admin helpers
def reset_cycle_memory():
    """Clear the in-memory state machine (forces next 1 to create new orders)."""
    with _state_lock:
        _active.clear()

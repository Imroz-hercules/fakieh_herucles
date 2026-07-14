"""
KPI / BatchMaterials list helpers: limits, optional COUNT skip, keyset cursors.

Query params (documented on routes):
- limit: page size (clamped to KPI_MAX_LIMIT, default KPI_DEFAULT_LIMIT)
- includeTotal: true|false — when false, omit COUNT(*); use limit+1 rows and has_more
- Keyset (optional, ASC sort): after_* params for /kpi and /reports; before_* for DESC /csv-format-report
"""
import os
import base64
import json
from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, or_, func

# Env: KPI_DEFAULT_LIMIT (default 5000), KPI_MAX_LIMIT (default 10000)
_DEFAULT = int(os.getenv("KPI_DEFAULT_LIMIT", "5000"))
_MAX = int(os.getenv("KPI_MAX_LIMIT", "10000"))


def kpi_default_limit():
    return max(1, _DEFAULT)


def kpi_max_limit():
    return max(1, min(_MAX, 50000))  # absolute safety cap


def clamp_kpi_limit(limit_raw):
    """Clamp requested page size to [1, kpi_max_limit()]."""
    if limit_raw is None:
        return kpi_default_limit()
    try:
        n = int(limit_raw)
    except (TypeError, ValueError):
        return kpi_default_limit()
    return max(1, min(n, kpi_max_limit()))


def parse_include_total(request_args):
    v = (request_args.get("includeTotal") or "true").lower()
    return v in ("true", "1", "yes")


def product_not_selected_clause(model_cls):
    """
    Exclude placeholder product rows. Uses case-insensitive match without wrapping
    the column in LOWER() when possible: SQL Server CI collation often matches
    literal inequality for common casings; keep LOWER fallback via OR for edge cases.
    """
    pn = model_cls.product_name
    return and_(
        pn.isnot(None),
        func.trim(pn) != "",
        ~func.lower(func.trim(pn)).in_(("not selected",)),
    )


def _try_parse_uuid(value):
    if not value:
        return None
    s = str(value).strip().replace("{", "").replace("}", "")
    try:
        return UUID(s)
    except ValueError:
        return None


def apply_batch_filters(query, model_cls, batch_filters):
    """Filter by batch GUID and/or legacy batch name values."""
    if not batch_filters:
        return query
    guids = []
    names = []
    for raw in batch_filters:
        if not raw:
            continue
        uid = _try_parse_uuid(raw)
        if uid is not None:
            guids.append(uid)
        else:
            names.append(raw)
    parts = []
    if guids:
        parts.append(model_cls.batch_guid.in_(guids))
    if names:
        parts.append(model_cls.batch_name.in_(names))
    if not parts:
        return query
    if len(parts) == 1:
        return query.filter(parts[0])
    return query.filter(or_(*parts))


def _encode_cursor(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_cursor(token: str) -> Optional[dict]:
    if not token or not isinstance(token, str):
        return None
    pad = "=" * (-len(token) % 4)
    try:
        raw = base64.urlsafe_b64decode(token + pad)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def parse_cursor_token(request_args):
    """Single opaque cursor from ?cursor= (base64 JSON)."""
    return _decode_cursor(request_args.get("cursor") or "")


def build_next_cursor_asc(transfer_time, batch_guid, order_id, material_name, batch_act_start):
    """Cursor for batch_transfer_time ASC + PK tie-break (for /kpi)."""
    payload = {
        "btt": transfer_time.isoformat() if transfer_time else None,
        "bg": str(batch_guid) if batch_guid else None,
        "oid": int(order_id) if order_id is not None else None,
        "mn": material_name,
        "bas": batch_act_start.isoformat() if batch_act_start else None,
    }
    return _encode_cursor(payload)


def build_next_cursor_act_start_asc(batch_act_start, batch_guid, order_id, material_name, pobjid=None):
    """Cursor for batch_act_start ASC + PK tie-break (for /reports KPI)."""
    payload = {
        "bas": batch_act_start.isoformat() if batch_act_start else None,
        "bg": str(batch_guid) if batch_guid else None,
        "oid": int(order_id) if order_id is not None else None,
        "mn": material_name,
        "pobjid": int(pobjid) if pobjid is not None else 0,
    }
    return _encode_cursor(payload)


def build_next_cursor_transfer_desc(transfer_time, batch_guid, order_id, material_name, batch_act_start):
    """Cursor for batch_transfer_time DESC (for /kpi/csv-format-report): seek rows 'before' this row."""
    payload = {
        "btt": transfer_time.isoformat() if transfer_time else None,
        "bg": str(batch_guid) if batch_guid else None,
        "oid": int(order_id) if order_id is not None else None,
        "mn": material_name,
        "bas": batch_act_start.isoformat() if batch_act_start else None,
        "d": 1,
    }
    return _encode_cursor(payload)


def _parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        dt = datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
    # DB columns are naive UTC — strip tz so keyset equality matches ORDER BY rows.
    if dt.tzinfo is not None:
        from datetime import timezone
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _mn(model_cls):
    """Comparable material name with NULL as empty string for ordering."""
    return func.coalesce(model_cls.material_name, "")


def _pobjid(model_cls):
    """Comparable POBJID with NULL as 0 (matches PK / duplicate material lines)."""
    return func.coalesce(model_cls.pobjid, 0)


def order_by_act_start_asc(model_cls):
    """
    Stable ASC order for /api/reports keyset pagination.
    Must match keyset_filter_act_start_asc / build_next_cursor_act_start_asc columns.
    """
    return (
        model_cls.batch_act_start.asc(),
        model_cls.batch_guid.asc(),
        model_cls.order_id.asc(),
        _mn(model_cls).asc(),
        _pobjid(model_cls).asc(),
    )


def order_by_transfer_time_asc(model_cls):
    """Stable ASC order for /api/kpi keyset pagination."""
    return (
        model_cls.batch_transfer_time.asc(),
        model_cls.batch_guid.asc(),
        model_cls.order_id.asc(),
        _mn(model_cls).asc(),
        model_cls.batch_act_start.asc(),
    )


def order_by_transfer_time_desc(model_cls):
    """Stable DESC order for /api/kpi/csv-format-report keyset pagination."""
    return (
        model_cls.batch_transfer_time.desc(),
        model_cls.batch_guid.desc(),
        model_cls.order_id.desc(),
        _mn(model_cls).desc(),
        model_cls.batch_act_start.desc(),
    )


def keyset_filter_transfer_time_asc(model_cls, cursor: dict):
    """
    Rows strictly after cursor (batch_transfer_time ASC, then Batch GUID, OrderId, Material Name, Batch Act Start).
    """
    if not cursor or "btt" not in cursor:
        return None
    btt = _parse_dt(cursor.get("btt"))
    bg = cursor.get("bg")
    oid = cursor.get("oid")
    mn = cursor.get("mn") or ""
    bas = _parse_dt(cursor.get("bas"))
    if btt is None:
        return None
    try:
        guid = UUID(bg) if bg else None
    except Exception:
        guid = None
    if guid is None or oid is None:
        return None
    M = model_cls
    mn_col = _mn(M)
    parts = [
        M.batch_transfer_time > btt,
        and_(M.batch_transfer_time == btt, M.batch_guid > guid),
        and_(M.batch_transfer_time == btt, M.batch_guid == guid, M.order_id > oid),
        and_(
            M.batch_transfer_time == btt,
            M.batch_guid == guid,
            M.order_id == oid,
            mn_col > mn,
        ),
    ]
    if bas is not None:
        parts.append(
            and_(
                M.batch_transfer_time == btt,
                M.batch_guid == guid,
                M.order_id == oid,
                mn_col == mn,
                M.batch_act_start > bas,
            )
        )
    return or_(*parts)


def keyset_filter_act_start_asc(model_cls, cursor: dict):
    """Rows after cursor for batch_act_start ASC + PK (includes POBJID for duplicate material lines)."""
    if not cursor or "bas" not in cursor:
        return None
    bas_c = _parse_dt(cursor.get("bas"))
    bg = cursor.get("bg")
    oid = cursor.get("oid")
    mn = cursor.get("mn") or ""
    try:
        pobjid = int(cursor.get("pobjid") or 0)
    except (TypeError, ValueError):
        pobjid = 0
    if bas_c is None:
        return None
    try:
        guid = UUID(bg) if bg else None
    except Exception:
        guid = None
    if guid is None or oid is None:
        return None
    M = model_cls
    mn_col = _mn(M)
    pobj_col = _pobjid(M)
    return or_(
        M.batch_act_start > bas_c,
        and_(M.batch_act_start == bas_c, M.batch_guid > guid),
        and_(M.batch_act_start == bas_c, M.batch_guid == guid, M.order_id > oid),
        and_(M.batch_act_start == bas_c, M.batch_guid == guid, M.order_id == oid, mn_col > mn),
        and_(
            M.batch_act_start == bas_c,
            M.batch_guid == guid,
            M.order_id == oid,
            mn_col == mn,
            pobj_col > pobjid,
        ),
    )


def keyset_filter_transfer_time_desc(model_cls, cursor: dict):
    """Rows strictly 'before' cursor row in DESC order (next page = older rows)."""
    if not cursor or cursor.get("d") != 1:
        return None
    btt = _parse_dt(cursor.get("btt"))
    bg = cursor.get("bg")
    oid = cursor.get("oid")
    mn = cursor.get("mn") or ""
    bas = _parse_dt(cursor.get("bas"))
    if btt is None:
        return None
    try:
        guid = UUID(bg) if bg else None
    except Exception:
        guid = None
    if guid is None or oid is None:
        return None
    M = model_cls
    mn_col = _mn(M)
    parts = [
        M.batch_transfer_time < btt,
        and_(M.batch_transfer_time == btt, M.batch_guid < guid),
        and_(M.batch_transfer_time == btt, M.batch_guid == guid, M.order_id < oid),
        and_(
            M.batch_transfer_time == btt,
            M.batch_guid == guid,
            M.order_id == oid,
            mn_col < mn,
        ),
    ]
    if bas is not None:
        parts.append(
            and_(
                M.batch_transfer_time == btt,
                M.batch_guid == guid,
                M.order_id == oid,
                mn_col == mn,
                M.batch_act_start < bas,
            )
        )
    return or_(*parts)

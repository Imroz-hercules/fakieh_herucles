from flask import Blueprint, request, jsonify
from config import SQLSERVER_BATCH_MATERIALS_TABLE
from models import db
from models.kpi_material import KPIMaterial
from datetime import datetime
from sqlalchemy import func, text
import traceback
import logging

from utils.dashboard_kpi_stream import build_dashboard_payload
from utils.timezone import format_db_datetime_utc_iso, parse_request_datetime, parse_request_datetime_optional
from utils.kpi_pagination import (
    clamp_kpi_limit,
    parse_include_total,
    product_not_selected_clause,
    apply_batch_filters,
    parse_cursor_token,
    keyset_filter_transfer_time_asc,
    keyset_filter_act_start_asc,
    keyset_filter_transfer_time_desc,
    build_next_cursor_asc,
    build_next_cursor_act_start_asc,
    build_next_cursor_transfer_desc,
    order_by_act_start_asc,
    order_by_transfer_time_asc,
    order_by_transfer_time_desc,
)

kpi_material_bp = Blueprint("kpi_material", __name__)
logger = logging.getLogger(__name__)

"""
KPI list API:
- limit: clamped to env KPI_MAX_LIMIT (default 10000); default page size KPI_DEFAULT_LIMIT (default 5000).
- includeTotal: true (default) = full count + pages; false = skip COUNT, return has_more (fetches limit+1 rows).
- cursor: opaque token from previous response nextCursor (keyset). When set, page is ignored.

IMPORTANT: Queries use with_entities() (Core rows), not full ORM entities.
Many BatchMaterials rows have NULL POBJID; the mapped PK collapses those identities so
entity .all() returns far fewer objects than SQL rows and has_more becomes false too early
(Monthly truncated ~5k of ~33k). Tuple/Row results keep every material line.
"""

# Columns returned for list endpoints (avoids ORM identity-map collapse on NULL POBJID).
_KPI_LIST_COLS = (
    KPIMaterial.source_server,
    KPIMaterial.batch_guid,
    KPIMaterial.rootguid,
    KPIMaterial.order_id,
    KPIMaterial.batch_name,
    KPIMaterial.product_name,
    KPIMaterial.product_code,
    KPIMaterial.batch_act_start,
    KPIMaterial.batch_act_end,
    KPIMaterial.batch_transfer_time,
    KPIMaterial.quantity,
    KPIMaterial.material_name,
    KPIMaterial.material_code,
    KPIMaterial.setpoint_float,
    KPIMaterial.actual_value_float,
    KPIMaterial.formula_category_name,
    KPIMaterial.pobjid,
)


def _as_entities_query(query):
    """Project to column tuples so duplicate/NULL-PK rows are not collapsed by the identity map."""
    return query.with_entities(*_KPI_LIST_COLS)


def _row_to_kpi_dict(mat, include_event_id=False):
    """Accept ORM instance or with_entities Row (attribute access)."""
    batch_guid = getattr(mat, "batch_guid", None)
    order_id = getattr(mat, "order_id", None)
    material_name = getattr(mat, "material_name", None)
    row = {
        "Batch GUID": str(batch_guid) if batch_guid is not None else None,
        "Batch Name": getattr(mat, "batch_name", None),
        "Product Name": getattr(mat, "product_name", None),
        "ProductCode": getattr(mat, "product_code", None),
        "Batch Act Start": format_db_datetime_utc_iso(getattr(mat, "batch_act_start", None)),
        "Batch Act End": format_db_datetime_utc_iso(getattr(mat, "batch_act_end", None)),
        "Quantity": getattr(mat, "quantity", None),
        "Material Name": material_name,
        "Material Code": getattr(mat, "material_code", None),
        "SetPoint Float": getattr(mat, "setpoint_float", None),
        "Actual Value Float": getattr(mat, "actual_value_float", None),
        "Source Server": getattr(mat, "source_server", None),
        "ROOTGUID": (
            str(getattr(mat, "rootguid", None))
            if getattr(mat, "rootguid", None) is not None
            else None
        ),
        "OrderId": order_id,
        "Batch Transfer Time": format_db_datetime_utc_iso(
            getattr(mat, "batch_transfer_time", None)
        ),
        "FormulaCategoryName": getattr(mat, "formula_category_name", None),
        "POBJID": getattr(mat, "pobjid", None),
    }
    if include_event_id:
        row["EventID"] = (
            f"{str(batch_guid) if batch_guid else ''}_{order_id}_{material_name or ''}"
            if (batch_guid or material_name)
            else None
        )
    return row


def _paginate_kpi_query(query, page, limit, include_total, order_cols_for_keyset_last_row):
    """
    order_cols_for_keyset_last_row: callable(last_row) -> opaque nextCursor string or None.
    Returns (items, payload_dict) where payload has page/pages/total OR has_more.
    Query must already use with_entities() for correct row counts.
    """
    if include_total:
        # paginate() on with_entities can be unreliable — use count + slice
        total = query.order_by(None).count()
        offset = max(0, (page - 1) * limit)
        items = query.limit(limit).offset(offset).all()
        pages = max(1, (total + limit - 1) // limit) if limit else 1
        has_more = page < pages
        next_c = (
            order_cols_for_keyset_last_row(items[-1])
            if (items and has_more)
            else None
        )
        return items, {
            "page": page,
            "pages": pages,
            "total": total,
            "has_more": has_more,
            "nextCursor": next_c,
        }
    # No COUNT: limit+1 rows from offset by page
    offset = max(0, (page - 1) * limit)
    rows = query.limit(limit + 1).offset(offset).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    next_c = order_cols_for_keyset_last_row(items[-1]) if items else None
    return items, {
        "page": page,
        "pages": None,
        "total": None,
        "has_more": has_more,
        "nextCursor": next_c if has_more and items else None,
    }

# 🟢 Route to Get All KPI Data (BatchMaterials via SQL Server bind)
@kpi_material_bp.route("/kpi", methods=["GET"])
def get_kpis():
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        batch_filters = request.args.getlist("batch")
        product_filters = request.args.getlist("product")
        material_filters = request.args.getlist("material")
        page = request.args.get("page", default=1, type=int)
        limit = clamp_kpi_limit(request.args.get("limit", type=int))
        include_total = parse_include_total(request.args)
        cur = parse_cursor_token(request.args) or {}
        raw_cursor = request.args.get("cursor")

        date_filter = []
        if start_date_str and end_date_str:
            start_date, end_date = parse_request_datetime_optional(start_date_str, end_date_str)
            # Use batch_transfer_time for date filter (same as Raw Data / csv-format-report) so Historical shows same batches
            date_filter = [KPIMaterial.batch_transfer_time >= start_date, KPIMaterial.batch_transfer_time <= end_date]

        query = KPIMaterial.query
        if date_filter:
            query = query.filter(*date_filter)
        if batch_filters:
            query = apply_batch_filters(query, KPIMaterial, batch_filters)
        if product_filters:
            query = query.filter(KPIMaterial.product_name.in_(product_filters))
        if material_filters:
            query = query.filter(KPIMaterial.material_name.in_(material_filters))

        query = query.filter(product_not_selected_clause(KPIMaterial))
        query = query.order_by(*order_by_transfer_time_asc(KPIMaterial))
        query = _as_entities_query(query)

        if raw_cursor:
            ks = keyset_filter_transfer_time_asc(KPIMaterial, cur)
            if ks is None:
                return jsonify({"error": "Invalid cursor"}), 400
            query = query.filter(ks)

        def _next_cur(last):
            if last is None:
                return None
            return build_next_cursor_asc(
                last.batch_transfer_time,
                last.batch_guid,
                last.order_id,
                last.material_name,
                last.batch_act_start,
            )

        if raw_cursor:
            rows = query.limit(limit + 1).all()
            has_more = len(rows) > limit
            materials = rows[:limit]
            meta = {
                "page": 1,
                "pages": None,
                "total": None,
                "has_more": has_more,
                "nextCursor": _next_cur(materials[-1]) if has_more and materials else None,
            }
        elif include_total:
            materials, meta = _paginate_kpi_query(query, page, limit, True, _next_cur)
        else:
            materials, meta = _paginate_kpi_query(query, page, limit, False, _next_cur)

        kpi_list = [_row_to_kpi_dict(m) for m in materials]

        out = {"data": kpi_list, **meta}
        return jsonify(out), 200

    except Exception as e:
        # Debug: log full traceback so exact error is visible in terminal
        logger.exception("GET /api/kpi failed: %s", e)
        traceback.print_exc()
        return jsonify({
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc()
        }), 500


# 🟢 Route to Get Report Data
@kpi_material_bp.route("/reports", methods=["GET"])
def get_reports():
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        report_type = request.args.get("reportType", default="daily")
        batch_filters = request.args.getlist("batch")
        product_filters = request.args.getlist("product")
        material_filters = request.args.getlist("material")
        page = request.args.get("page", default=1, type=int)
        limit = clamp_kpi_limit(request.args.get("limit", type=int))
        include_total = parse_include_total(request.args)
        cur = parse_cursor_token(request.args) or {}
        raw_cursor = request.args.get("cursor")

        if not start_date_str or not end_date_str:
            return jsonify({"error": "Start date and end date are required"}), 400

        start_date, end_date = parse_request_datetime_optional(start_date_str, end_date_str)

        # Half-open [start, end) — matches Batch Calendar / production-day windows
        query = KPIMaterial.query.filter(
            KPIMaterial.batch_act_start >= start_date,
            KPIMaterial.batch_act_start < end_date,
        )
        if batch_filters:
            query = apply_batch_filters(query, KPIMaterial, batch_filters)
        if product_filters:
            query = query.filter(KPIMaterial.product_name.in_(product_filters))
        if material_filters:
            query = query.filter(KPIMaterial.material_name.in_(material_filters))

        query = query.filter(product_not_selected_clause(KPIMaterial))
        # Stable order must match keyset cursor (bas, guid, oid, material, pobjid)
        # or multi-page Monthly fetches truncate after the first ~10k rows.
        query = query.order_by(*order_by_act_start_asc(KPIMaterial))
        # Bypass ORM identity map (NULL POBJID collapses entity rows / has_more).
        query = _as_entities_query(query)

        if raw_cursor:
            ks = keyset_filter_act_start_asc(KPIMaterial, cur)
            if ks is None:
                return jsonify({"error": "Invalid cursor"}), 400
            query = query.filter(ks)

        def _next_cur_r(last):
            if last is None:
                return None
            return build_next_cursor_act_start_asc(
                last.batch_act_start,
                last.batch_guid,
                last.order_id,
                last.material_name,
                getattr(last, "pobjid", None),
            )

        if raw_cursor:
            rows = query.limit(limit + 1).all()
            has_more = len(rows) > limit
            materials = rows[:limit]
            meta = {
                "page": 1,
                "pages": None,
                "total": None,
                "has_more": has_more,
                "nextCursor": _next_cur_r(materials[-1]) if has_more and materials else None,
            }
        elif include_total:
            materials, meta = _paginate_kpi_query(query, page, limit, True, _next_cur_r)
        else:
            materials, meta = _paginate_kpi_query(query, page, limit, False, _next_cur_r)

        kpi_list = [_row_to_kpi_dict(m) for m in materials]

        return jsonify({"data": kpi_list, "reportType": report_type, **meta}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 🟢 Product summary (SQL aggregates — same window/math as Batch Calendar)
@kpi_material_bp.route("/reports/product-summary", methods=["GET"])
def get_reports_product_summary():
    """Per-product batch counts and SP/ACT sums via SQL (no pagination truncation).

    Uses half-open [start, end) on Batch Act Start — same as /kpi_calendar.
    """
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        batch_filters = request.args.getlist("batch")
        product_filters = request.args.getlist("product")
        material_filters = request.args.getlist("material")

        if not start_date_str or not end_date_str:
            return jsonify({"error": "Start date and end date are required"}), 400

        start_date, end_date = parse_request_datetime_optional(start_date_str, end_date_str)
        if start_date is None or end_date is None:
            return jsonify({"error": "Invalid startDate or endDate"}), 400

        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        where = [
            f"dbo.[{tbl}].[Batch Act Start] >= :start_date",
            f"dbo.[{tbl}].[Batch Act Start] < :end_date",
            f"LOWER(LTRIM(RTRIM(dbo.[{tbl}].[Product Name]))) <> 'not selected'",
            f"dbo.[{tbl}].[Product Name] IS NOT NULL",
            f"LTRIM(RTRIM(dbo.[{tbl}].[Product Name])) <> ''",
        ]
        bind = {"start_date": start_date, "end_date": end_date}

        if product_filters:
            placeholders = []
            for i, name in enumerate(product_filters):
                key = f"prod_{i}"
                placeholders.append(f":{key}")
                bind[key] = name
            where.append(f"dbo.[{tbl}].[Product Name] IN ({', '.join(placeholders)})")

        if material_filters:
            placeholders = []
            for i, name in enumerate(material_filters):
                key = f"mat_{i}"
                placeholders.append(f":{key}")
                bind[key] = name
            where.append(f"dbo.[{tbl}].[Material Name] IN ({', '.join(placeholders)})")

        if batch_filters:
            guid_keys = []
            name_keys = []
            for i, raw in enumerate(batch_filters):
                if not raw:
                    continue
                s = str(raw).strip().replace("{", "").replace("}", "")
                try:
                    from uuid import UUID
                    UUID(s)
                    key = f"bg_{i}"
                    guid_keys.append(f":{key}")
                    bind[key] = s
                except ValueError:
                    key = f"bn_{i}"
                    name_keys.append(f":{key}")
                    bind[key] = raw
            parts = []
            if guid_keys:
                parts.append(f"CAST(dbo.[{tbl}].[Batch GUID] AS NVARCHAR(64)) IN ({', '.join(guid_keys)})")
            if name_keys:
                parts.append(f"dbo.[{tbl}].[Batch Name] IN ({', '.join(name_keys)})")
            if parts:
                where.append("(" + " OR ".join(parts) + ")")

        where_sql = " AND ".join(where)
        sql_products = text(
            f"""
            SELECT dbo.[{tbl}].[ProductCode] AS product_code,
                   dbo.[{tbl}].[Product Name] AS product_name,
                   COUNT(DISTINCT dbo.[{tbl}].[Batch GUID]) AS batch_count,
                   SUM(dbo.[{tbl}].[SetPoint Float]) AS sum_sp,
                   SUM(dbo.[{tbl}].[Actual Value Float]) AS sum_act
            FROM dbo.[{tbl}]
            WHERE {where_sql}
            GROUP BY dbo.[{tbl}].[ProductCode], dbo.[{tbl}].[Product Name]
            ORDER BY dbo.[{tbl}].[Product Name], dbo.[{tbl}].[ProductCode]
            """
        )
        sql_totals = text(
            f"""
            SELECT COUNT(DISTINCT dbo.[{tbl}].[Batch GUID]) AS batch_count,
                   SUM(dbo.[{tbl}].[SetPoint Float]) AS sum_sp,
                   SUM(dbo.[{tbl}].[Actual Value Float]) AS sum_act
            FROM dbo.[{tbl}]
            WHERE {where_sql}
            """
        )

        engine = db.get_engine(bind="sqlserver")
        with engine.connect() as conn:
            product_rows = conn.execute(sql_products, bind).fetchall()
            total_row = conn.execute(sql_totals, bind).fetchone()

        products = []
        for row in product_rows:
            sum_sp = float(row.sum_sp or 0)
            sum_act = float(row.sum_act or 0)
            err_kg = abs(sum_act - sum_sp)
            err_pct = (err_kg / sum_sp * 100) if sum_sp else 0.0
            products.append(
                {
                    "productCode": (row.product_code or "").strip() if row.product_code else "",
                    "productName": row.product_name,
                    "noOfBatches": int(row.batch_count or 0),
                    "sumSP": round(sum_sp, 2),
                    "sumAct": round(sum_act, 2),
                    "errKg": f"{err_kg:.2f}",
                    "errPercent": f"{err_pct:.2f}",
                }
            )

        tot_sp = float(total_row.sum_sp or 0) if total_row else 0.0
        tot_act = float(total_row.sum_act or 0) if total_row else 0.0
        tot_err = abs(tot_act - tot_sp)
        tot_pct = (tot_err / tot_sp * 100) if tot_sp else 0.0
        totals = {
            "noOfBatches": int(total_row.batch_count or 0) if total_row else 0,
            "sumSP": round(tot_sp, 2),
            "sumAct": round(tot_act, 2),
            "errKg": f"{tot_err:.2f}",
            "errPercent": f"{tot_pct:.2f}",
        }

        return jsonify({"products": products, "totals": totals}), 200

    except Exception as e:
        logger.exception("GET /api/reports/product-summary failed: %s", e)
        return jsonify({"error": str(e)}), 500


# 🟢 Route for CSV Format Report
@kpi_material_bp.route("/kpi/csv-format-report", methods=["GET"])
def get_kpi_csv_format_report():
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        batch_filters = request.args.getlist("batch")
        product_filters = request.args.getlist("product")
        material_filters = request.args.getlist("material")
        page = request.args.get("page", default=1, type=int)
        limit = clamp_kpi_limit(request.args.get("limit", type=int))
        include_total = parse_include_total(request.args)
        cur = parse_cursor_token(request.args) or {}
        raw_cursor = request.args.get("cursor")

        if not start_date_str or not end_date_str:
            return jsonify({"error": "startDate and endDate are required"}), 400

        start_date, end_date = parse_request_datetime_optional(start_date_str, end_date_str)

        query = KPIMaterial.query.filter(
            KPIMaterial.batch_transfer_time >= start_date,
            KPIMaterial.batch_transfer_time <= end_date,
            product_not_selected_clause(KPIMaterial),
        )
        if batch_filters:
            query = apply_batch_filters(query, KPIMaterial, batch_filters)
        if product_filters:
            query = query.filter(KPIMaterial.product_name.in_(product_filters))
        if material_filters:
            query = query.filter(KPIMaterial.material_name.in_(material_filters))

        query = query.order_by(*order_by_transfer_time_desc(KPIMaterial))
        query = _as_entities_query(query)

        if raw_cursor:
            ks = keyset_filter_transfer_time_desc(KPIMaterial, cur)
            if ks is None:
                return jsonify({"error": "Invalid cursor"}), 400
            query = query.filter(ks)

        def _next_cur_csv(last):
            if last is None:
                return None
            return build_next_cursor_transfer_desc(
                last.batch_transfer_time,
                last.batch_guid,
                last.order_id,
                last.material_name,
                last.batch_act_start,
            )

        if raw_cursor:
            rows = query.limit(limit + 1).all()
            has_more = len(rows) > limit
            materials = rows[:limit]
            meta = {
                "page": 1,
                "pages": None,
                "total": None,
                "has_more": has_more,
                "nextCursor": _next_cur_csv(materials[-1]) if has_more and materials else None,
            }
        elif include_total:
            materials, meta = _paginate_kpi_query(query, page, limit, True, _next_cur_csv)
        else:
            materials, meta = _paginate_kpi_query(query, page, limit, False, _next_cur_csv)

        report_data = [_row_to_kpi_dict(m, include_event_id=True) for m in materials]

        return jsonify({"data": report_data, **meta}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# 🟢 Route to Get All Available Filter Options
@kpi_material_bp.route("/filter-options", methods=["GET"])
def get_filter_options():
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")

        date_filter_sql = "1=1"
        bind = {}
        if start_date_str and end_date_str:
            start_date, end_date = parse_request_datetime_optional(start_date_str, end_date_str)
            date_filter_sql = "[Batch Transfer Time] >= :sd AND [Batch Transfer Time] <= :ed"
            bind["sd"] = start_date
            bind["ed"] = end_date

        base_where = f"""
            ({date_filter_sql})
            AND LOWER(LTRIM(RTRIM([Product Name]))) <> 'not selected'
        """
        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        products_sql = text(
            f"""
            SELECT DISTINCT CAST([Product Name] AS NVARCHAR(4000)) AS val
            FROM dbo.[{tbl}]
            WHERE {base_where}
              AND [Product Name] IS NOT NULL AND LTRIM(RTRIM([Product Name])) <> ''
            """
        )
        batches_sql = text(
            f"""
            SELECT DISTINCT
                CAST([Batch GUID] AS NVARCHAR(36)) AS batch_id,
                CAST([Batch Name] AS NVARCHAR(4000)) AS batch_name,
                CAST([Source Server] AS NVARCHAR(255)) AS source_server
            FROM dbo.[{tbl}]
            WHERE {base_where}
              AND [Batch GUID] IS NOT NULL
              AND [Batch Name] IS NOT NULL AND LTRIM(RTRIM([Batch Name])) <> ''
            """
        )
        materials_sql = text(
            f"""
            SELECT DISTINCT CAST([Material Name] AS NVARCHAR(4000)) AS val
            FROM dbo.[{tbl}]
            WHERE {base_where}
              AND [Material Name] IS NOT NULL AND LTRIM(RTRIM([Material Name])) <> ''
            """
        )
        engine = db.get_engine(bind="sqlserver")
        products, materials = set(), set()
        batch_rows = []
        with engine.connect() as conn:
            for row in conn.execute(products_sql, bind).fetchall():
                v = row._mapping.get("val", row[0])
                if v:
                    products.add(v)
            batch_rows = conn.execute(batches_sql, bind).fetchall()
            for row in conn.execute(materials_sql, bind).fetchall():
                v = row._mapping.get("val", row[0])
                if v:
                    materials.add(v)

        seen_labels = {}
        batch_options = []
        for row in batch_rows:
            m = row._mapping
            guid = str(m.get("batch_id", row[0])).strip()
            name = str(m.get("batch_name", row[1]) or "").strip()
            server = str(m.get("source_server", row[2] if len(row) > 2 else "") or "").strip()
            if not guid or not name:
                continue
            label = f"{name} ({server})" if server else name
            if label in seen_labels and seen_labels[label] != guid:
                label = f"{label} · {guid[:8]}"
            seen_labels[label] = guid
            batch_options.append({"value": guid, "label": label})
        batch_options.sort(key=lambda b: b["label"].lower())

        return jsonify(
            {
                "products": sorted(products),
                "batches": batch_options,
                "materials": sorted(materials),
            }
        ), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 🟢 Route to Get Dashboard KPI Analytics (Complete API for All Charts)
@kpi_material_bp.route("/kpi/dashboard-analytics", methods=["GET"])
def get_dashboard_analytics():
    """
    Comprehensive dashboard analytics endpoint that returns all chart data
    Supports filtering by date, batch, product, and material
    All data is real from database - no mock data
    """
    try:
        # Get filter parameters
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        batch_filters = request.args.getlist("batch")
        product_filters = request.args.getlist("product")
        material_filters = request.args.getlist("material")
        
        # Parse dates
        if not start_date_str or not end_date_str:
            return jsonify({"error": "Start date and end date are required"}), 400
        
        start_date, end_date = parse_request_datetime_optional(start_date_str, end_date_str)

        # Build base query with filters
        query = KPIMaterial.query.filter(
            KPIMaterial.batch_act_start >= start_date,
            KPIMaterial.batch_act_start <= end_date
        )
        
        if batch_filters:
            query = apply_batch_filters(query, KPIMaterial, batch_filters)
        if product_filters:
            query = query.filter(KPIMaterial.product_name.in_(product_filters))
        if material_filters:
            query = query.filter(KPIMaterial.material_name.in_(material_filters))
        
        query = query.filter(product_not_selected_clause(KPIMaterial))

        payload = build_dashboard_payload(
            query, start_date, end_date, batch_filters, product_filters, material_filters
        )
        if not payload:
            return jsonify(
                {
                    "success": False,
                    "error": "No data found for the given filters",
                    "filters": {
                        "startDate": start_date_str,
                        "endDate": end_date_str,
                        "batches": batch_filters,
                        "products": product_filters,
                        "materials": material_filters,
                    },
                }
            ), 404

        return jsonify(payload), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify(
            {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc(),
            }
        ), 500

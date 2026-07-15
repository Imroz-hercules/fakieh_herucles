"""Local, CSV-backed versions of the batch-reporting endpoints.

The real production endpoints (kpi_material_routes.py, kpi_calendar_routes.py)
query a live SQL Server table (BatchMaterials_Shadow). That table doesn't
exist on a laptop demo. This blueprint serves the SAME URL paths with the
SAME response shape, but reads from the bundled batch CSV instead — so the
already-built Batch Calendar / Raw Data / Historical Reports pages work
with zero frontend changes.

Registered only in run_ai_demo.py (the local demo runner) — NOT in the real
app.py, so production behavior against the real SQL Server is untouched.

Each row is also enriched with "Predicted Risk %" and "Predicted Severity"
from the two trained ML models (computed from material/product/setpoint/
quantity only — never from the row's own Actual Value, so it's a genuine
a-priori prediction, not a reformatted fact).
"""

from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, request

from ai_assistant.raw_rows import load_raw_rows
from ai_assistant.ml import predictor, predictor_severity

local_batch_bp = Blueprint("local_batch_bp", __name__)

_NOT_SELECTED = "not selected"


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.strptime(value.strip(), "%Y-%m-%d")
        except ValueError:
            return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(tz=None).replace(tzinfo=None)
    return dt


def _is_selected(row: dict) -> bool:
    return (row.get("Product Name") or "").strip().lower() != _NOT_SELECTED


def _strip_internal(row: dict) -> dict:
    out = dict(row)
    out.pop("_start_dt", None)
    out.pop("_end_dt", None)
    out.pop("_transfer_dt", None)
    return out


def _with_predictions_batch(rows: list[dict]) -> list[dict]:
    """Attach Predicted Risk / Predicted Severity to a page of rows.

    Vectorized (one model call for the whole page) -- calling predict() per
    row was the original approach and took ~46s for ~1000 rows; this is the
    fix, not a workaround. Only call this where the columns are actually
    displayed (the Raw Data table) -- other endpoints like /api/kpi feed
    client-side aggregation and don't need per-row predictions at all.
    """
    inputs = [
        {
            "material_code": r.get("Material Code"),
            "product_name": r.get("Product Name"),
            "setpoint": r.get("SetPoint Float"),
            "quantity": r.get("Quantity"),
            "category": r.get("FormulaCategoryName"),
        }
        for r in rows
    ]
    risks = predictor.predict_batch(inputs)
    sevs = predictor_severity.predict_batch(inputs)

    out = []
    for row, risk, sev in zip(rows, risks, sevs):
        d = _strip_internal(row)
        d["Predicted Risk"] = f"{risk['risk_pct']}% ({risk['band']})" if risk else "-"
        d["Predicted Severity"] = sev["severity_label"] if sev else "-"
        out.append(d)
    return out


def _apply_common_filters(rows, batch_filters, product_filters, material_filters):
    if product_filters:
        rows = [r for r in rows if r["Product Name"] in product_filters]
    if material_filters:
        rows = [r for r in rows if r["Material Name"] in material_filters]
    if batch_filters:
        bf = set(batch_filters)
        rows = [r for r in rows if r["Batch GUID"] in bf or r["Batch Name"] in bf]
    return rows


def _paginate(rows, page, limit, include_total):
    total = len(rows)
    offset = max(0, (page - 1) * limit)
    page_rows = rows[offset : offset + limit]
    if include_total:
        pages = max(1, (total + limit - 1) // limit) if limit else 1
        has_more = page < pages
        meta = {"page": page, "pages": pages, "total": total, "has_more": has_more, "nextCursor": None}
    else:
        has_more = offset + limit < total
        meta = {"page": page, "pages": None, "total": None, "has_more": has_more, "nextCursor": None}
    return page_rows, meta


def _list_params():
    start = _parse_iso(request.args.get("startDate"))
    end = _parse_iso(request.args.get("endDate"))
    batch_filters = request.args.getlist("batch")
    product_filters = request.args.getlist("product")
    material_filters = request.args.getlist("material")
    page = request.args.get("page", default=1, type=int)
    limit = request.args.get("limit", default=5000, type=int)
    limit = max(1, min(limit, 10000))
    include_total = request.args.get("includeTotal", default="true").lower() != "false"
    return start, end, batch_filters, product_filters, material_filters, page, limit, include_total


@local_batch_bp.route("/api/kpi", methods=["GET"])
def get_kpi_local():
    try:
        start, end, batch_f, product_f, material_f, page, limit, include_total = _list_params()
        rows = [r for r in load_raw_rows() if _is_selected(r)]
        if start and end:
            rows = [r for r in rows if r["_transfer_dt"] and start <= r["_transfer_dt"] <= end]
        rows = _apply_common_filters(rows, batch_f, product_f, material_f)
        rows.sort(key=lambda r: r["_transfer_dt"] or datetime.min)
        page_rows, meta = _paginate(rows, page, limit, include_total)
        # No ML predictions here -- /api/kpi feeds client-side aggregation
        # (Product Batch Summary), which never renders a per-row prediction.
        return jsonify({"data": [_strip_internal(r) for r in page_rows], **meta}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@local_batch_bp.route("/api/kpi/csv-format-report", methods=["GET"])
def get_kpi_csv_format_report_local():
    try:
        start, end, batch_f, product_f, material_f, page, limit, include_total = _list_params()
        rows = [r for r in load_raw_rows() if _is_selected(r)]
        if start and end:
            rows = [r for r in rows if r["_transfer_dt"] and start <= r["_transfer_dt"] <= end]
        rows = _apply_common_filters(rows, batch_f, product_f, material_f)
        rows.sort(key=lambda r: r["_transfer_dt"] or datetime.min, reverse=True)
        page_rows, meta = _paginate(rows, page, limit, include_total)

        out_rows = _with_predictions_batch(page_rows)  # this endpoint's table shows the columns
        for r, d in zip(page_rows, out_rows):
            guid = r.get("Batch GUID") or ""
            oid = r.get("OrderId") or ""
            mat = r.get("Material Name") or ""
            d["EventID"] = f"{guid}_{oid}_{mat}" if (guid or mat) else None

        return jsonify({"data": out_rows, **meta}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@local_batch_bp.route("/api/filter-options", methods=["GET"])
def get_filter_options_local():
    try:
        start = _parse_iso(request.args.get("startDate"))
        end = _parse_iso(request.args.get("endDate"))
        rows = [r for r in load_raw_rows() if _is_selected(r)]
        if start and end:
            rows = [r for r in rows if r["_transfer_dt"] and start <= r["_transfer_dt"] <= end]

        products = sorted({r["Product Name"] for r in rows if r["Product Name"]})
        materials = sorted({r["Material Name"] for r in rows if r["Material Name"]})

        seen_labels: dict[str, str] = {}
        batch_options = []
        seen_guids = set()
        for r in rows:
            guid = r.get("Batch GUID") or ""
            name = r.get("Batch Name") or ""
            server = r.get("Source Server") or ""
            if not guid or not name or guid in seen_guids:
                continue
            seen_guids.add(guid)
            label = f"{name} ({server})" if server else name
            if label in seen_labels and seen_labels[label] != guid:
                label = f"{label} · {guid[:8]}"
            seen_labels[label] = guid
            batch_options.append({"value": guid, "label": label})
        batch_options.sort(key=lambda b: b["label"].lower())

        return jsonify({"products": products, "batches": batch_options, "materials": materials}), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@local_batch_bp.route("/api/kpi_calendar", methods=["GET"])
def get_kpi_calendar_local():
    try:
        start = _parse_iso(request.args.get("startDate"))
        end = _parse_iso(request.args.get("endDate"))
        if not start or not end:
            return jsonify({"error": "Start date and end date are required"}), 400

        rows = [
            r for r in load_raw_rows()
            if _is_selected(r) and r["_start_dt"] and start <= r["_start_dt"] <= end
        ]

        by_date: dict[str, dict] = {}
        for r in rows:
            key = r["_start_dt"].date().isoformat()
            bucket = by_date.setdefault(key, {"total_actual": 0.0, "batches": set(), "products": set()})
            bucket["total_actual"] += r.get("Actual Value Float") or 0.0
            bucket["batches"].add(r.get("Batch GUID"))
            bucket["products"].add(r.get("Product Name"))

        data = [
            {
                "date": d,
                "total_actual_kg": round(b["total_actual"], 1),
                "total_actual_ton": round(b["total_actual"] / 1000, 3),
                "batch_count": len(b["batches"]),
                "product_count": len(b["products"]),
            }
            for d, b in sorted(by_date.items())
        ]
        return jsonify(data), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@local_batch_bp.route("/api/kpi_calendar/details", methods=["GET"])
def get_kpi_calendar_details_local():
    try:
        date_str = request.args.get("date")
        if not date_str:
            return jsonify({"error": "Date is required"}), 400
        target = _parse_iso(date_str)
        if not target:
            return jsonify({"error": "Invalid date"}), 400
        target_date = target.date()

        rows = [
            r for r in load_raw_rows()
            if _is_selected(r) and r["_start_dt"] and r["_start_dt"].date() == target_date
        ]
        by_product: dict[str, float] = {}
        for r in rows:
            name = r.get("Product Name") or ""
            by_product[name] = by_product.get(name, 0.0) + (r.get("Actual Value Float") or 0.0)

        details = [
            {"product_name": name, "quantity_kg": round(qty, 1)}
            for name, qty in sorted(by_product.items(), key=lambda kv: -kv[1])
        ]
        return jsonify(details), 200
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

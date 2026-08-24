"""Batch calendar aggregates from SQL Server batch materials table.

Days are Saudi production days: 07:00 AST → next day 07:00 AST
(equivalent to CAST(DATEADD(hour, -4, [Batch Act Start]) AS DATE) on UTC columns).
"""
from flask import Blueprint, request, jsonify
from models import db
from sqlalchemy import text

from config import SQLSERVER_BATCH_MATERIALS_TABLE
from utils.timezone import (
    PRODUCTION_DAY_UTC_OFFSET_HOURS,
    parse_calendar_range,
    production_day_bounds_utc,
)

kpi_calendar_bp = Blueprint("kpi_calendar", __name__)


def _fetchall(sql: str, bind: dict):
    engine = db.get_engine(bind="sqlserver")
    with engine.connect() as conn:
        return conn.execute(text(sql), bind).fetchall()


@kpi_calendar_bp.route("/kpi_calendar", methods=["GET"])
def get_kpi_calendar():
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        if not start_date_str or not end_date_str:
            return jsonify({"error": "Start date and end date are required"}), 400

        start_date, end_date = parse_calendar_range(start_date_str, end_date_str)

        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        # Production-day label: shift UTC by -4h so 07:00 AST aligns to midnight boundary
        prod_day = (
            f"CAST(DATEADD(hour, {PRODUCTION_DAY_UTC_OFFSET_HOURS}, "
            f"dbo.[{tbl}].[Batch Act Start]) AS DATE)"
        )
        sql_query = f"""
        SELECT {prod_day} AS date,
               sum(dbo.[{tbl}].[Actual Value Float]) AS total_actual,
               count(distinct(dbo.[{tbl}].[Batch GUID])) AS batch_count,
               count(distinct(dbo.[{tbl}].[Product Name])) AS product_count
        FROM dbo.[{tbl}]
        WHERE dbo.[{tbl}].[Batch Act Start] >= :start_date
          AND dbo.[{tbl}].[Batch Act Start] < :end_date
          AND lower(dbo.[{tbl}].[Product Name]) != 'not selected'
        GROUP BY {prod_day}
        ORDER BY {prod_day}
        """

        rows = _fetchall(sql_query, {"start_date": start_date, "end_date": end_date})

        data = [
            {
                "date": str(row.date),
                "total_actual_kg": float(row.total_actual or 0),
                "total_actual_ton": float(row.total_actual or 0) / 1000,
                "batch_count": int(row.batch_count),
                "product_count": int(row.product_count),
            }
            for row in rows
        ]
        return jsonify(data), 200

    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@kpi_calendar_bp.route("/kpi_calendar/details", methods=["GET"])
def get_kpi_calendar_details():
    try:
        date_str = request.args.get("date")
        if not date_str:
            return jsonify({"error": "Date is required"}), 400

        start_utc, end_utc = production_day_bounds_utc(date_str)

        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        sql_query = f"""
        SELECT dbo.[{tbl}].[ProductCode] as product_code,
               dbo.[{tbl}].[Product Name] as product_name,
               COUNT(DISTINCT dbo.[{tbl}].[Batch GUID]) as batch_count,
               SUM(dbo.[{tbl}].[SetPoint Float]) as sum_sp,
               SUM(dbo.[{tbl}].[Actual Value Float]) as quantity_kg
        FROM dbo.[{tbl}]
        WHERE dbo.[{tbl}].[Batch Act Start] >= :start_date
          AND dbo.[{tbl}].[Batch Act Start] < :end_date
          AND lower(dbo.[{tbl}].[Product Name]) != 'not selected'
        GROUP BY dbo.[{tbl}].[ProductCode], dbo.[{tbl}].[Product Name]
        ORDER BY quantity_kg DESC
        """

        rows = _fetchall(sql_query, {"start_date": start_utc, "end_date": end_utc})

        details = [
            {
                "product_code": (row.product_code or "").strip() if row.product_code else "",
                "product_name": row.product_name,
                "batch_count": int(row.batch_count or 0),
                "sum_sp": float(row.sum_sp or 0),
                "quantity_kg": float(row.quantity_kg or 0),
            }
            for row in rows
        ]

        return jsonify(details), 200

    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@kpi_calendar_bp.route("/kpi_calendar/product-summary", methods=["GET"])
def get_kpi_calendar_product_summary():
    """Per-product aggregates for a datetime window — same filters as Batch Calendar cards."""
    try:
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")
        if not start_date_str or not end_date_str:
            return jsonify({"error": "Start date and end date are required"}), 400

        start_date, end_date = parse_calendar_range(start_date_str, end_date_str)
        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        # Match calendar: only exclude literal 'not selected' (same as /kpi_calendar)
        where_sql = f"""
            dbo.[{tbl}].[Batch Act Start] >= :start_date
            AND dbo.[{tbl}].[Batch Act Start] < :end_date
            AND lower(dbo.[{tbl}].[Product Name]) != 'not selected'
        """
        bind = {"start_date": start_date, "end_date": end_date}

        product_filters = request.args.getlist("product")
        material_filters = request.args.getlist("material")
        if product_filters:
            keys = []
            for i, name in enumerate(product_filters):
                k = f"prod_{i}"
                keys.append(f":{k}")
                bind[k] = name
            where_sql += f" AND dbo.[{tbl}].[Product Name] IN ({', '.join(keys)})"
        if material_filters:
            keys = []
            for i, name in enumerate(material_filters):
                k = f"mat_{i}"
                keys.append(f":{k}")
                bind[k] = name
            where_sql += f" AND dbo.[{tbl}].[Material Name] IN ({', '.join(keys)})"

        sql_products = f"""
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
        sql_totals = f"""
        SELECT COUNT(DISTINCT dbo.[{tbl}].[Batch GUID]) AS batch_count,
               SUM(dbo.[{tbl}].[SetPoint Float]) AS sum_sp,
               SUM(dbo.[{tbl}].[Actual Value Float]) AS sum_act
        FROM dbo.[{tbl}]
        WHERE {where_sql}
        """

        product_rows = _fetchall(sql_products, bind)
        total_rows = _fetchall(sql_totals, bind)
        total_row = total_rows[0] if total_rows else None

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
        import traceback

        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

from datetime import datetime

from flask import Blueprint, jsonify, request
from sqlalchemy import text
import logging

from config import SQLSERVER_BATCH_MATERIALS_TABLE, SQLSERVER_DATABASE
from models import db
from utils.timezone import format_db_datetime_utc_iso, parse_request_datetime

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

sqlserver_bp = Blueprint("sqlserver", __name__)


def _sqlserver_engine():
    return db.get_engine(bind="sqlserver")


def _row_to_dict(row, columns):
    d = {}
    for i, column in enumerate(columns):
        value = row[i]
        if hasattr(value, "isoformat"):
            if column in ("Batch Act Start", "Batch Act End", "Batch Transfer Time"):
                value = format_db_datetime_utc_iso(value) if value is not None else None
            else:
                value = value.isoformat()
        d[column] = value
    return d


@sqlserver_bp.route("/api/sqlserver/test-connection", methods=["GET"])
def test_sqlserver_connection():
    try:
        sqlserver_engine = _sqlserver_engine()
        with sqlserver_engine.connect() as connection:
            result = connection.execute(text("SELECT 1 as test"))
            test_value = result.fetchone()[0]
            if test_value == 1:
                return jsonify(
                    {
                        "success": True,
                        "message": "SQL Server connection successful",
                        "test_value": test_value,
                    }
                ), 200
            return jsonify(
                {
                    "success": False,
                    "error": "SQL Server connection test failed",
                    "test_value": test_value,
                }
            ), 500
    except Exception as e:
        logger.error("Error testing SQL Server connection: %s", e)
        return jsonify(
            {
                "success": False,
                "error": "Failed to test SQL Server connection",
                "message": str(e),
            }
        ), 500


@sqlserver_bp.route("/api/sqlserver/batch-materials", methods=["GET"])
def get_batch_materials():
    try:
        limit = request.args.get("limit", 100, type=int)
        offset = request.args.get("offset", 0, type=int)
        source_server = request.args.get("source_server")
        batch_name = request.args.get("batch_name")
        product_name = request.args.get("product_name")
        material_name = request.args.get("material_name")
        start_date_str = request.args.get("startDate")
        end_date_str = request.args.get("endDate")

        if limit > 1000:
            limit = 1000
        if limit < 1:
            limit = 100
        if offset < 0:
            offset = 0

        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        sql = f"""
            SELECT
                [Source Server],
                [Batch GUID],
                [ROOTGUID],
                [OrderID],
                [Batch Name],
                [Product Name],
                [Batch Act Start],
                [Batch Act End],
                [Batch Transfer Time],
                [Quantity],
                [Material Name],
                [Material Code],
                [sp_prot],
                [SetPoint Float],
                [Actual Value Float],
                [FormulaCategoryName]
            FROM [{SQLSERVER_DATABASE}].[dbo].[{tbl}]
            WHERE 1=1
        """
        params = {}
        if source_server:
            sql += " AND [Source Server] LIKE :source_server"
            params["source_server"] = f"%{source_server}%"
        if batch_name:
            sql += " AND [Batch Name] LIKE :batch_name"
            params["batch_name"] = f"%{batch_name}%"
        if product_name:
            sql += " AND [Product Name] LIKE :product_name"
            params["product_name"] = f"%{product_name}%"
        if material_name:
            sql += " AND [Material Name] LIKE :material_name"
            params["material_name"] = f"%{material_name}%"
        if start_date_str:
            start_date = parse_request_datetime(start_date_str)
            sql += " AND [Batch Act Start] >= :start_date"
            params["start_date"] = start_date
        if end_date_str:
            end_date = parse_request_datetime(end_date_str)
            sql += " AND [Batch Act Start] <= :end_date"
            params["end_date"] = end_date

        sql += " ORDER BY [Batch Act Start] DESC OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY"
        params["off"] = offset
        params["lim"] = limit

        engine = _sqlserver_engine()
        with engine.connect() as conn:
            result = conn.execute(text(sql), params)
            columns = list(result.keys())
            rows = result.fetchall()

        data = [_row_to_dict(row, columns) for row in rows]

        return jsonify(
            {
                "success": True,
                "data": data,
                "total_records": len(data),
                "limit": limit,
                "offset": offset,
                "filters_applied": {
                    "source_server": source_server,
                    "batch_name": batch_name,
                    "product_name": product_name,
                    "material_name": material_name,
                    "startDate": start_date_str,
                    "endDate": end_date_str,
                },
            }
        ), 200
    except Exception as e:
        logger.error("Error fetching batch materials: %s", e)
        return jsonify(
            {
                "success": False,
                "error": "Failed to fetch batch materials data",
                "message": str(e),
            }
        ), 500


@sqlserver_bp.route("/api/sqlserver/batch-materials/count", methods=["GET"])
def get_batch_materials_count():
    try:
        engine = _sqlserver_engine()
        with engine.connect() as conn:
            result = conn.execute(
                text(
                    f"SELECT COUNT(*) as total FROM [{SQLSERVER_DATABASE}].[dbo].[{SQLSERVER_BATCH_MATERIALS_TABLE}]"
                )
            )
            count = result.fetchone()[0]
        return jsonify({"success": True, "total_records": count}), 200
    except Exception as e:
        logger.error("Error getting batch materials count: %s", e)
        return jsonify(
            {
                "success": False,
                "error": "Failed to get batch materials count",
                "message": str(e),
            }
        ), 500


@sqlserver_bp.route("/api/sqlserver/batch-materials/<batch_guid>", methods=["GET"])
def get_batch_material_by_guid(batch_guid):
    try:
        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        q = text(
            f"""
            SELECT TOP (1)
                [Source Server],
                [Batch GUID],
                [ROOTGUID],
                [OrderID],
                [Batch Name],
                [Product Name],
                [Batch Act Start],
                [Batch Act End],
                [Batch Transfer Time],
                [Quantity],
                [Material Name],
                [Material Code],
                [sp_prot],
                [SetPoint Float],
                [Actual Value Float],
                [FormulaCategoryName]
            FROM [{SQLSERVER_DATABASE}].[dbo].[{tbl}]
            WHERE [Batch GUID] = TRY_CONVERT(uniqueidentifier, :bg)
            """
        )
        bg = str(batch_guid).strip().replace("{", "").replace("}", "")
        engine = _sqlserver_engine()
        with engine.connect() as conn:
            result = conn.execute(q, {"bg": bg})
            columns = list(result.keys())
            row = result.fetchone()

        if not row:
            return jsonify({"success": False, "error": "Batch material not found"}), 404

        data = _row_to_dict(row, columns)
        return jsonify({"success": True, "data": data}), 200
    except Exception as e:
        logger.error("Error fetching batch material by GUID: %s", e)
        return jsonify(
            {
                "success": False,
                "error": "Failed to fetch batch material",
                "message": str(e),
            }
        ), 500

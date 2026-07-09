from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import text
import logging

from config import SQLSERVER_BATCH_MATERIALS_TABLE, SQLSERVER_DATABASE
from models import db
from utils.timezone import BUSINESS_TZ, format_db_datetime_utc_iso, parse_request_datetime

UTC = timezone.utc

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


def _naive_utc_to_saudi_hour(dt: datetime) -> int:
    """Convert naive UTC DB datetime to Saudi calendar hour (0-23)."""
    if dt.tzinfo is None:
        aware = dt.replace(tzinfo=UTC)
    else:
        aware = dt.astimezone(UTC)
    return aware.astimezone(BUSINESS_TZ).hour


def _naive_utc_to_saudi_dt(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        aware = dt.replace(tzinfo=UTC)
    else:
        aware = dt.astimezone(UTC)
    return aware.astimezone(BUSINESS_TZ)


def _last_week_saudi_bounds() -> tuple[datetime, datetime]:
    """Previous Mon 07:00 → this Mon 07:00 (Saudi), matching dashboard week."""
    now_saudi = datetime.now(UTC).astimezone(BUSINESS_TZ)
    monday_offset = now_saudi.weekday()
    this_monday = (now_saudi - timedelta(days=monday_offset)).replace(
        hour=7, minute=0, second=0, microsecond=0
    )
    if now_saudi < this_monday:
        this_monday -= timedelta(days=7)
    week_end = this_monday
    week_start = week_end - timedelta(days=7)
    return week_start, week_end


@sqlserver_bp.route("/api/sqlserver/batch-hourly-count", methods=["GET"])
def get_batch_hourly_count():
    """Distinct batch count per calendar hour (0-23) for today in Saudi time."""
    try:
        mode = (request.args.get("mode") or "today").lower()
        tbl = SQLSERVER_BATCH_MATERIALS_TABLE
        labels = [str(h) for h in range(24)]
        counts = [0] * 24

        if mode == "rolling":
            hours = request.args.get("hours", 24, type=int)
            hours = min(max(hours, 1), 48)
            now_utc = datetime.now(UTC).replace(tzinfo=None)
            since = now_utc - timedelta(hours=hours)
            sql = f"""
                SELECT [Batch GUID], MIN([Batch Act Start]) AS batch_start
                FROM [{SQLSERVER_DATABASE}].[dbo].[{tbl}]
                WHERE [Batch Act Start] >= :since
                  AND [Batch GUID] IS NOT NULL
                GROUP BY [Batch GUID]
            """
            params = {"since": since}
            window_start_ms = since.replace(tzinfo=UTC).timestamp() * 1000
            now_ms = now_utc.replace(tzinfo=UTC).timestamp() * 1000
            bucket_ms = 3600 * 1000
            counts = [0] * hours
            labels = []
            for i in range(hours):
                bucket_start = now_utc - timedelta(hours=hours - i)
                saudi = bucket_start.replace(tzinfo=UTC).astimezone(BUSINESS_TZ)
                labels.append(str(saudi.hour))
        else:
            # Calendar today in Saudi Arabia (00:00 – 24:00)
            now_saudi = datetime.now(UTC).astimezone(BUSINESS_TZ)
            day_start_saudi = now_saudi.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end_saudi = day_start_saudi + timedelta(days=1)
            start_utc = day_start_saudi.astimezone(UTC).replace(tzinfo=None)
            end_utc = day_end_saudi.astimezone(UTC).replace(tzinfo=None)
            sql = f"""
                SELECT [Batch GUID], MIN([Batch Act Start]) AS batch_start
                FROM [{SQLSERVER_DATABASE}].[dbo].[{tbl}]
                WHERE [Batch Act Start] >= :start_utc
                  AND [Batch Act Start] < :end_utc
                  AND [Batch GUID] IS NOT NULL
                GROUP BY [Batch GUID]
            """
            params = {"start_utc": start_utc, "end_utc": end_utc}
            hours = 24
            window_start_ms = None
            now_ms = None
            bucket_ms = None

        engine = _sqlserver_engine()
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).fetchall()

        for row in rows:
            batch_start = row.batch_start
            if batch_start is None:
                continue
            if mode == "rolling":
                ts = batch_start.replace(tzinfo=UTC).timestamp() * 1000 if batch_start.tzinfo is None else batch_start.astimezone(UTC).timestamp() * 1000
                if ts < window_start_ms or ts > now_ms:
                    continue
                idx = int((ts - window_start_ms) / bucket_ms)
                if idx >= hours:
                    idx = hours - 1
                if idx >= 0:
                    counts[idx] += 1
            else:
                hour = _naive_utc_to_saudi_hour(batch_start)
                counts[hour] += 1

        if mode != "rolling":
            now_saudi = datetime.now(UTC).astimezone(BUSINESS_TZ)
            current_hour = now_saudi.hour
            labels = [str(h) for h in range(current_hour + 1)]
            counts = counts[: current_hour + 1]

        return jsonify(
            {
                "success": True,
                "mode": mode,
                "hours": len(counts),
                "current_hour": labels[-1] if labels else "0",
                "labels": labels,
                "counts": counts,
                "total_batches": sum(counts),
            }
        ), 200
    except Exception as e:
        logger.error("Error fetching hourly batch count: %s", e)
        return jsonify(
            {
                "success": False,
                "error": "Failed to fetch hourly batch count",
                "message": str(e),
            }
        ), 500


@sqlserver_bp.route("/api/sqlserver/batch-weekly-count", methods=["GET"])
def get_batch_weekly_count():
    """Distinct batch count per day for the previous calendar week (Mon–Sun)."""
    try:
        week_start_saudi, week_end_saudi = _last_week_saudi_bounds()
        start_utc = week_start_saudi.astimezone(UTC).replace(tzinfo=None)
        end_utc = week_end_saudi.astimezone(UTC).replace(tzinfo=None)
        tbl = SQLSERVER_BATCH_MATERIALS_TABLE

        sql = f"""
            SELECT [Batch GUID], MIN([Batch Act Start]) AS batch_start
            FROM [{SQLSERVER_DATABASE}].[dbo].[{tbl}]
            WHERE [Batch Act Start] >= :start_utc
              AND [Batch Act Start] < :end_utc
              AND [Batch GUID] IS NOT NULL
            GROUP BY [Batch GUID]
        """

        engine = _sqlserver_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text(sql), {"start_utc": start_utc, "end_utc": end_utc}
            ).fetchall()

        labels: list[str] = []
        buckets: list[set] = [set() for _ in range(7)]
        week_start_date = week_start_saudi.date()

        for i in range(7):
            day = week_start_saudi + timedelta(days=i)
            labels.append(day.strftime("%A"))

        for row in rows:
            batch_start = row.batch_start
            guid = row[0]
            if batch_start is None or guid is None:
                continue
            saudi_dt = _naive_utc_to_saudi_dt(batch_start)
            day_index = (saudi_dt.date() - week_start_date).days
            if 0 <= day_index < 7:
                buckets[day_index].add(str(guid))

        counts = [len(b) for b in buckets]

        return jsonify(
            {
                "success": True,
                "labels": labels,
                "counts": counts,
                "total_batches": sum(counts),
                "week_start": week_start_saudi.strftime("%Y-%m-%d"),
                "week_end": (week_end_saudi - timedelta(days=1)).strftime("%Y-%m-%d"),
            }
        ), 200
    except Exception as e:
        logger.error("Error fetching weekly batch count: %s", e)
        return jsonify(
            {
                "success": False,
                "error": "Failed to fetch weekly batch count",
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

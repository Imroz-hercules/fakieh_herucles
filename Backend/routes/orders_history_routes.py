# ─────────────── Orders History APIs ───────────────
from flask import Blueprint, jsonify, request
from datetime import datetime
from sqlalchemy import case, func

from models import db
from models.orders import IntakeOrder, OutloadingOrder, BulkLineOrder, PTLineOrder

orders_history_bp = Blueprint("orders_history", __name__, url_prefix="/api/orders")


def _pagination_params():
    """limit (default 100, max 500), offset (default 0). Applied per order category."""
    try:
        limit = int(request.args.get("limit", 100))
    except ValueError:
        limit = 100
    limit = max(1, min(limit, 500))
    try:
        offset = int(request.args.get("offset", 0))
    except ValueError:
        offset = 0
    offset = max(0, offset)
    return limit, offset


def _page_query_to_dicts(query, limit, offset):
    """Fetch up to `limit` rows after `offset`; set has_more if another row exists."""
    rows = query.limit(limit + 1).offset(offset).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return [r.to_dict() for r in rows], has_more


def _parse_iso_date(arg_name, raw):
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(arg_name)


def _triple_counts(model, *filters):
    """Single round-trip: total, active (not complete), completed."""
    row = (
        db.session.query(
            func.count(model.id),
            func.coalesce(
                func.sum(case((model.is_complete.is_(False), 1), else_=0)), 0
            ),
            func.coalesce(
                func.sum(case((model.is_complete.is_(True), 1), else_=0)), 0
            ),
        )
        .filter(*filters)
        .one()
    )
    total = int(row[0] or 0)
    active = int(row[1] or 0)
    completed = int(row[2] or 0)
    return total, active, completed


@orders_history_bp.route("/active", methods=["GET"])
def get_active_orders():
    """Active (not completed) orders from DB, paginated per category (limit/offset)."""
    try:
        limit, offset = _pagination_params()
        intake_q = IntakeOrder.query.filter_by(is_complete=False).order_by(
            IntakeOrder.id.desc()
        )
        out_q = OutloadingOrder.query.filter_by(is_complete=False).order_by(
            OutloadingOrder.id.desc()
        )
        bulk_q = BulkLineOrder.query.filter_by(is_complete=False).order_by(
            BulkLineOrder.id.desc()
        )
        pit_q = PTLineOrder.query.filter_by(is_complete=False).order_by(
            PTLineOrder.id.desc()
        )

        intake_rows, hm_i = _page_query_to_dicts(intake_q, limit, offset)
        out_rows, hm_o = _page_query_to_dicts(out_q, limit, offset)
        bulk_rows, hm_b = _page_query_to_dicts(bulk_q, limit, offset)
        pit_rows, hm_p = _page_query_to_dicts(pit_q, limit, offset)

        active_orders = {
            "intake": intake_rows,
            "outloading": out_rows,
            "bulk": bulk_rows,
            "pit": pit_rows,
        }
        total_active = sum(len(v) for v in active_orders.values())

        return jsonify(
            {
                "ok": True,
                "total_active_orders": total_active,
                "orders": active_orders,
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "has_more": {
                        "intake": hm_i,
                        "outloading": hm_o,
                        "bulk": hm_b,
                        "pit": hm_p,
                    },
                },
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/completed", methods=["GET"])
def get_completed_orders():
    """Completed orders with optional date range; paginated per category."""
    try:
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        limit, offset = _pagination_params()

        intake_query = IntakeOrder.query.filter_by(is_complete=True)
        outloading_query = OutloadingOrder.query.filter_by(is_complete=True)
        bulk_query = BulkLineOrder.query.filter_by(is_complete=True)
        pit_query = PTLineOrder.query.filter_by(is_complete=True)

        if from_date:
            try:
                from_dt = _parse_iso_date("from", from_date)
                intake_query = intake_query.filter(IntakeOrder.finished_at >= from_dt)
                outloading_query = outloading_query.filter(
                    OutloadingOrder.finished_at >= from_dt
                )
                bulk_query = bulk_query.filter(BulkLineOrder.finished_at >= from_dt)
                pit_query = pit_query.filter(PTLineOrder.finished_at >= from_dt)
            except ValueError:
                return (
                    jsonify(
                        {
                            "error": "Invalid 'from' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"
                        }
                    ),
                    400,
                )

        if to_date:
            try:
                to_dt = _parse_iso_date("to", to_date)
                intake_query = intake_query.filter(IntakeOrder.finished_at <= to_dt)
                outloading_query = outloading_query.filter(
                    OutloadingOrder.finished_at <= to_dt
                )
                bulk_query = bulk_query.filter(BulkLineOrder.finished_at <= to_dt)
                pit_query = pit_query.filter(PTLineOrder.finished_at <= to_dt)
            except ValueError:
                return (
                    jsonify(
                        {
                            "error": "Invalid 'to' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"
                        }
                    ),
                    400,
                )

        intake_query = intake_query.order_by(IntakeOrder.finished_at.desc())
        outloading_query = outloading_query.order_by(OutloadingOrder.finished_at.desc())
        bulk_query = bulk_query.order_by(BulkLineOrder.finished_at.desc())
        pit_query = pit_query.order_by(PTLineOrder.finished_at.desc())

        intake_rows, hm_i = _page_query_to_dicts(intake_query, limit, offset)
        out_rows, hm_o = _page_query_to_dicts(outloading_query, limit, offset)
        bulk_rows, hm_b = _page_query_to_dicts(bulk_query, limit, offset)
        pit_rows, hm_p = _page_query_to_dicts(pit_query, limit, offset)

        completed_orders = {
            "intake": intake_rows,
            "outloading": out_rows,
            "bulk": bulk_rows,
            "pit": pit_rows,
        }
        total_completed = sum(len(v) for v in completed_orders.values())

        return jsonify(
            {
                "ok": True,
                "total_completed_orders": total_completed,
                "date_filter": {"from": from_date, "to": to_date},
                "orders": completed_orders,
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "has_more": {
                        "intake": hm_i,
                        "outloading": hm_o,
                        "bulk": hm_b,
                        "pit": hm_p,
                    },
                },
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/history", methods=["GET"])
def get_all_orders_history():
    """Full history with optional type/date filters; paginated per category."""
    try:
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        order_type = request.args.get("type")
        limit, offset = _pagination_params()

        intake_query = IntakeOrder.query
        outloading_query = OutloadingOrder.query
        bulk_query = BulkLineOrder.query
        pit_query = PTLineOrder.query

        if order_type == "active":
            intake_query = intake_query.filter_by(is_complete=False)
            outloading_query = outloading_query.filter_by(is_complete=False)
            bulk_query = bulk_query.filter_by(is_complete=False)
            pit_query = pit_query.filter_by(is_complete=False)
        elif order_type == "completed":
            intake_query = intake_query.filter_by(is_complete=True)
            outloading_query = outloading_query.filter_by(is_complete=True)
            bulk_query = bulk_query.filter_by(is_complete=True)
            pit_query = pit_query.filter_by(is_complete=True)

        if from_date:
            try:
                from_dt = _parse_iso_date("from", from_date)
                intake_query = intake_query.filter(IntakeOrder.created_at >= from_dt)
                outloading_query = outloading_query.filter(
                    OutloadingOrder.created_at >= from_dt
                )
                bulk_query = bulk_query.filter(BulkLineOrder.created_at >= from_dt)
                pit_query = pit_query.filter(PTLineOrder.created_at >= from_dt)
            except ValueError:
                return (
                    jsonify(
                        {
                            "error": "Invalid 'from' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"
                        }
                    ),
                    400,
                )

        if to_date:
            try:
                to_dt = _parse_iso_date("to", to_date)
                intake_query = intake_query.filter(IntakeOrder.created_at <= to_dt)
                outloading_query = outloading_query.filter(
                    OutloadingOrder.created_at <= to_dt
                )
                bulk_query = bulk_query.filter(BulkLineOrder.created_at <= to_dt)
                pit_query = pit_query.filter(PTLineOrder.created_at <= to_dt)
            except ValueError:
                return (
                    jsonify(
                        {
                            "error": "Invalid 'to' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"
                        }
                    ),
                    400,
                )

        intake_query = intake_query.order_by(IntakeOrder.id.desc())
        outloading_query = outloading_query.order_by(OutloadingOrder.id.desc())
        bulk_query = bulk_query.order_by(BulkLineOrder.id.desc())
        pit_query = pit_query.order_by(PTLineOrder.id.desc())

        intake_rows, hm_i = _page_query_to_dicts(intake_query, limit, offset)
        out_rows, hm_o = _page_query_to_dicts(outloading_query, limit, offset)
        bulk_rows, hm_b = _page_query_to_dicts(bulk_query, limit, offset)
        pit_rows, hm_p = _page_query_to_dicts(pit_query, limit, offset)

        history = {
            "intake": intake_rows,
            "outloading": out_rows,
            "bulk": bulk_rows,
            "pit": pit_rows,
        }
        total_orders = sum(len(v) for v in history.values())
        active_count = sum(
            len([o for o in orders if not o.get("isComplete", False)])
            for orders in history.values()
        )
        completed_count = sum(
            len([o for o in orders if o.get("isComplete", False)])
            for orders in history.values()
        )

        return jsonify(
            {
                "ok": True,
                "total_orders": total_orders,
                "active_orders": active_count,
                "completed_orders": completed_count,
                "filters": {
                    "type": order_type or "all",
                    "from": from_date,
                    "to": to_date,
                },
                "orders": history,
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "has_more": {
                        "intake": hm_i,
                        "outloading": hm_o,
                        "bulk": hm_b,
                        "pit": hm_p,
                    },
                },
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/stats", methods=["GET"])
def get_orders_statistics():
    """Order statistics; one aggregated query per table (total / active / completed)."""
    try:
        from_date = request.args.get("from")
        to_date = request.args.get("to")

        def date_filters(model):
            fl = []
            if from_date:
                fl.append(model.created_at >= _parse_iso_date("from", from_date))
            if to_date:
                fl.append(model.created_at <= _parse_iso_date("to", to_date))
            return fl

        try:
            i_f = date_filters(IntakeOrder)
            o_f = date_filters(OutloadingOrder)
            b_f = date_filters(BulkLineOrder)
            p_f = date_filters(PTLineOrder)
        except ValueError as which:
            return (
                jsonify(
                    {
                        "error": f"Invalid '{which.args[0]}' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"
                    }
                ),
                400,
            )

        it, ia, ic = _triple_counts(IntakeOrder, *i_f)
        ot, oa, oc = _triple_counts(OutloadingOrder, *o_f)
        bt, ba, bc = _triple_counts(BulkLineOrder, *b_f)
        pt, pa, pc = _triple_counts(PTLineOrder, *p_f)

        stats = {
            "intake": {
                "total": it,
                "active": ia,
                "completed": ic,
                "avg_duration_minutes": None,
            },
            "outloading": {
                "total": ot,
                "active": oa,
                "completed": oc,
                "avg_duration_minutes": None,
            },
            "bulk": {
                "total": bt,
                "active": ba,
                "completed": bc,
                "avg_duration_minutes": None,
            },
            "pit": {
                "total": pt,
                "active": pa,
                "completed": pc,
                "avg_duration_minutes": None,
            },
        }

        total_orders = sum(s["total"] for s in stats.values())
        total_active = sum(s["active"] for s in stats.values())
        total_completed = sum(s["completed"] for s in stats.values())

        return jsonify(
            {
                "ok": True,
                "summary": {
                    "total_orders": total_orders,
                    "active_orders": total_active,
                    "completed_orders": total_completed,
                    "completion_rate": round(
                        (total_completed / total_orders * 100), 2
                    )
                    if total_orders > 0
                    else 0,
                },
                "by_type": stats,
                "date_filter": {"from": from_date, "to": to_date},
                "timestamp": datetime.now().isoformat(),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    """Delete a specific order by ID."""
    try:
        order = None
        order_type = None

        order = IntakeOrder.query.get(order_id)
        if order:
            order_type = "intake"
        else:
            order = OutloadingOrder.query.get(order_id)
            if order:
                order_type = "outloading"
            else:
                order = BulkLineOrder.query.get(order_id)
                if order:
                    order_type = "bulk"
                else:
                    order = PTLineOrder.query.get(order_id)
                    if order:
                        order_type = "pit"

        if not order:
            return jsonify({"error": "Order not found"}), 404

        db.session.delete(order)
        db.session.commit()

        return jsonify(
            {
                "message": f"Order {order_id} deleted successfully",
                "order_type": order_type,
                "deleted_at": datetime.utcnow().isoformat(),
            }
        )

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

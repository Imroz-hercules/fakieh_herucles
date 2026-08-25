from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from constants.material_codes import is_valid_material_code, resolve_material_name
from models import db
from models.truck import Driver, Truck
from models.truck_weigh_order import OPEN_STATUSES, TruckWeighOrder
from utils.baykon_scales import SCALES, get_scale, read_live_weight
from utils.timezone import BUSINESS_TZ, BUSINESS_TZ_NAME

truck_entry_bp = Blueprint("truck_entry", __name__, url_prefix="/api/truck-entry")

# The plant is in Saudi Arabia. This used to be hardcoded to "Asia/Kolkata",
# which put the business-day boundary 2.5h off and made "today" wrong for
# operators. Sourced from utils.timezone so it stays consistent app-wide.
TIMEZONE_NAME = BUSINESS_TZ_NAME


def _utcnow():
    return datetime.now(timezone.utc)


def _new_ticket() -> str:
    return f"TE-{uuid.uuid4().hex[:8].upper()}"


def _parse_date_yyyy_mm_dd(value: str):
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        return None


def _enrich_truck_maps(truck_ids: set[int]):
    truck_map: dict[int, Truck] = {}
    driver_map: dict[int, Driver] = {}

    if not truck_ids:
        return truck_map, driver_map

    trucks = Truck.query.filter(Truck.id.in_(truck_ids)).all()
    truck_map = {t.id: t for t in trucks}

    drows = Driver.query.filter(Driver.truck_id.in_(truck_ids)).all()
    for d in drows:
        prev = driver_map.get(d.truck_id)
        if prev is None:
            driver_map[d.truck_id] = d
        elif prev.status != "Active" and d.status == "Active":
            driver_map[d.truck_id] = d
        elif prev.status == d.status and d.id > prev.id:
            driver_map[d.truck_id] = d

    return truck_map, driver_map


def _order_dict(order: TruckWeighOrder, truck_map=None, driver_map=None):
    truck_map = truck_map or {}
    driver_map = driver_map or {}
    t = truck_map.get(order.truck_id)
    d = driver_map.get(order.truck_id)
    return order.to_dict(
        truck_plate=getattr(t, "license", None) if t else None,
        truck_driver=getattr(d, "name", None) if d else None,
    )


def _open_order_for_truck(truck_id: int):
    return (
        TruckWeighOrder.query.filter(
            TruckWeighOrder.truck_id == int(truck_id),
            TruckWeighOrder.status.in_(list(OPEN_STATUSES)),
        )
        .order_by(TruckWeighOrder.created_at.desc())
        .first()
    )


@truck_entry_bp.route("/scales", methods=["GET"])
def list_scales():
    """List configured weighbridge scales (1=entry, 2=exit)."""
    items = []
    for sid, meta in SCALES.items():
        items.append({
            "scale": sid,
            "name": meta["name"],
            "role": meta["role"],
            "ip": meta["ip"],
            "mac": meta["mac"],
        })
    return jsonify({"scales": items}), 200


@truck_entry_bp.route("/scales/<int:scale_id>/live", methods=["GET"])
def scale_live(scale_id: int):
    """
    Live weight from Baykon indicator.
    Scale 1 = entry (IN), Scale 2 = exit (OUT).
    """
    if get_scale(scale_id) is None:
        return jsonify({"ok": False, "error": "scale must be 1 (entry) or 2 (exit)"}), 400
    reading = read_live_weight(scale_id)
    status = 200 if reading.get("ok") else 502
    return jsonify(reading), status


@truck_entry_bp.route("/orders", methods=["POST"])
def create_order():
    data = request.get_json(force=True) or {}
    truck_id = data.get("truck_id")
    material_code = str(data.get("material_code") or "").strip()

    if truck_id is None:
        return jsonify({"error": "truck_id is required"}), 400
    if not material_code:
        return jsonify({"error": "material_code is required"}), 400
    if not is_valid_material_code(material_code):
        return jsonify({"error": f"Invalid material_code: {material_code}"}), 400

    truck = Truck.query.get(int(truck_id))
    if not truck:
        return jsonify({"error": f"Truck {truck_id} not found"}), 404

    existing = _open_order_for_truck(int(truck_id))
    if existing:
        return jsonify({
            "error": "Truck already has an open weigh order",
            "order_id": existing.id,
            "ticket": existing.ticket,
            "status": existing.status,
        }), 409

    material_name = resolve_material_name(material_code)
    order = TruckWeighOrder(
        ticket=_new_ticket(),
        truck_id=int(truck_id),
        material_code=material_code,
        material_name=material_name,
        status="awaiting_first",
        created_at=_utcnow(),
    )
    try:
        db.session.add(order)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to create order", "detail": str(e)}), 500

    truck_map, driver_map = _enrich_truck_maps({order.truck_id})
    return jsonify(_order_dict(order, truck_map, driver_map)), 201


@truck_entry_bp.route("/orders/<int:order_id>/first", methods=["POST"])
def save_first_weight(order_id: int):
    data = request.get_json(force=True) or {}
    weight = data.get("weight")

    if weight is None:
        return jsonify({"error": "weight is required"}), 400
    try:
        weight_val = float(weight)
    except (TypeError, ValueError):
        return jsonify({"error": "weight must be a number"}), 400
    if weight_val <= 0:
        return jsonify({"error": "weight must be greater than 0"}), 400

    order = TruckWeighOrder.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if order.status != "awaiting_first":
        return jsonify({"error": f"Order status is '{order.status}', expected 'awaiting_first'"}), 409

    order.first_weight_kg = weight_val
    order.first_ts = _utcnow()
    order.status = "awaiting_second"

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to save first weight", "detail": str(e)}), 500

    truck_map, driver_map = _enrich_truck_maps({order.truck_id})
    return jsonify(_order_dict(order, truck_map, driver_map)), 200


@truck_entry_bp.route("/orders/<int:order_id>/second", methods=["POST"])
def save_second_weight(order_id: int):
    data = request.get_json(force=True) or {}
    weight = data.get("weight")

    if weight is None:
        return jsonify({"error": "weight is required"}), 400
    try:
        weight_val = float(weight)
    except (TypeError, ValueError):
        return jsonify({"error": "weight must be a number"}), 400
    if weight_val <= 0:
        return jsonify({"error": "weight must be greater than 0"}), 400

    order = TruckWeighOrder.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if order.status != "awaiting_second":
        return jsonify({"error": f"Order status is '{order.status}', expected 'awaiting_second'"}), 409
    if order.first_weight_kg is None:
        return jsonify({"error": "First weight must be recorded before second weight"}), 409

    order.second_weight_kg = weight_val
    order.second_ts = _utcnow()
    order.net_kg = order.compute_net()
    order.status = "completed"

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to save second weight", "detail": str(e)}), 500

    truck_map, driver_map = _enrich_truck_maps({order.truck_id})
    return jsonify(_order_dict(order, truck_map, driver_map)), 200


@truck_entry_bp.route("/orders/open", methods=["GET"])
def list_open_orders():
    orders = (
        TruckWeighOrder.query.filter(TruckWeighOrder.status.in_(list(OPEN_STATUSES)))
        .order_by(TruckWeighOrder.created_at.desc())
        .all()
    )
    truck_ids = {o.truck_id for o in orders}
    truck_map, driver_map = _enrich_truck_maps(truck_ids)
    return jsonify({
        "orders": [_order_dict(o, truck_map, driver_map) for o in orders],
        "count": len(orders),
    }), 200


@truck_entry_bp.route("/orders/today", methods=["GET"])
def list_completed_today():
    date_str = request.args.get("date")

    # Business day is based on completion (OUT) time, not order creation time.
    # We resolve the local day to a half-open [start, end) range of absolute
    # timestamps and compare the bare column against it. The previous version
    # wrapped the column (`date(timezone(tz, second_ts)) == day`), which makes
    # the predicate non-sargable — Postgres cannot use an index on second_ts and
    # has to compute the expression for every row.
    if date_str:
        day = _parse_date_yyyy_mm_dd(date_str)
        if not day:
            return jsonify({"error": "date must be YYYY-MM-DD"}), 400
    else:
        day = datetime.now(BUSINESS_TZ).date()

    day_label = day.isoformat()
    start_local = datetime(day.year, day.month, day.day, tzinfo=BUSINESS_TZ)
    end_local = start_local + timedelta(days=1)

    orders = (
        TruckWeighOrder.query.filter(
            TruckWeighOrder.status == "completed",
            TruckWeighOrder.second_ts.isnot(None),
            TruckWeighOrder.second_ts >= start_local,
            TruckWeighOrder.second_ts < end_local,
        )
        .order_by(TruckWeighOrder.second_ts.desc().nullslast(), TruckWeighOrder.id.desc())
        .all()
    )

    truck_ids = {o.truck_id for o in orders}
    truck_map, driver_map = _enrich_truck_maps(truck_ids)
    rows = [_order_dict(o, truck_map, driver_map) for o in orders]

    return jsonify({"date": day_label, "rows": rows, "count": len(rows)}), 200


@truck_entry_bp.route("/orders/<int:order_id>", methods=["GET"])
def get_order(order_id: int):
    order = TruckWeighOrder.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    truck_map, driver_map = _enrich_truck_maps({order.truck_id})
    return jsonify(_order_dict(order, truck_map, driver_map)), 200


@truck_entry_bp.route("/orders/<int:order_id>", methods=["DELETE"])
def delete_order(order_id: int):
    """Cancel/remove an open weigh trip so the truck can be used again."""
    order = TruckWeighOrder.query.get(order_id)
    if not order:
        return jsonify({"error": "Order not found"}), 404
    if order.status not in OPEN_STATUSES:
        return jsonify({
            "error": f"Only open trips can be deleted (status is '{order.status}')",
        }), 409

    order.status = "cancelled"
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to delete order", "detail": str(e)}), 500

    truck_map, driver_map = _enrich_truck_maps({order.truck_id})
    return jsonify(_order_dict(order, truck_map, driver_map)), 200


@truck_entry_bp.route("/status/by-truck", methods=["GET"])
def status_by_truck():
    """Map truck_id -> open order summary (for Truck Management)."""
    orders = TruckWeighOrder.query.filter(
        TruckWeighOrder.status.in_(list(OPEN_STATUSES))
    ).all()
    truck_ids = {o.truck_id for o in orders}
    truck_map, driver_map = _enrich_truck_maps(truck_ids)

    by_truck = {}
    for o in orders:
        by_truck[str(o.truck_id)] = _order_dict(o, truck_map, driver_map)

    return jsonify({"by_truck": by_truck, "count": len(by_truck)}), 200

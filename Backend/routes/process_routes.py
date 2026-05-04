# process_routes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
import time
import random

# Adjust these imports according to your app structure
from models import db
from models.truck import Truck
from models.orders import IntakeOrder, OutloadingOrder
from models.weighbridge import WeighbridgeRecord
from models.rfid import RFIDTag  # optional validation

process_bp = Blueprint('process', __name__, url_prefix='/api/process')

# In-memory session and simulated scale state
SESSIONS = {}   # process_id -> dict
SCALE = {
    "value": 0.0,
    "stable": False,
    "last_update": None
}

def build_process_id(order_type: str, order_id: int, truck_id: int) -> str:
    prefix = 'INT' if order_type == 'intake' else 'OUT'
    return f"{prefix}-{order_id}-{truck_id}"

def find_order(order_type: str, order_id: int):
    if order_type == 'intake':
        return IntakeOrder.query.get(order_id)
    elif order_type == 'outloading':
        return OutloadingOrder.query.get(order_id)
    return None

# ---------- RFID link to Truck + Order ----------

@process_bp.route('/link', methods=['POST'])
def link_rfid_to_order():
    """
    Hardcode/link RFID to a truck+order process session.

    Body: { "rfid":"RFD-001", "truck_id":123, "order_type":"intake"|"outloading", "order_id":456 }
    """
    data = request.get_json(force=True)
    rfid = data.get('rfid')
    truck_id = data.get('truck_id')
    order_type = data.get('order_type')
    order_id = data.get('order_id')

    if not all([rfid, truck_id, order_type, order_id]):
        return jsonify({"error":"rfid, truck_id, order_type, order_id are required"}), 400

    truck = Truck.query.get(truck_id)
    if not truck:
        return jsonify({"error": f"Truck {truck_id} not found"}), 404

    order = find_order(order_type, order_id)
    if not order:
        return jsonify({"error": f"{order_type} order {order_id} not found"}), 404

    # Optional: validate RFID exists in DB
    # tag = RFIDTag.query.filter_by(tag_id=rfid).first()
    # if not tag:
    #     return jsonify({"error": f"RFID tag {rfid} not registered"}), 404

    process_id = build_process_id(order_type, order_id, truck_id)
    SESSIONS[process_id] = {
        "process_id": process_id,
        "rfid": rfid,
        "truck_id": truck_id,
        "order_type": order_type,
        "order_id": order_id,
        "rfid_linked_to_order": True,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "tare_weight": None,
        "gross_weight": None
    }
    return jsonify(SESSIONS[process_id]), 200

# ---------- Simulated real-time scale ----------

def simulate_scale_tick(target=None):
    """
    Simulate a live scale that moves toward a target and becomes stable for capture.
    If no target is given, drift around current value.
    """
    now = datetime.utcnow()
    SCALE["last_update"] = now.isoformat() + "Z"

    if target is None:
        # small random drift +/- 5kg
        delta = random.uniform(-5, 5)
        SCALE["value"] = max(0.0, SCALE["value"] + delta)
        SCALE["stable"] = False
        return

    # Move toward target with random steps; declare stable when within threshold
    step = (target - SCALE["value"]) * random.uniform(0.05, 0.15)
    # Ensure at least a small movement if too close
    if abs(step) < 1.0:
        step = 1.0 if target > SCALE["value"] else -1.0

    SCALE["value"] += step

    if abs(SCALE["value"] - target) < 3.0:
        # within 3kg considered stable
        SCALE["value"] = target
        SCALE["stable"] = True
    else:
        SCALE["stable"] = False

@process_bp.route('/scale/live', methods=['GET'])
def scale_live():
    """
    Polling endpoint: returns current simulated scale state.
    Query params:
      - target (optional, float): if provided, the scale will converge toward it.
    """
    target_q = request.args.get('target')
    target = None
    if target_q is not None:
        try:
            target = float(target_q)
        except ValueError:
            return jsonify({"error": "target must be a number"}), 400

    simulate_scale_tick(target=target)
    return jsonify({
        "weight": round(SCALE["value"], 1),
        "stable": SCALE["stable"],
        "last_update": SCALE["last_update"]
    }), 200

# ---------- Capture weigh (TARE/GROSS) from the live (simulated) scale ----------

@process_bp.route('/weigh/capture', methods=['POST'])
def capture_weight():
    """
    Capture current scale value as TARE or GROSS for a session.
    Body: { "process_id":"INT-456-123", "mode":"TARE"|"GROSS" }
    The scale value comes from the simulated live state (SCALE["value"]).
    """
    data = request.get_json(force=True)
    process_id = data.get('process_id')
    mode = data.get('mode')

    if not all([process_id, mode]):
        return jsonify({"error":"process_id and mode are required"}), 400

    session = SESSIONS.get(process_id)
    if not session:
        return jsonify({"error": f"process_id {process_id} not found"}), 404

    mode = mode.upper()
    if mode not in ("TARE", "GROSS"):
        return jsonify({"error":"mode must be TARE or GROSS"}), 400

    # Require stable reading to capture (simulate operator "Capture" button)
    if not SCALE["stable"]:
        return jsonify({"error":"Scale not stable. Try again when stable.", "weight": round(SCALE["value"],1)}), 409

    truck = Truck.query.get(session["truck_id"])
    order = find_order(session["order_type"], session["order_id"])
    if not truck or not order:
        return jsonify({"error":"Linked truck or order missing"}), 404

    weight_val = float(SCALE["value"])

    # Persist a WeighbridgeRecord
    wb = WeighbridgeRecord(
        truck_id=truck.id,
        order_id=order.id,
        mode=mode,
        weight=weight_val,
        timestamp=datetime.utcnow(),
        rfid_linked=True,
        truck_plate=getattr(truck, "license", None),
        truck_driver=getattr(truck, "contact", None),
        truck_material=getattr(order, "material_code", None) or getattr(order, "material", None)
    )
    try:
        db.session.add(wb)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error":"Failed to save weighbridge record", "detail": str(e)}), 500

    if mode == "TARE":
        session["tare_weight"] = weight_val
    else:
        session["gross_weight"] = weight_val

    return jsonify({
        "process_id": process_id,
        "captured_mode": mode,
        "captured_weight": weight_val,
        "rfid_linked_to_order": session["rfid_linked_to_order"],
        "tare_weight": session["tare_weight"],
        "gross_weight": session["gross_weight"]
    }), 200

# ---------- Complete process (compute net) ----------

@process_bp.route('/complete', methods=['POST'])
def complete_process():
    """
    Body: { "process_id":"INT-456-123" }
    Computes net = |gross - tare|, returns receipt.
    """
    data = request.get_json(force=True)
    process_id = data.get('process_id')
    if not process_id:
        return jsonify({"error":"process_id is required"}), 400

    session = SESSIONS.get(process_id)
    if not session:
        return jsonify({"error": f"process_id {process_id} not found"}), 404

    tare = session.get("tare_weight")
    gross = session.get("gross_weight")
    if tare is None or gross is None:
        return jsonify({"error":"Both TARE and GROSS must be captured before completion"}), 409

    net = abs(gross - tare)

    # Optional: update order/truck status here as needed
    # try:
    #     order = find_order(session["order_type"], session["order_id"])
    #     truck = Truck.query.get(session["truck_id"])
    #     order.status = "completed"
    #     truck.status = "Completed"
    #     db.session.commit()
    # except Exception as e:
    #     db.session.rollback()
    #     return jsonify({"error":"Finalize failed", "detail": str(e)}), 500

    return jsonify({
        "process_id": process_id,
        "order_type": session["order_type"],
        "order_id": session["order_id"],
        "truck_id": session["truck_id"],
        "rfid": session["rfid"],
        "tare": tare,
        "gross": gross,
        "net": net,
        "rfid_linked_to_order": session["rfid_linked_to_order"],
        "completed_at": datetime.utcnow().isoformat() + "Z"
    }), 200

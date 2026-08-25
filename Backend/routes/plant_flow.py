# routes/plant_flow.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import desc, asc, func
import requests
from models import db
from models.weights import WeightLog, RFIDLog
from models.truck import Truck, Driver
from utils.timezone import BUSINESS_TZ_NAME

plant_bp = Blueprint("plant", __name__, url_prefix="/api")
# Set your business timezone here
# Plant is in Saudi Arabia — sourced from utils.timezone (was "Asia/Kolkata").
TIMEZONE_NAME = BUSINESS_TZ_NAME
# PLC base URL - update this to your actual PLC endpoint
PLC_BASE_URL = "http://localhost:5000"

def _parse_date_yyyy_mm_dd(s: str):
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        return None


# --- faux PLC client (replace with real driver/integration) ---
def send_to_plc(payload: dict) -> dict:
    # TODO: call your PLC gateway; for now return a fake ACK
    return {"ack": True, "sent_at": datetime.utcnow().isoformat(), "payload": payload}

@plant_bp.route("/weights/today", methods=["GET"])
def weights_today():
    """
    DEPRECATED: Legacy IN/OUT pairs from weights_log (no material).
    Prefer GET /api/truck-entry/orders/today for completed truck weigh trips.
    Returns IN/OUT pairs (and NET) for a local day, enriched with truck plate & driver name.
    Query params:
      - date=YYYY-MM-DD (optional; default = today in Asia/Riyadh)
    """
    date_str = request.args.get("date")
    local_ts = func.timezone(TIMEZONE_NAME, WeightLog.ts)

    if date_str:
        day = _parse_date_yyyy_mm_dd(date_str)
        if not day:
            return jsonify({"error": "date must be YYYY-MM-DD"}), 400
        day_filter = func.date(local_ts) == day
        day_label = day.isoformat()
    else:
        day_filter = func.date(local_ts) == func.date(func.timezone(TIMEZONE_NAME, func.now()))
        day_label = db.session.query(
            func.to_char(func.timezone(TIMEZONE_NAME, func.now()), 'YYYY-MM-DD')
        ).scalar()

    # Pull all logs for that local day (in DB time zone), ordered by truck & time
    logs = (
        WeightLog.query
        .filter(day_filter)
        .order_by(asc(WeightLog.truck_id), asc(WeightLog.ts))
        .all()
    )

    # Pair per truck: the next OUT after an unmatched IN
    pairs = []
    pending_in = {}  # truck_id -> WeightLog (latest unmatched IN)
    for row in logs:
        if row.stage == "IN":
            pending_in[row.truck_id] = row
        elif row.stage == "OUT":
            pin = pending_in.get(row.truck_id)
            if pin:
                net = float(row.weight_kg) - float(pin.weight_kg)
                pairs.append({
                    "truck_id": row.truck_id,
                    "in_id": pin.id,
                    "in_weight": float(pin.weight_kg),
                    "in_ts": pin.ts.isoformat() if pin.ts else None,
                    "out_id": row.id,
                    "out_weight": float(row.weight_kg),
                    "out_ts": row.ts.isoformat() if row.ts else None,
                    "net": net
                })
                pending_in.pop(row.truck_id, None)

    # ---- Enrich with truck plate & driver name ----
    if pairs:
        truck_ids = {p["truck_id"] for p in pairs if p.get("truck_id") is not None}

        # Trucks → plate
        truck_map = {}
        if truck_ids:
            trucks = Truck.query.filter(Truck.id.in_(truck_ids)).all()
            truck_map = {t.id: t for t in trucks}

        # Drivers → prefer Active; if multiple, pick the one with highest id among equal status
        driver_map = {}
        if truck_ids:
            drows = Driver.query.filter(Driver.truck_id.in_(truck_ids)).all()
            for d in drows:
                prev = driver_map.get(d.truck_id)
                if prev is None:
                    driver_map[d.truck_id] = d
                else:
                    # Prefer Active over non-Active
                    if (prev.status != "Active" and d.status == "Active"):
                        driver_map[d.truck_id] = d
                    # If same status, pick the latest id
                    elif prev.status == d.status and d.id > prev.id:
                        driver_map[d.truck_id] = d

        # Attach to each pair
        for p in pairs:
            t = truck_map.get(p["truck_id"])
            d = driver_map.get(p["truck_id"])
            p["truck_plate"]  = getattr(t, "license", None)
            p["truck_driver"] = getattr(d, "name", None)

    return jsonify({"date": day_label, "pairs": pairs}), 200

# DEPRECATED: use POST /api/truck-entry/orders + /first + /second instead.
# 1) Gate IN weigh (legacy weights_log — truck_id only, no material)
@plant_bp.route("/weigh/in", methods=["POST"])
def weigh_in():
    data = request.get_json(force=True) or {}
    truck_id = data.get("truck_id")
    weight   = data.get("weight")
    if not truck_id or weight is None:
        return jsonify({"error": "truck_id and weight are required"}), 400

    wl = WeightLog(truck_id=int(truck_id), stage="IN", weight_kg=float(weight))
    db.session.add(wl); db.session.commit()
    return jsonify({"truck_id": wl.truck_id, "stage": "IN", "weight": wl.weight_kg, "log_id": wl.id, "ts": wl.ts.isoformat()}), 200

# 2) Operator logs RFID assignment and we send it to PLC
@plant_bp.route("/rfid/log", methods=["POST"])
def rfid_log():
    data = request.get_json(force=True) or {}
    rfid   = data.get("rfid_number")
    truck  = data.get("truck_id")
    order  = data.get("order_ref")
    if not rfid or not truck or not order:
        return jsonify({"error": "rfid_number, truck_id, order_ref are required"}), 400

    payload = {"rfid": rfid, "truck_id": int(truck), "order_ref": order}
    ack = send_to_plc(payload)

    rec = RFIDLog(rfid_number=rfid, truck_id=int(truck), order_ref=order,
                  sent_to_plc=bool(ack.get("ack")), plc_payload=ack)
    db.session.add(rec); db.session.commit()
    return jsonify({
        "rfid_number": rfid,
        "truck_id": int(truck),
        "order_ref": order,
        "sent_to_plc": rec.sent_to_plc,
        "plc_ack": ack
    }), 200

# DEPRECATED: use POST /api/truck-entry/orders/<id>/second instead.
# 3) Gate OUT weigh -> compute NET = OUT - latest unmatched IN (legacy)
@plant_bp.route("/weigh/out", methods=["POST"])
def weigh_out():
    data = request.get_json(force=True) or {}
    truck_id = data.get("truck_id")
    weight   = data.get("weight")
    if not truck_id or weight is None:
        return jsonify({"error": "truck_id and weight are required"}), 400

    # save OUT
    out_row = WeightLog(truck_id=int(truck_id), stage="OUT", weight_kg=float(weight))
    db.session.add(out_row); db.session.flush()

    # find the nearest IN before this OUT that does not have a later matched OUT
    latest_in = (WeightLog.query
                 .filter(WeightLog.truck_id==int(truck_id), WeightLog.stage=="IN")
                 .order_by(desc(WeightLog.ts))
                 .first())
    if not latest_in:
        db.session.commit()
        return jsonify({"truck_id": int(truck_id), "OUT": float(weight),
                        "warning": "No prior IN found for this truck"}), 200

    net = float(weight) - float(latest_in.weight_kg)
    db.session.commit()
    return jsonify({
        "truck_id": int(truck_id),
        "IN": latest_in.weight_kg,
        "OUT": float(weight),
        "NET": net,
        "in_ts": latest_in.ts.isoformat(),
        "out_ts": out_row.ts.isoformat(),
    }), 200

@plant_bp.route("/dispatch", methods=["POST"])
def dispatch():
    """
    Body for intake/outloading:
      {
        "type": "intake" | "outloading",
        "line": 1 | 2 | 3,
        "truckId": 123,
        "orderRef": "INT-2025-0001",
        "material_code": "100",
        "declared_qty_kg": 300,
        "dest1": 201, "dest2": 202,
        "dest_sel": 0   # (only for outloading if your PLC uses it)
      }

    Body for bulk/pit:
      type: "bulk" | "pit"
      (no line)
      plus the relevant fields:
        bulk: { source_silo, dest1, dest2, cc25_sel, declared_qty_kg, scale_sel }
        pit:  { pit_no, raw_code, dest1, dest2, declared_qty_kg, scale_sel }
    """
    p = request.get_json(force=True) or {}
    typ = (p.get("type") or "").lower()
    truck_id = p.get("truckId")
    order_ref = p.get("orderRef")

    if typ not in ("intake","outloading","bulk","pit"):
        return jsonify({"error":"type must be intake|outloading|bulk|pit"}), 400
    if typ in ("intake","outloading") and not p.get("line"):
        return jsonify({"error":"line is required for intake/outloading"}), 400
    if not truck_id or not order_ref:
        return jsonify({"error":"truckId and orderRef are required"}), 400

    # find the assigned RFID (becomes badge_no)
    truck = Truck.query.get(int(truck_id))
    badge_no = getattr(truck, "rfid_tag", None)

    if not badge_no:
        # fallback: latest RFIDLog for this truck+order
        latest = (RFIDLog.query
                  .filter_by(truck_id=int(truck_id), order_ref=order_ref)
                  .order_by(RFIDLog.id.desc())
                  .first())
        badge_no = getattr(latest, "rfid_number", None)

    if not badge_no:
        return jsonify({"error": "No RFID assigned to this truck/order"}), 400

    try:
        if typ == "intake":
            body = {
                "badge_no": badge_no,
                "material_code": p.get("material_code"),
                "declared_qty_kg": p.get("declared_qty_kg"),
                "dest1": p.get("dest1"),
                "dest2": p.get("dest2"),
            }
            url = f"{PLC_BASE_URL}/api/plc/db/1/intake/line/{int(p['line'])}/write"

        elif typ == "outloading":
            body = {
                "badge_no": badge_no,
                "material_code": p.get("material_code"),
                "declared_qty_kg": p.get("declared_qty_kg"),
                "dest1": p.get("dest1"),
                "dest2": p.get("dest2"),
            }
            # optional selector if PLC tag exists
            if p.get("dest_sel") is not None:
                body["dest_sel"] = p.get("dest_sel")
            url = f"{PLC_BASE_URL}/api/plc/db/2/outloading/line/{int(p['line'])}/write"

        elif typ == "bulk":
            body = {
                "source_silo": p.get("source_silo"),
                "dest1": p.get("dest1"),
                "dest2": p.get("dest2"),
                "cc25_sel": p.get("cc25_sel"),
                "declared_qty_kg": p.get("declared_qty_kg"),
                "scale_sel": p.get("scale_sel"),
            }
            url = f"{PLC_BASE_URL}/api/plc/db/4/bulk/write"

        else:  # pit
            body = {
                "pit_no": p.get("pit_no"),
                "raw_code": p.get("raw_code"),
                "dest1": p.get("dest1"),
                "dest2": p.get("dest2"),
                "declared_qty_kg": p.get("declared_qty_kg"),
                "scale_sel": p.get("scale_sel"),
            }
            url = f"{PLC_BASE_URL}/api/plc/db/4/pit/write"

        r = requests.post(url, json=body, timeout=8)
        # Bubble up the PLC response (422 if HL/LOCK, 409 if not Idle, etc.)
        return jsonify(r.json()), r.status_code

    except requests.RequestException as e:
        return jsonify({"error": f"PLC call failed: {e}"}), 502
        

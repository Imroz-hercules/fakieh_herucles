# routes/wb_form.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
import uuid

from models import db
from models.weigh_visit import WeighVisit
from models.truck import Truck  , Driver        # columns: id, license, model, capacity, company, contact, rfid
       # columns: id, name, license_no, contact, rfid
from models.orders import IntakeOrder, OutloadingOrder

wb_form = Blueprint("wb_form", __name__, url_prefix="/api/wb-form")

# ----- helpers: resolve everything from RFID -----
INTAKE_RFID_FIELDS  = ("rfid_badge_reading", "badge_no")
OUTLOAD_RFID_FIELDS = ("rfid_set", "rfid_badge_reading", "badge_no")

def _has(model, name): return hasattr(model, name)

def _find_intake_by_rfid(rfid):
    conds = [getattr(IntakeOrder, f) == rfid for f in INTAKE_RFID_FIELDS if _has(IntakeOrder, f)]
    return IntakeOrder.query.filter(or_(*conds)).order_by(IntakeOrder.id.desc()).first() if conds else None

def _find_outload_by_rfid(rfid):
    conds = [getattr(OutloadingOrder, f) == rfid for f in OUTLOAD_RFID_FIELDS if _has(OutloadingOrder, f)]
    return OutloadingOrder.query.filter(or_(*conds)).order_by(OutloadingOrder.id.desc()).first() if conds else None

def _resolve_order_flow_material(rfid):
    o = _find_intake_by_rfid(rfid)
    if o: return o.id, "intake", getattr(o, "source_material_code", None), 1
    o = _find_outload_by_rfid(rfid)
    if o: return o.id, "loadout", getattr(o, "source_material_code", None), 2
    return None, None, None, None

def _resolve_truck_by_rfid(rfid):
    t = Truck.query.filter_by(rfid=rfid).first()
    if not t: return {}
    return {
        "truck_id": t.id,
        "truck_plate": getattr(t, "license", None),
        "truck_model": getattr(t, "model", None),
        "truck_company": getattr(t, "company", None),
        "truck_capacity": str(getattr(t, "capacity", "")).strip() or None,
        "truck_contact": getattr(t, "contact", None),
    }

def _resolve_driver_by_rfid(rfid):
    d = Driver.query.filter_by(rfid=rfid).first()
    if not d: return {}
    return {
        "driver_id": d.id,
        "driver_name": getattr(d, "name", None),
        "driver_license": getattr(d, "license_no", None),
        "driver_contact": getattr(d, "contact", None),
    }

# ----- 1) ENTRY FORM: RFID + entry_weight -> create visit & store entry -----
@wb_form.route("/create", methods=["POST"])
def create_and_entry():
    """
    Body:
    {
      "rfid": "RFID1",         # required
      "entry_weight": 15000    # required (kg)
    }
    """
    data = request.get_json(force=True) or {}
    rfid = (data.get("rfid") or "").strip()
    ew   = data.get("entry_weight")

    if not rfid: return jsonify({"error":"rfid is required"}), 400
    if ew is None: return jsonify({"error":"entry_weight is required"}), 400

    order_id, flow_type, material, scale = _resolve_order_flow_material(rfid)
    if not order_id:
        return jsonify({"error": f"No intake/outloading order found for RFID {rfid}"}), 404

    tinfo = _resolve_truck_by_rfid(rfid)
    dinfo = _resolve_driver_by_rfid(rfid)

    ticket = f"WB-{uuid.uuid4().hex[:8]}"
    now = datetime.utcnow()
    try:
        v = WeighVisit(
            ticket=ticket,
            rfid=rfid,
            order_id=order_id,
            flow_type=flow_type,
            scale=scale,
            material=material,
            entry_weight=float(ew),
            entry_time=now,
            status="open",
            **tinfo,
            **dinfo
        )
        db.session.add(v)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "failed to save entry", "detail": str(e)}), 500

    return jsonify({
        "visit_id": ticket,
        "status": "entry_saved",
        "rfid": rfid,
        "entry_weight": v.entry_weight,
        "flow_type": flow_type,
        "order_id": order_id,
        "material": material,
        "truck": {k:v2 for k,v2 in tinfo.items()},
        "driver": {k:v2 for k,v2 in dinfo.items()}
    }), 200

# ----- 2) EXIT FORM: visit_id + exit_weight -> close & compute net -----
@wb_form.route("/finish", methods=["POST"])
def finish_with_exit():
    """
    Body:
    {
      "visit_id": "WB-xxxxxxx",  # required
      "exit_weight": 8200        # required (kg)
    }
    """
    data = request.get_json(force=True) or {}
    ticket = (data.get("visit_id") or "").strip()
    xw     = data.get("exit_weight")

    if not ticket: return jsonify({"error":"visit_id is required"}), 400
    if xw is None: return jsonify({"error":"exit_weight is required"}), 400

    v = WeighVisit.query.filter_by(ticket=ticket).first()
    if not v: return jsonify({"error": f"visit '{ticket}' not found"}), 404
    if v.status == "closed": return jsonify({"error": f"visit '{ticket}' already closed"}), 409

    try:
        v.exit_weight = float(xw)
        v.exit_time = datetime.utcnow()
        net = abs((v.exit_weight or 0) - (v.entry_weight or 0))
        v.status = "closed"
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "failed to save exit", "detail": str(e)}), 500

    return jsonify({
        "visit_id": ticket,
        "status": "completed",
        "entry_weight": v.entry_weight,
        "exit_weight": v.exit_weight,
        "net": net,                           # kg
        "flow_type": v.flow_type,
        "order_id": v.order_id,
        "material": v.material,
        "truck": {"id": v.truck_id, "plate": v.truck_plate, "driver": v.driver_name}
    }), 200

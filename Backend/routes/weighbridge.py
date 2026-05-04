
# # from flask import Blueprint, request, jsonify
# # from models import db
# # from models.weighbridge import WeighbridgeRecord
# # import random

# # weighbridge_bp = Blueprint('weighbridge', __name__, url_prefix='/api/weighbridge')

# # # Get all records
# # @weighbridge_bp.route('/', methods=['GET'])
# # def get_all():
# #     records = WeighbridgeRecord.query.all()
# #     return jsonify([r.to_dict() for r in records])

# # # Get single record by id
# # @weighbridge_bp.route('/<int:truck_id>', methods=['GET'])
# # def get_by_id(truck_id):
# #     record = WeighbridgeRecord.query.get(truck_id)
# #     if not record:
# #         return jsonify({'error': 'Not found'}), 404
# #     return jsonify(record.to_dict())

# # # Create new record
# # @weighbridge_bp.route('/', methods=['POST'])
# # def create():
# #     data = request.json
# #     record = WeighbridgeRecord(
# #         truck_plate = data['truck_plate'],
# #         truck_driver = data['truck_driver'],
# #         truck_material = data['truck_material'],
# #         weight = data['weight'],
# #         rfid_linked = data['rfid_linked'],
# #         order_linked = data.get('order_linked')
# #     )
# #     db.session.add(record)
# #     db.session.commit()
# #     return jsonify(record.to_dict()), 201

# # # Update record
# # @weighbridge_bp.route('/<int:truck_id>', methods=['PUT'])
# # def update(truck_id):
# #     data = request.json
# #     record = WeighbridgeRecord.query.get(truck_id)
# #     if not record:
# #         return jsonify({'error': 'Not found'}), 404
# #     record.truck_plate = data['truck_plate']
# #     record.truck_driver = data['truck_driver']
# #     record.truck_material = data['truck_material']
# #     record.weight = data['weight']
# #     record.rfid_linked = data['rfid_linked']
# #     record.order_linked = data.get('order_linked')
# #     db.session.commit()
# #     return jsonify(record.to_dict())

# # # Delete record
# # @weighbridge_bp.route('/<int:truck_id>', methods=['DELETE'])
# # def delete(truck_id):
# #     record = WeighbridgeRecord.query.get(truck_id)
# #     if not record:
# #         return jsonify({'error': 'Not found'}), 404
# #     db.session.delete(record)
# #     db.session.commit()
# #     return '', 204

# # # Live weight simulation route
# # @weighbridge_bp.route('/live', methods=['GET'])
# # def get_fake_live_weight():
# #     # Simulate a live weight between 8000 and 12000 KG
# #     weight = round(random.uniform(8000, 12000), 2)
# #     return jsonify({'weight': weight})
# # weighbridge.py (additions)
# # from flask import Blueprint, request, jsonify
# # from datetime import datetime, date

# # from models import db
# # from models.weighbridge import WeighbridgeRecord
# # from models.truck import Truck
# # from models.orders import IntakeOrder, OutloadingOrder  # include whichever you have
# # from models.rfid import RFIDTag  # if you maintain RFID tags table

# # weighbridge_bp = Blueprint('weighbridge', __name__, url_prefix='/api/weighbridge')

# # def find_active_order_by_rfid(rfid: str):
# #     """
# #     Try intake first. If you also support outloading, check there too.
# #     Adjust WHERE clauses to match your schema (status_word='Active', rfid_badge_reading=rfid).
# #     """
# #     q = IntakeOrder.query.filter(
# #         IntakeOrder.rfid_badge_reading == rfid,
# #         IntakeOrder.status_word == 'Active'
# #     ).all()

# #     if len(q) == 1:
# #         return ('intake', q[0])

# #     if len(q) > 1:
# #         return ('conflict', q)  # multiple intake matches

# #     # If no intake match, optionally check outloading
# #     try:
# #         q2 = OutloadingOrder.query.filter(
# #             OutloadingOrder.rfid_badge_reading == rfid,
# #             OutloadingOrder.status_word == 'Active'
# #         ).all()
# #     except Exception:
# #         q2 = []

# #     if len(q2) == 1:
# #         return ('outloading', q2)
# #     if len(q2) > 1:
# #         return ('conflict', q2)

# #     return (None, None)

# # def find_truck_by_rfid(rfid: str):
# #     """
# #     Resolve Truck linked to the RFID. Adjust field name based on your schema.
# #     If you don’t store rfid on Truck, resolve via RFIDTag table that links to Truck.
# #     """
# #     # Option A: truck has rfid_number column
# #     truck = Truck.query.filter_by(rfid_number=rfid).first()
# #     if truck:
# #         return truck

# #     # Option B: RFIDTag that references truck_id (adjust as per your schema)
# #     try:
# #         tag = RFIDTag.query.filter_by(rfid_number=rfid).first()  # adjust column to tag_id/rfid_number
# #         if tag and getattr(tag, 'truck_id', None):
# #             t = Truck.query.get(tag.truck_id)
# #             if t:
# #                 return t
# #     except Exception:
# #         pass

# #     return None

# # def get_today_records(order_id: int, truck_id: int):
# #     """
# #     Fetch today’s weigh records for this order+truck pair.
# #     If you prefer not to filter by date, you can remove that condition.
# #     """
# #     start = datetime.combine(date.today(), datetime.min.time())
# #     end = datetime.combine(date.today(), datetime.max.time())
# #     return WeighbridgeRecord.query.filter(
# #         WeighbridgeRecord.order_id == order_id,
# #         WeighbridgeRecord.truck_id == truck_id,
# #         WeighbridgeRecord.timestamp >= start,
# #         WeighbridgeRecord.timestamp <= end
# #     ).order_by(WeighbridgeRecord.timestamp.asc()).all()

# # def decide_stage_auto(flow_type: str, existing_modes: list[str]):
# #     """
# #     Decide which stage to capture based on order flow and existing records.
# #     Intake (unloading): first GROSS then TARE
# #     Outloading (loading): first TARE then GROSS
# #     """
# #     has_tare = 'TARE' in existing_modes
# #     has_gross = 'GROSS' in existing_modes

# #     if has_tare and has_gross:
# #         return None  # already completed

# #     if flow_type == 'intake':
# #         # GROSS first, then TARE
# #         if not has_gross:
# #             return 'GROSS'
# #         return 'TARE'
# #     else:
# #         # outloading (default): TARE first, then GROSS
# #         if not has_tare:
# #             return 'TARE'
# #         return 'GROSS'

# # def compute_net_and_validate(order, gross: float, tare: float):
# #     """
# #     Compute net and (optionally) validate against declared quantity with tolerance.
# #     Adjust declared field/tolerance logic to your schema.
# #     """
# #     net = abs((gross or 0) - (tare or 0))
# #     declared = getattr(order, 'declared_quantity_kg', None)
# #     within_tolerance = None

# #     if declared:
# #         # simple ±2% tolerance or ±50kg (whichever larger)
# #         pct_tol = max(declared * 0.02, 50.0)
# #         within_tolerance = abs(net - declared) <= pct_tol

# #     return net, declared, within_tolerance

# # @weighbridge_bp.route('/capture-by-rfid', methods=['POST'])
# # def capture_by_rfid():
# #     """
# #     Minimal endpoint: capture a weigh by RFID without separate linking.
# #     Body:
# #     {
# #       "rfid": "RFID1",
# #       "weight": 15000,          # scale reading (demo or real)
# #       "stage": "AUTO"|"TARE"|"GROSS"  # optional, default AUTO
# #     }
# #     Steps:
# #       - Resolve order and truck by RFID
# #       - Decide stage automatically if AUTO
# #       - Persist WeighbridgeRecord
# #       - If both stages exist now, compute net and return completion receipt
# #     """
# #     data = request.get_json(force=True)
# #     rfid = data.get('rfid')
# #     weight = data.get('weight')
# #     stage = (data.get('stage') or 'AUTO').upper()

# #     if not rfid or weight is None:
# #         return jsonify({"error": "rfid and weight are required"}), 400

# #     flow_type, order_or_list = find_active_order_by_rfid(rfid)
# #     if flow_type == 'conflict':
# #         return jsonify({
# #             "error": "Multiple active orders found for RFID",
# #             "matches": [getattr(o, 'id', None) for o in order_or_list]
# #         }), 409

# #     if not order_or_list:
# #         return jsonify({"error": f"No active order found for RFID {rfid}"}), 404

# #     order = order_or_list  # IntakeOrder or OutloadingOrder instance

# #     truck = find_truck_by_rfid(rfid)
# #     if not truck:
# #         return jsonify({"error": f"No truck linked to RFID {rfid}"}), 404

# #     # Fetch existing records for today to decide stage or detect completion
# #     existing = get_today_records(order_id=order.id, truck_id=truck.id)
# #     existing_modes = [e.mode for e in existing]

# #     if stage == 'AUTO':
# #         stage = decide_stage_auto(flow_type, existing_modes)
# #         if stage is None:
# #             return jsonify({"error": "Weigh already completed for this order+truck today"}), 409
# #     elif stage not in ('TARE', 'GROSS'):
# #         return jsonify({"error": "stage must be AUTO, TARE, or GROSS"}), 400
# #     else:
# #         # If operator forced a stage, reject duplicates
# #         if stage in existing_modes:
# #             return jsonify({"error": f"{stage} already captured for this order+truck today"}), 409

# #     # Persist record
# #     try:
# #         wb = WeighbridgeRecord(
# #             truck_id=truck.id,
# #             order_id=order.id,
# #             mode=stage,
# #             weight=float(weight),
# #             timestamp=datetime.utcnow(),
# #             rfid_linked=True,
# #             # Adjust field names if your model differs:
# #             truck_plate=getattr(truck, 'license', None),
# #             truck_driver=getattr(truck, 'contact', None),
# #             truck_material=getattr(order, 'source_material_code', None) or getattr(order, 'material_code', None)
# #         )
# #         db.session.add(wb)
# #         db.session.commit()
# #     except Exception as e:
# #         db.session.rollback()
# #         return jsonify({"error": "Failed to save weighbridge record", "detail": str(e)}), 500

# #     # Re-fetch existing including this one
# #     existing = get_today_records(order_id=order.id, truck_id=truck.id)
# #     gross_val = next((x.weight for x in existing if x.mode == 'GROSS'), None)
# #     tare_val = next((x.weight for x in existing if x.mode == 'TARE'), None)

# #     if gross_val is not None and tare_val is not None:
# #         net, declared, within_tol = compute_net_and_validate(order, gross_val, tare_val)
# #         # Optionally update order status/progress here
# #         # order.status_word = 'Completed'  # if you want to mark complete
# #         # db.session.commit()
# #         return jsonify({
# #             "status": "completed",
# #             "flow_type": flow_type,
# #             "order_id": order.id,
# #             "truck_id": truck.id,
# #             "captured_stage": stage,
# #             "gross": gross_val,
# #             "tare": tare_val,
# #             "net": net,
# #             "declared_quantity_kg": declared,
# #             "within_tolerance": within_tol,
# #             "rfid_linked": True
# #         }), 200

# #     # Not complete yet (first capture)
# #     return jsonify({
# #         "status": "captured",
# #         "flow_type": flow_type,
# #         "order_id": order.id,
# #         "truck_id": truck.id,
# #         "captured_stage": stage,
# #         "gross": gross_val,
# #         "tare": tare_val,
# #         "net": None,
# #         "rfid_linked": True
# #     }), 200
# from flask import Blueprint, request, jsonify
# from datetime import datetime, date
# import random

# from models import db
# from models.weighbridge import WeighbridgeRecord
# from models.truck import Truck
# from models.orders import IntakeOrder, OutloadingOrder  # include whichever you actually have
# from models.rfid import RFIDTag  # if you maintain RFID tag records

# weighbridge_bp = Blueprint('weighbridge', __name__, url_prefix='/api/weighbridge')

# # ----------------------
# # Demo scale (instant-stable)
# # ----------------------
# SCALE = {"value": 0.0, "stable": False, "last_update": None}

# @weighbridge_bp.route('/live', methods=['GET'])
# def live():
#     """
#     Demo scale: instantly stable when target is provided.
#     GET /api/weighbridge/live?target=15000
#     """
#     target_q = request.args.get('target')
#     now = datetime.utcnow().isoformat() + "Z"
#     if target_q is not None:
#         try:
#             target = float(target_q)
#         except ValueError:
#             return jsonify({"error": "target must be numeric"}), 400
#         SCALE["value"] = target
#         SCALE["stable"] = True
#         SCALE["last_update"] = now
#     else:
#         # idle drift
#         SCALE["value"] = max(0.0, SCALE["value"] + random.uniform(-0.5, 0.5))
#         SCALE["stable"] = False
#         SCALE["last_update"] = now

#     return jsonify({
#         "weight": round(SCALE["value"], 1),
#         "stable": SCALE["stable"],
#         "last_update": SCALE["last_update"]
#     }), 200

# # ----------------------
# # Helpers
# # ----------------------

# def find_active_intake_by_rfid(rfid: str):
#     """Return list of active intake orders matching this RFID."""
#     return IntakeOrder.query.filter(
#         IntakeOrder.rfid_badge_reading == rfid,
#         IntakeOrder.status_word == 'Active'
#     ).all()

# def find_active_outloading_by_rfid(rfid: str):
#     """Return list of active outloading orders matching this RFID (if you have them)."""
#     try:
#         return OutloadingOrder.query.filter(
#             OutloadingOrder.rfid_badge_reading == rfid,
#             OutloadingOrder.status_word == 'Active'
#         ).all()
#     except Exception:
#         return []

# def resolve_order(rfid: str, order_id: int | None):
#     """
#     Resolve a single order for this RFID.
#     Priority:
#       - If order_id provided: fetch by id (intake first, then outloading), validate Active and RFID match.
#       - Else auto-find by RFID:
#           - If exactly one intake match, use intake.
#           - Else if none in intake, check outloading.
#           - If multiple matches in any, return conflict.
#     Returns: (flow_type: 'intake'|'outloading', order) or raises a JSON error response.
#     """
#     if order_id:
#         # Try Intake
#         order = IntakeOrder.query.get(order_id)
#         flow_type = 'intake' if order else None

#         # Try Outloading if not found in Intake
#         if not order:
#             try:
#                 order = OutloadingOrder.query.get(order_id)
#                 if order:
#                     flow_type = 'outloading'
#             except Exception:
#                 order = None

#         if not order:
#             return None, jsonify({"error": f"Order {order_id} not found"}), 404

#         if getattr(order, 'rfid_badge_reading', None) != rfid:
#             return None, jsonify({"error": "RFID does not match the selected order"}), 409

#         if getattr(order, 'status_word', None) != 'Active':
#             return None, jsonify({"error": "Selected order is not Active"}), 409

#         return flow_type, order, None

#     # No specific order_id provided: auto-find
#     intake_matches = find_active_intake_by_rfid(rfid)
#     if len(intake_matches) == 1:
#         return 'intake', intake_matches[0], None
#     if len(intake_matches) > 1:
#         return None, jsonify({
#             "error": "Multiple active orders found for RFID (intake)",
#             "matches": [getattr(o, 'id', None) for o in intake_matches]
#         }), 409

#     out_matches = find_active_outloading_by_rfid(rfid)
#     if len(out_matches) == 1:
#         return 'outloading', out_matches, None
#     if len(out_matches) > 1:
#         return None, jsonify({
#             "error": "Multiple active orders found for RFID (outloading)",
#             "matches": [getattr(o, 'id', None) for o in out_matches]
#         }), 409

#     return None, jsonify({"error": f"No active order found for RFID {rfid}"}), 404

# def resolve_truck(rfid: str):
#     """
#     Find Truck bound to this RFID.
#     Adjust field names based on your schema:
#       - Option A: Truck.rfid_number
#       - Option B: RFIDTag.rfid_number (or tag_id) with tag.truck_id
#     """
#     # Option A
#     t = Truck.query.filter_by(rfid=rfid).first()
#     if t:
#         return t

#     # Option B
#     try:
#         tag = RFIDTag.query.filter_by(rfid_number=rfid).first()  # adjust field name if needed
#         if tag and getattr(tag, 'truck_id', None):
#             t2 = Truck.query.get(tag.truck_id)
#             if t2:
#                 return t2
#     except Exception:
#         pass
        

#     return None

# def get_today_records(order_id: int, truck_id: int):
#     start = datetime.combine(date.today(), datetime.min.time())
#     end = datetime.combine(date.today(), datetime.max.time())
#     return WeighbridgeRecord.query.filter(
#         WeighbridgeRecord.order_id == order_id,
#         WeighbridgeRecord.truck_id == truck_id,
#         WeighbridgeRecord.timestamp >= start,
#         WeighbridgeRecord.timestamp <= end
#     ).order_by(WeighbridgeRecord.timestamp.asc()).all()

# def decide_stage_auto(flow_type: str, existing_modes: list[str]):
#     """
#     Intake (unloading): first GROSS then TARE.
#     Outloading (loading): first TARE then GROSS.
#     """
#     has_tare = 'TARE' in existing_modes
#     has_gross = 'GROSS' in existing_modes

#     if has_tare and has_gross:
#         return None  # already completed

#     if flow_type == 'intake':
#         return 'GROSS' if not has_gross else 'TARE'
#     else:
#         return 'TARE' if not has_tare else 'GROSS'

# def compute_net(order, gross: float | None, tare: float | None):
#     net = abs((gross or 0.0) - (tare or 0.0))
#     declared = getattr(order, 'declared_quantity_kg', None)
#     within_tolerance = None
#     if declared is not None:
#         tol = max(declared * 0.02, 50.0)  # ±2% or ±50kg
#         within_tolerance = abs(net - declared) <= tol
#     return net, declared, within_tolerance

# # ----------------------
# # Core RFID-first capture
# # ----------------------

# @weighbridge_bp.route('/capture-by-rfid', methods=['POST'])
# def capture_by_rfid():
#     """
#     Body:
#     {
#       "rfid": "RFID1",
#       "weight": 15000,          # scale reading
#       "stage": "AUTO"|"TARE"|"GROSS",   # optional, default AUTO
#       "order_id": 1             # optional, to resolve duplicates
#     }
#     """
#     data = request.get_json(force=True)
#     rfid = data.get('rfid')
#     weight = data.get('weight')
#     stage = (data.get('stage') or 'AUTO').upper()
#     order_id = data.get('order_id')

#     if not rfid or weight is None:
#         return jsonify({"error": "rfid and weight are required"}), 400

#     # Resolve order
#     flow_type, order, err = resolve_order(rfid, order_id)
#     if err:
#         return err

#     # Resolve truck
#     truck = resolve_truck(rfid)
#     if not truck:
#         return jsonify({"error": f"No truck linked to RFID {rfid}"}), 404

#     # Existing for today
#     existing = get_today_records(order.id, truck.id)
#     existing_modes = [e.mode for e in existing]

#     # Decide stage
#     if stage == 'AUTO':
#         stage = decide_stage_auto(flow_type, existing_modes)
#         if stage is None:
#             return jsonify({"error": "Weigh already completed for this order+truck today"}), 409
#     elif stage not in ('TARE', 'GROSS'):
#         return jsonify({"error": "stage must be AUTO, TARE, or GROSS"}), 400
#     else:
#         if stage in existing_modes:
#             return jsonify({"error": f"{stage} already captured for this order+truck today"}), 409

#     # Persist record
#     try:
#         wb = WeighbridgeRecord(
#             truck_id=truck.id,
#             order_id=order.id,
#             mode=stage,
#             weight=float(weight),
#             timestamp=datetime.utcnow(),
#             rfid_linked=True,
#             # adjust field names based on your models:
#             truck_plate=getattr(truck, 'license', None),
#             truck_driver=getattr(truck, 'contact', None),
#             truck_material=getattr(order, 'source_material_code', None) or getattr(order, 'material_code', None)
#         )
#         db.session.add(wb)
#         db.session.commit()
#     except Exception as e:
#         db.session.rollback()
#         return jsonify({"error": "Failed to save weighbridge record", "detail": str(e)}), 500

#     # Completion check
#     existing = get_today_records(order.id, truck.id)
#     gross_val = next((x.weight for x in existing if x.mode == 'GROSS'), None)
#     tare_val = next((x.weight for x in existing if x.mode == 'TARE'), None)

#     if gross_val is not None and tare_val is not None:
#         net, declared, within_tol = compute_net(order, gross_val, tare_val)
#         # Optional order status update here, e.g.:
#         # order.status_word = 'Completed'
#         # db.session.commit()
#         return jsonify({
#             "status": "completed",
#             "flow_type": flow_type,
#             "order_id": order.id,
#             "truck_id": truck.id,
#             "captured_stage": stage,
#             "gross": gross_val,
#             "tare": tare_val,
#             "net": net,
#             "declared_quantity_kg": declared,
#             "within_tolerance": within_tol,
#             "rfid_linked": True
#         }), 200

#     return jsonify({
#         "status": "captured",
#         "flow_type": flow_type,
#         "order_id": order.id,
#         "truck_id": truck.id,
#         "captured_stage": stage,
#         "gross": gross_val,
#         "tare": tare_val,
#         "net": None,
#         "rfid_linked": True
#     }), 200

# # ----------------------
# # CRUD: list/get/update/delete
# # Fix paths to avoid route collisions
# # ----------------------

# @weighbridge_bp.route('/', methods=['GET'])
# def list_records():
#     records = WeighbridgeRecord.query.order_by(WeighbridgeRecord.timestamp.desc()).all()
#     return jsonify([r.to_dict() for r in records]), 200

# @weighbridge_bp.route('/<int:record_id>', methods=['GET'])
# def get_record(record_id):
#     r = WeighbridgeRecord.query.get(record_id)
#     if not r:
#         return jsonify({"error": "Not found"}), 404
#     return jsonify(r.to_dict()), 200

# @weighbridge_bp.route('/', methods=['POST'])
# def create_record_manual():
#     """
#     Keep your original POST if you want manual inserts from UI.
#     """
#     data = request.get_json(force=True)
#     try:
#         r = WeighbridgeRecord(
#             truck_plate=data.get('truck_plate'),
#             truck_driver=data.get('truck_driver'),
#             truck_material=data.get('truck_material'),
#             weight=float(data.get('weight')),
#             rfid_linked=bool(data.get('rfid_linked', False)),
#             order_linked=data.get('order_linked'),
#             timestamp=datetime.utcnow()
#         )
#         db.session.add(r)
#         db.session.commit()
#         return jsonify(r.to_dict()), 201
#     except Exception as e:
#         db.session.rollback()
#         return jsonify({"error": "Create failed", "detail": str(e)}), 500

# @weighbridge_bp.route('/<int:record_id>', methods=['PUT'])
# def update_record(record_id):
#     r = WeighbridgeRecord.query.get(record_id)
#     if not r:
#         return jsonify({"error": "Not found"}), 404
#     data = request.get_json(force=True)
#     try:
#         if 'weight' in data: r.weight = float(data['weight'])
#         if 'rfid_linked' in data: r.rfid_linked = bool(data['rfid_linked'])
#         if 'order_linked' in data: r.order_linked = data['order_linked']
#         db.session.commit()
#         return jsonify(r.to_dict()), 200
#     except Exception as e:
#         db.session.rollback()
#         return jsonify({"error": "Update failed", "detail": str(e)}), 500

# @weighbridge_bp.route('/<int:record_id>', methods=['DELETE'])
# def delete_record(record_id):
#     r = WeighbridgeRecord.query.get(record_id)
#     if not r:
#         return jsonify({"error": "Not found"}), 404
#     try:
#         db.session.delete(r)
#         db.session.commit()
#         return jsonify({"deleted": record_id}), 200
#     except Exception as e:
#         db.session.rollback()
#         return jsonify({"error": "Delete failed", "detail": str(e)}), 500


# backend/routes/weighbridge.py
# backend/routes/weighbridge.py
# backend/routes/weighbridge.py

from __future__ import annotations
from typing import Optional, Tuple, List
from datetime import datetime

from flask import Blueprint, request, jsonify
from sqlalchemy import func, or_

# ---- Your app imports ----
from models import db
from models.weighbridge import WeighbridgeRecord
from models.truck import Truck                  # keep if you have a Truck model
from models.orders import IntakeOrder, OutloadingOrder

weighbridge_bp = Blueprint("weighbridge", __name__, url_prefix="/api/weighbridge")

# ---------------- Config / constants ----------------
TIMEZONE_NAME = "Asia/Kolkata"  # business-day boundary
OPEN_STATUS_VALUES = {"Open", "Pending", "InProgress"}  # tweak to your statuses

# Which columns hold RFID in your orders
INTAKE_RFID_FIELDS = ("rfid_badge_reading", "badge_no")
OUTLOAD_RFID_FIELDS = ("rfid_set", "rfid_badge_reading", "badge_no")

# Which column is declared qty
DECLARED_QTY_FIELD = "declared_quantity_kg"

# Truck RFID candidates
TRUCK_RFID_FIELDS = ("rfid", "rfid_tag", "badge_id", "tag_uid")


# ---------------- Utility helpers ----------------
def _has_col(model_cls, name: str) -> bool:
    return hasattr(model_cls, name)

def _first_existing(model_cls, names: tuple[str, ...]) -> Optional[str]:
    for n in names:
        if _has_col(model_cls, n):
            return n
    return None


def resolve_truck(rfid: str) -> Optional[Truck]:
    """Find a Truck by RFID-like field; return None if not found/column missing."""
    col = _first_existing(Truck, TRUCK_RFID_FIELDS)
    if not col:
        return None
    return Truck.query.filter(getattr(Truck, col) == rfid).first()


def _pick_open_first(query, status_col_name: Optional[str]):
    if status_col_name:
        status_col = getattr(query.column_descriptions[0]["entity"], status_col_name)
        # Use a simpler approach that works with all SQLAlchemy versions
        query = query.order_by(
            status_col.in_(list(OPEN_STATUS_VALUES)).desc(),  # Open statuses first
            getattr(query.column_descriptions[0]["entity"], "id").desc()
        )
    else:
        query = query.order_by(getattr(query.column_descriptions[0]["entity"], "id").desc())
    return query


def _find_intake_by_rfid(rfid: str) -> Optional[IntakeOrder]:
    conds = []
    for f in INTAKE_RFID_FIELDS:
        if _has_col(IntakeOrder, f):
            conds.append(getattr(IntakeOrder, f) == rfid)
    if not conds:
        return None
    q = IntakeOrder.query.filter(or_(*conds))
    # Prefer open
    status_col = "status_word" if _has_col(IntakeOrder, "status_word") else None
    q = _pick_open_first(q, status_col)
    return q.first()


def _find_outload_by_rfid(rfid: str) -> Optional[OutloadingOrder]:
    conds = []
    for f in OUTLOAD_RFID_FIELDS:
        if _has_col(OutloadingOrder, f):
            conds.append(getattr(OutloadingOrder, f) == rfid)
    if not conds:
        return None
    q = OutloadingOrder.query.filter(or_(*conds))
    status_col = "status_word" if _has_col(OutloadingOrder, "status_word") else None
    q = _pick_open_first(q, status_col)
    return q.first()


def resolve_scale(scale_in, flow_type: Optional[str]) -> Optional[int]:
    """
    1 → Scale 1 (Intake), 2 → Scale 2 (Loadout).
    If not provided, infer from flow_type.
    """
    if scale_in is None:
        ft = (flow_type or "").lower()
        if ft == "intake":
            return 1
        if ft in ("dispatch", "loadout", "outloading"):
            return 2
        return None

    if isinstance(scale_in, int):
        return scale_in if scale_in in (1, 2) else None

    s = str(scale_in).strip().upper()
    if s in ("1", "SCALE_1"): return 1
    if s in ("2", "SCALE_2"): return 2
    return None


def decide_stage_auto_by_scale(flow_type: str, existing_modes: List[str]) -> Optional[str]:
    """
    Intake (Scale 1): first GROSS, then TARE.
    Loadout (Scale 2): first TARE, then GROSS.
    """
    ft = (flow_type or "").lower()
    order_pref = ["GROSS", "TARE"] if ft == "intake" else ["TARE", "GROSS"]

    seen = set(m for m in existing_modes if m in ("TARE", "GROSS"))
    if not seen:
        return order_pref[0]
    if len(seen) == 1:
        return "TARE" if "GROSS" in seen else "GROSS"
    return None  # both present


def get_today_records(order_id: int, truck_id: int) -> List[WeighbridgeRecord]:
    local_ts  = func.timezone(TIMEZONE_NAME, WeighbridgeRecord.timestamp)
    local_now = func.timezone(TIMEZONE_NAME, func.now())
    return (WeighbridgeRecord.query
            .filter(
                WeighbridgeRecord.order_id == order_id,
                WeighbridgeRecord.truck_id == truck_id,
                func.date(local_ts) == func.date(local_now),
            )
            .order_by(WeighbridgeRecord.timestamp.asc())
            .all())


def compute_net(declared_quantity_kg: Optional[float], gross: float, tare: float) -> tuple[float, Optional[float], Optional[bool]]:
    net = abs(float(gross) - float(tare))
    declared = float(declared_quantity_kg) if declared_quantity_kg not in (None, "") else None
    within_tol = None
    if declared and declared > 0:
        tol_abs = max(0.02 * declared, 100.0)
        within_tol = (abs(net - declared) <= tol_abs)
    return net, declared, within_tol


def resolve_flow_and_order(rfid: str, order_id: Optional[int], scale_hint: Optional[int]) -> Tuple[str, object, Optional[tuple]]:
    """
    Returns (flow_type, order_obj, err)
    flow_type: 'intake' or 'loadout'
    order_obj: IntakeOrder or OutloadingOrder
    """
    # If order_id is given, try Intake first, then Outloading
    if order_id:
        order = IntakeOrder.query.get(order_id)
        if order:
            return "intake", order, None
        order = OutloadingOrder.query.get(order_id)
        if order:
            return "loadout", order, None
        return "", None, (jsonify({"error": f"order_id {order_id} not found in intake/outloading orders"}), 404)

    # No order_id: use scale hint if present to pick the table
    if scale_hint == 1:
        order = _find_intake_by_rfid(rfid)
        if order:
            return "intake", order, None
        # fallback try outload
        order = _find_outload_by_rfid(rfid)
        if order:
            return "loadout", order, None
    elif scale_hint == 2:
        order = _find_outload_by_rfid(rfid)
        if order:
            return "loadout", order, None
        # fallback try intake
        order = _find_intake_by_rfid(rfid)
        if order:
            return "intake", order, None
    else:
        # No scale hint: try intake then outload
        order = _find_intake_by_rfid(rfid) or _find_outload_by_rfid(rfid)
        if order:
            flow = "intake" if isinstance(order, IntakeOrder) else "loadout"
            return flow, order, None

    return "", None, (jsonify({"error": "No matching intake/outloading order found for this RFID"}), 404)


# -------------------- Endpoint --------------------
@weighbridge_bp.route("/capture-by-rfid", methods=["POST"])
def capture_by_rfid():
    """
    Body:
    {
      "rfid": "RFID1",
      "weight": 15000,                       # kg
      "stage": "AUTO"|"TARE"|"GROSS",        # optional (default AUTO)
      "order_id": 1,                         # optional
      "scale": 1|2|"SCALE_1"|"SCALE_2"       # optional; inferred from flow_type if missing
    }
    """
    data = request.get_json(force=True) or {}
    rfid = data.get("rfid")
    weight = data.get("weight")
    stage_in = (data.get("stage") or "AUTO").upper()
    order_id = data.get("order_id")
    scale_in = data.get("scale")

    if not rfid or weight is None:
        return jsonify({"error": "rfid and weight are required"}), 400

    # Truck (needed for truck_id)
    truck = resolve_truck(rfid)
    if not truck:
        return jsonify({"error": f"No truck linked to RFID {rfid}"}), 404

    # Resolve flow/order (uses IntakeOrder/OutloadingOrder)
    scale_hint = resolve_scale(scale_in, None)  # we don’t know flow yet
    flow_type, order_obj, err = resolve_flow_and_order(rfid, order_id, scale_hint)
    if err:
        return err

    # Now resolve scale using the flow
    scale = resolve_scale(scale_in, flow_type)
    if scale not in (1, 2):
        return jsonify({"error": "scale must be 1 or 2 (or SCALE_1/SCALE_2), "
                                 "or be inferrable from flow_type=intake/loadout"}), 400

    # Today's existing for this order+truck
    existing = get_today_records(order_id=order_obj.id, truck_id=truck.id)
    existing_modes = [e.mode for e in existing if e.mode]

    # Stage decision/validation
    if stage_in == "AUTO":
        stage = decide_stage_auto_by_scale(flow_type, existing_modes)
        if stage is None:
            return jsonify({"error": "Weigh already completed for this order+truck today"}), 409
    elif stage_in in ("TARE", "GROSS"):
        if stage_in in existing_modes:
            return jsonify({"error": f"{stage_in} already captured for this order+truck today"}), 409
        stage = stage_in
    else:
        return jsonify({"error": "stage must be AUTO, TARE, or GROSS"}), 400

    # Persist
    try:
        # Grab declared qty/material if present on the order object
        declared_qty = getattr(order_obj, DECLARED_QTY_FIELD, None)
        material_code = getattr(order_obj, "source_material_code", None)

        wb = WeighbridgeRecord(
            truck_id=truck.id,
            order_id=order_obj.id,
            scale=scale,
            mode=stage,
            weight=float(weight),
            timestamp=datetime.utcnow(),
            rfid_linked=True,
            # mirror fields (optional)
            truck_plate=getattr(truck, "license", None),
            truck_driver=getattr(truck, "contact", None),
            truck_material=material_code
        )
        db.session.add(wb)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to save weighbridge record", "detail": str(e)}), 500

    # Completion check
    existing = get_today_records(order_id=order_obj.id, truck_id=truck.id)
    gross_val = next((x.weight for x in existing if x.mode == "GROSS"), None)
    tare_val  = next((x.weight for x in existing if x.mode == "TARE"), None)

    if gross_val is not None and tare_val is not None:
        net, declared, within_tol = compute_net(getattr(order_obj, DECLARED_QTY_FIELD, None), gross_val, tare_val)
        
        # Update order status to completed if possible
        if hasattr(order_obj, "status_word"):
            order_obj.status_word = "Completed"
            db.session.commit()
            
        return jsonify({
            "status": flow_type,                 # Show the flow type (intake/loadout)
            "progress": "completed",             # Indicate completion
            "flow_type": flow_type,              # Keep for backward compatibility
            "order_id": order_obj.id,
            "truck_id": truck.id,
            "scale": scale,
            "captured_stage": stage,
            "gross": gross_val,
            "tare": tare_val,
            "net": net,
            "declared_quantity_kg": declared,
            "within_tolerance": within_tol,
            "rfid_linked": True
        }), 200

    # Partial capture - update order status to in progress
    if hasattr(order_obj, "status_word"):
        order_obj.status_word = "InProgress"
        db.session.commit()
        
    return jsonify({
        "status": flow_type,                 # Show the flow type (intake/loadout)
        "progress": "captured",              # Indicate partial capture
        "flow_type": flow_type,              # Keep for backward compatibility
        "order_id": order_obj.id,
        "truck_id": truck.id,
        "scale": scale,
        "captured_stage": stage,
        "gross": gross_val,
        "tare": tare_val,
        "net": None,
        "rfid_linked": True
    }), 200

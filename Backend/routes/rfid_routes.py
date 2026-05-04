from flask import Blueprint, request, jsonify
from models import db
from models.rfid import RFIDTag, RFIDConfig
from models.truck import Truck
from models.weights import RFIDLog
# in rfid_routes.py
from flask import Response, stream_with_context
import json, time, random
from datetime import datetime

rfid_bp = Blueprint('rfid', __name__, url_prefix='/api/rfid')



@rfid_bp.route('/stream', methods=['GET'])
def stream_tags():
    def event_stream():
        while True:
            # emit a random dummy tag read every 2s
            payload = {
                "tagID": f"RFD-{random.randint(1,10):03d}",
                "lastSeen": f"Zone {random.choice(['A','B','C'])}",
                "batteryLevel": random.randint(20,100),
                "signalStrength": random.randint(30,100),
                "status": random.choice(["Active","Low Signal","Offline"]),
                "material": random.choice(["Wheat Feed","Corn Meal","Soybean"]),
                "container": f"Container #{random.randint(1,5)}",
                "lastUpdate": datetime.utcnow().isoformat() + "Z"
            }
            yield f"data: {json.dumps(payload)}\n\n"
            time.sleep(2)
    return Response(stream_with_context(event_stream()), mimetype='text/event-stream')

@rfid_bp.route('/simulate/seed', methods=['POST'])
def seed_dummy():
    samples = [
        {"tag_id":"RFD-001","status":"Active","material":"Wheat Feed","container":"Container #1"},
        {"tag_id":"RFD-002","status":"Active","material":"Corn Meal","container":"Container #2"},
        {"tag_id":"RFD-003","status":"Low Signal","material":"Soybean","container":"Container #3"},
    ]
    created = []
    for s in samples:
        tag = RFIDTag(
            tag_id=s["tag_id"],
            status=s["status"],
            material=s["material"],
            container=s["container"],
        )
        db.session.add(tag); created.append(tag)
    db.session.commit()
    return jsonify([t.to_dict() for t in created]), 201

@rfid_bp.route('/simulate/ping', methods=['POST'])
def simulate_ping():
    data = request.json or {}
    tag = RFIDTag.query.filter_by(tag_id=data.get('tagID')).first()
    if not tag:
        return jsonify({"error":"Unknown tagID"}), 404
    tag.last_seen = data.get('lastSeen', tag.last_seen)
    tag.signal_strength = data.get('signalStrength', tag.signal_strength)
    tag.battery_level = data.get('batteryLevel', tag.battery_level)
    tag.status = data.get('status', tag.status)
    tag.last_update = datetime.utcnow()
    db.session.commit()
    # also push to SSE clients by writing to a queue if you add one later
    return jsonify(tag.to_dict())

# === RFID Tags ===
@rfid_bp.route('/tags', methods=['GET'])
def get_tags():
    tags = RFIDTag.query.all()
    return jsonify([tag.to_dict() for tag in tags])

@rfid_bp.route('/tags', methods=['POST'])
def add_tag():
    data = request.json
    tag = RFIDTag(
        tag_id=data['tagID'],
        last_seen=data.get('lastSeen'),
        battery_level=data.get('batteryLevel'),
        signal_strength=data.get('signalStrength'),
        status=data.get('status'),
        material=data.get('material'),
        container=data.get('container'),
        last_update=data.get('lastUpdate')
    )
    db.session.add(tag)
    db.session.commit()
    return jsonify(tag.to_dict()), 201

@rfid_bp.route('/tags/<int:tag_id>', methods=['PUT'])
def update_tag(tag_id):
    tag = RFIDTag.query.get(tag_id)
    if not tag:
        return jsonify({'error': 'Not found'}), 404
    data = request.json
    tag.tag_id = data.get('tagID', tag.tag_id)
    tag.last_seen = data.get('lastSeen', tag.last_seen)
    tag.battery_level = data.get('batteryLevel', tag.battery_level)
    tag.signal_strength = data.get('signalStrength', tag.signal_strength)
    tag.status = data.get('status', tag.status)
    tag.material = data.get('material', tag.material)
    tag.container = data.get('container', tag.container)
    tag.last_update = data.get('lastUpdate', tag.last_update)
    db.session.commit()
    return jsonify(tag.to_dict())

@rfid_bp.route('/tags/<int:tag_id>', methods=['DELETE'])
def delete_tag(tag_id):
    tag = RFIDTag.query.get(tag_id)
    if not tag:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(tag)
    db.session.commit()
    return '', 204

# === RFID Config ===
@rfid_bp.route('/config', methods=['GET'])
def get_configs():
    configs = RFIDConfig.query.all()
    return jsonify([c.to_dict() for c in configs])

@rfid_bp.route('/config', methods=['POST'])
def add_config():
    try:
        data = request.json
        cfg = RFIDConfig(
            rfid_number=data['rfidNumber'],
            rfid_used=data.get('rfidUsed', False),
            rfid_linked_to_order=data.get('rfidLinkedToOrder', None)
        )
        db.session.add(cfg)
        db.session.commit()
        return jsonify(cfg.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error adding RFID config: {e}")
        return jsonify({'error': 'Failed to add RFID configuration. Please try again.'}), 500

@rfid_bp.route('/config/<int:config_id>', methods=['PUT'])
def update_config(config_id):
    try:
        cfg = RFIDConfig.query.get(config_id)
        if not cfg:
            return jsonify({'error': 'Not found'}), 404
        data = request.json
        cfg.rfid_number = data.get('rfidNumber', cfg.rfid_number)
        cfg.rfid_used = data.get('rfidUsed', cfg.rfid_used)
        cfg.rfid_linked_to_order = data.get('rfidLinkedToOrder', cfg.rfid_linked_to_order)
        db.session.commit()
        return jsonify(cfg.to_dict())
    except Exception as e:
        db.session.rollback()
        print(f"Error updating RFID config: {e}")
        return jsonify({'error': 'Failed to update RFID configuration. Please try again.'}), 500

@rfid_bp.route('/config/<int:config_id>', methods=['DELETE'])
def delete_config(config_id):
    try:
        cfg = RFIDConfig.query.get(config_id)
        if not cfg:
            return jsonify({'error': 'Not found'}), 404
        db.session.delete(cfg)
        db.session.commit()
        return '', 204
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting RFID config: {e}")
        return jsonify({'error': 'Failed to delete RFID configuration. Please try again.'}), 500

@rfid_bp.route('/config/assign', methods=['POST']) # TODO: this is the route that will be used to assign an RFID to a truck
def assign_rfid():
    """
    Body: { "rfidNumber": "11", "truckId": 123, "orderRef": "INT-2025-0001" }
    Marks the tag used, links it (for your UI), updates Truck.rfid_tag,
    and logs in RFIDLog (sent_to_plc=False). No PLC write here.
    """
    data = request.get_json(force=True) or {}
    number = (data.get('rfidNumber') or '').strip()
    truck_id = data.get('truckId')
    order_ref = (data.get('orderRef') or '').strip()

    if not number or not truck_id or not order_ref:
        return jsonify({"error": "rfidNumber, truckId, orderRef are required"}), 400

    tag = RFIDConfig.query.filter_by(rfid_number=number).first()
    if not tag:
        return jsonify({"error": "RFID not found"}), 404
    if tag.rfid_used:
        return jsonify({"error": "RFID already in use"}), 409

    truck = Truck.query.get(int(truck_id))
    if not truck:
        return jsonify({"error": "Truck not found"}), 404

    try:
        tag.rfid_used = True
        # optional: keep your existing field for showing linkage in UI
        tag.rfid_linked_to_order = order_ref

        # store on truck so we can auto-fill badge_no later
        truck.rfid_tag = number

        db.session.add(tag)
        db.session.add(truck)
        db.session.add(RFIDLog(
            rfid_number=number,
            truck_id=int(truck_id),
            order_ref=order_ref,
            sent_to_plc=False,
            plc_payload=None
        ))
        db.session.commit()
        return jsonify({"assigned": True, "rfidNumber": number, "truckId": int(truck_id), "orderRef": order_ref}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Failed to assign RFID"}), 500

# @rfid_bp.route('/config/release', methods=['POST'])
# def release_config():
#     """
#     Body: { "rfidNumber": "11", "truckId": 123, "orderRef": "INT-2025-0001" }  # truckId/orderRef optional
#     Marks the tag free and clears Truck.rfid_tag if set.
#     Always returns 200 (idempotent).
#     """
#     data = request.get_json(force=True) or {}
#     number   = (data.get('rfidNumber') or '').strip()
#     truck_id = data.get('truckId')
#     orderref = (data.get('orderRef') or '').strip() or None

#     if not number:
#         return jsonify({"error": "rfidNumber is required"}), 400

#     tag = RFIDConfig.query.filter_by(rfid_number=number).first()
#     if not tag:
#         return jsonify({"error": "RFID not found"}), 404

#     # Best effort: clear from any truck currently holding the tag
#     truck_cleared = None
#     t = Truck.query.filter_by(rfid_tag=number).first()
#     if t:
#         t.rfid_tag = None
#         truck_cleared = t.id

#     # Mark tag as free
#     tag.rfid_used = False
#     tag.rfid_linked_to_order = None

#     # Log the release
#     db.session.add(RFIDLog(
#         rfid_number=number,
#         truck_id=truck_id if truck_id is not None else truck_cleared,
#         order_ref=orderref,
#         sent_to_plc=False,
#         plc_payload={"action": "release", "ts": datetime.utcnow().isoformat()}
#     ))
#     db.session.add(tag)
#     if t:
#         db.session.add(t)
#     db.session.commit()

#     return jsonify({
#         "released": True,
#         "rfidNumber": number,
#         "truckCleared": truck_cleared,
#         "orderRef": orderref,
#         "freedOn": datetime.utcnow().isoformat()
#     }), 200
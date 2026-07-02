import os
from flask import Blueprint, request, jsonify
from models import db
from models.truck import Truck, Driver

truck_bp = Blueprint('truck', __name__, url_prefix='/api/trucks')

_LIST_MAX = int(os.getenv("TRUCK_LIST_MAX", "2000"))
_LIST_DEFAULT = int(os.getenv("TRUCK_LIST_DEFAULT", "500"))


def _limit_offset():
    try:
        limit = int(request.args.get("limit", _LIST_DEFAULT))
    except ValueError:
        limit = _LIST_DEFAULT
    limit = max(1, min(limit, _LIST_MAX))
    try:
        offset = int(request.args.get("offset", 0))
    except ValueError:
        offset = 0
    return limit, max(0, offset)


# Get all trucks
@truck_bp.route('/', methods=['GET'])
def get_trucks():
    limit, offset = _limit_offset()
    q = Truck.query.order_by(Truck.id.desc())
    total = q.count()
    trucks = q.limit(limit).offset(offset).all()
    return jsonify(
        {
            "items": [t.to_dict() for t in trucks],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": offset + len(trucks) < total,
        }
    )

# Get single truck
@truck_bp.route('/<int:truck_id>', methods=['GET'])
def get_truck(truck_id):
    truck = Truck.query.get(truck_id)
    if not truck:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(truck.to_dict())

# Add new truck
@truck_bp.route('/', methods=['POST'])
def add_truck():
    data = request.json
    truck = Truck(
        license=data['license'],
        model=data['model'],
        year=data['year'],
        capacity=data['capacity'],
        company=data['company'],
        status=data.get('status', 'active'),
        contact=data['contact']
    )
    db.session.add(truck)
    db.session.commit()
    return jsonify(truck.to_dict()), 201

# Update truck
@truck_bp.route('/<int:truck_id>', methods=['PUT'])
def update_truck(truck_id):
    truck = Truck.query.get(truck_id)
    if not truck:
        return jsonify({'error': 'Not found'}), 404
    data = request.json
    truck.license = data['license']
    truck.model = data['model']
    truck.year = data['year']
    truck.capacity = data['capacity']
    truck.company = data['company']
    if 'status' in data:
        truck.status = data['status']
    truck.contact = data['contact']
    db.session.commit()
    return jsonify(truck.to_dict())

# Delete truck
@truck_bp.route('/<int:truck_id>', methods=['DELETE'])
def delete_truck(truck_id):
    truck = Truck.query.get(truck_id)
    if not truck:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(truck)
    db.session.commit()
    return '', 204

# ===== DRIVER ROUTES =====

# Get all drivers
@truck_bp.route('/drivers', methods=['GET'])
def get_drivers():
    try:
        limit, offset = _limit_offset()
        q = Driver.query.order_by(Driver.id.desc())
        total = q.count()
        drivers = q.limit(limit).offset(offset).all()
        return jsonify(
            {
                "items": [driver.to_dict() for driver in drivers],
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(drivers) < total,
            }
        )
    except Exception as e:
        return jsonify({'error': f'Failed to fetch drivers: {str(e)}'}), 500

# Get single driver
@truck_bp.route('/drivers/<int:driver_id>', methods=['GET'])
def get_driver(driver_id):
    try:
        driver = Driver.query.get(driver_id)
        if not driver:
            return jsonify({'error': 'Driver not found'}), 404
        return jsonify(driver.to_dict())
    except Exception as e:
        return jsonify({'error': f'Failed to fetch driver: {str(e)}'}), 500

# Add new driver
# ===== DRIVER ROUTES =====
@truck_bp.route('/drivers', methods=['POST'])
def add_driver():
    data = request.get_json(force=True) or {}
    for f in ['name', 'license_no', 'contact']:
        if not data.get(f):
            return jsonify({'error': f'Missing required field: {f}'}), 400

    if Driver.query.filter_by(license_no=data['license_no']).first():
        return jsonify({'error': 'Driver with this license number already exists'}), 409

    truck_obj = None
    if data.get('truck_id') not in (None, ''):
        try:
            tid = int(data['truck_id'])
        except (ValueError, TypeError):
            return jsonify({'error': 'truck_id must be an integer'}), 400
        truck_obj = Truck.query.get(tid)
        if not truck_obj:
            return jsonify({'error': f'Truck id {tid} not found'}), 404

    drv = Driver(
        name=data['name'],
        license_no=data['license_no'],
        contact=data['contact'],
        status=data.get('status', 'Active'),
        truck_id=(truck_obj.id if truck_obj else None),
        assigned_truck=data.get('assigned_truck') or (truck_obj.license if truck_obj else None),
    )
    db.session.add(drv)
    db.session.commit()
    return jsonify({'message': 'Driver added successfully', 'driver': drv.to_dict()}), 201



@truck_bp.route('/drivers/<int:driver_id>', methods=['PUT'])
def update_driver(driver_id):
    try:
        drv = Driver.query.get(driver_id)
        if not drv:
            return jsonify({'error': 'Driver not found'}), 404

        data = request.get_json(force=True) or {}
        for f in ['name', 'license_no', 'contact']:
            if not data.get(f):
                return jsonify({'error': f'Missing required field: {f}'}), 400

        existing = Driver.query.filter_by(license_no=data['license_no']).first()
        if existing and existing.id != driver_id:
            return jsonify({'error': 'Driver with this license number already exists'}), 409

        truck_obj = None
        if 'truck_id' in data and data['truck_id'] is not None:
            truck_obj = Truck.query.get(int(data['truck_id']))
            if not truck_obj:
                return jsonify({'error': f"Truck id {data['truck_id']} not found"}), 404

        drv.name = data['name']
        drv.license_no = data['license_no']
        drv.contact = data['contact']
        drv.status = data.get('status', drv.status)

        if truck_obj:
            drv.truck_id = truck_obj.id
            drv.assigned_truck = data.get('assigned_truck', truck_obj.license)
        elif 'assigned_truck' in data:
            drv.assigned_truck = data['assigned_truck']

        db.session.commit()
        return jsonify({'message': 'Driver updated successfully', 'driver': drv.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update driver: {str(e)}'}), 500

# Delete driver
@truck_bp.route('/drivers/<int:driver_id>', methods=['DELETE'])
def delete_driver(driver_id):
    try:
        driver = Driver.query.get(driver_id)
        if not driver:
            return jsonify({'error': 'Driver not found'}), 404
        
        db.session.delete(driver)
        db.session.commit()
        
        return jsonify({'message': 'Driver deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete driver: {str(e)}'}), 500

# Get drivers by status
@truck_bp.route('/drivers/status/<status>', methods=['GET'])
def get_drivers_by_status(status):
    try:
        limit, offset = _limit_offset()
        q = Driver.query.filter_by(status=status).order_by(Driver.id.desc())
        total = q.count()
        drivers = q.limit(limit).offset(offset).all()
        return jsonify(
            {
                "items": [driver.to_dict() for driver in drivers],
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(drivers) < total,
            }
        )
    except Exception as e:
        return jsonify({'error': f'Failed to fetch drivers: {str(e)}'}), 500

# Get drivers by assigned truck
@truck_bp.route('/drivers/truck/<truck_id>', methods=['GET'])
def get_drivers_by_truck(truck_id):
    try:
        limit, offset = _limit_offset()
        q = Driver.query.filter_by(assigned_truck=truck_id).order_by(Driver.id.desc())
        total = q.count()
        drivers = q.limit(limit).offset(offset).all()
        return jsonify(
            {
                "items": [driver.to_dict() for driver in drivers],
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(drivers) < total,
            }
        )
    except Exception as e:
        return jsonify({'error': f'Failed to fetch drivers: {str(e)}'}), 500

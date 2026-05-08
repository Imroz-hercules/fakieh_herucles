import os
from flask import Blueprint, jsonify, request
from models import db
from models.material import Material
from datetime import datetime
from utils.error_handler import (
    log_request_info, log_operation, safe_commit, validate_required_fields,
    create_success_response, handle_api_error, handle_database_error,
    APIError
)

material_bp = Blueprint('material', __name__)

_MAT_LIST_MAX = int(os.getenv("MATERIAL_LIST_MAX", "2000"))
_MAT_LIST_DEFAULT = int(os.getenv("MATERIAL_LIST_DEFAULT", "500"))


# Get all materials
@material_bp.route('/api/materials', methods=['GET'])
def get_materials():
    try:
        log_request_info()
        log_operation("get_materials")

        try:
            limit = int(request.args.get("limit", _MAT_LIST_DEFAULT))
        except ValueError:
            limit = _MAT_LIST_DEFAULT
        limit = max(1, min(limit, _MAT_LIST_MAX))
        try:
            offset = int(request.args.get("offset", 0))
        except ValueError:
            offset = 0
        offset = max(0, offset)

        base = Material.query.order_by(Material.last_updated.desc())
        total = base.count()
        materials = base.limit(limit).offset(offset).all()
        material_data = [m.to_dict() for m in materials]

        return create_success_response(
            data={
                "items": material_data,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(material_data) < total,
            },
            message=f"Retrieved {len(material_data)} materials",
        )
    except Exception as e:
        return handle_database_error(e)


# Create new material
@material_bp.route('/api/materials', methods=['POST'])
def create_material():
    try:
        log_request_info()
        log_operation("create_material")

        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Validate required fields
        required_fields = ['name', 'code', 'type', 'unit']
        validate_required_fields(data, required_fields)

        # Check if material with same code already exists
        existing_material = Material.query.filter_by(code=data['code']).first()
        if existing_material:
            raise APIError(f"Material with code '{data['code']}' already exists", 400, "DUPLICATE_CODE")

        new_material = Material(
            name=data['name'],
            code=data['code'],
            type=data['type'],
            stock=data.get('stock', 0),
            unit=data['unit'],
            cost=data.get('cost', 0),
            reorder_level=data.get('reorderLevel', 0),
            status=data.get('status', 'In Stock'),
            supplier=data.get('supplier', ''),
            last_updated=datetime.utcnow()
        )

        db.session.add(new_material)
        if not safe_commit(db.session, f"create material {new_material.code}"):
            raise APIError("Failed to create material", 500, "CREATE_FAILED")

        return create_success_response(
            data=new_material.to_dict(),
            message=f"Successfully created material '{new_material.name}'",
            status_code=201
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


# Update material
@material_bp.route('/api/materials/<int:material_id>', methods=['PUT'])
def update_material(material_id):
    try:
        log_request_info()
        log_operation("update_material", {"material_id": material_id})

        material = Material.query.get(material_id)
        if not material:
            raise APIError(f"Material with ID {material_id} not found", 404, "MATERIAL_NOT_FOUND")

        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Update fields if provided
        if 'name' in data:
            material.name = data['name']
        if 'code' in data:
            # Check if new code already exists
            existing_material = Material.query.filter_by(code=data['code']).first()
            if existing_material and existing_material.id != material_id:
                raise APIError(f"Material with code '{data['code']}' already exists", 400, "DUPLICATE_CODE")
            material.code = data['code']
        if 'type' in data:
            material.type = data['type']
        if 'stock' in data:
            material.stock = data['stock']
        if 'unit' in data:
            material.unit = data['unit']
        if 'cost' in data:
            material.cost = data['cost']
        if 'reorderLevel' in data:
            material.reorder_level = data['reorderLevel']
        if 'status' in data:
            material.status = data['status']
        if 'supplier' in data:
            material.supplier = data['supplier']

        material.last_updated = datetime.utcnow()

        if not safe_commit(db.session, f"update material {material_id}"):
            raise APIError("Failed to update material", 500, "UPDATE_FAILED")

        return create_success_response(
            data=material.to_dict(),
            message=f"Successfully updated material '{material.name}'"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


# Delete material
@material_bp.route('/api/materials/<int:material_id>', methods=['DELETE'])
def delete_material(material_id):
    try:
        log_request_info()
        log_operation("delete_material", {"material_id": material_id})

        material = Material.query.get(material_id)
        if not material:
            raise APIError(f"Material with ID {material_id} not found", 404, "MATERIAL_NOT_FOUND")

        material_name = material.name
        db.session.delete(material)
        if not safe_commit(db.session, f"delete material {material_id}"):
            raise APIError("Failed to delete material", 500, "DELETE_FAILED")

        return create_success_response(
            data=None,
            message=f"Successfully deleted material '{material_name}'"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)

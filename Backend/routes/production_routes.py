from flask import Blueprint, jsonify, request
from models import db
from models.production import ProductionBatch
from utils.error_handler import (
    log_request_info, log_operation, safe_commit, validate_required_fields,
    create_success_response, handle_api_error, handle_database_error,
    APIError
)  

production_bp = Blueprint('production', __name__)

@production_bp.route('/api/production', methods=['GET'])
def get_all_batches():
    try:
        log_request_info()
        log_operation("get_all_batches")
        
        batches = ProductionBatch.query.order_by(ProductionBatch.created_at.desc()).all()
        batch_data = [batch.to_dict() for batch in batches]
        
        return create_success_response(
            data=batch_data,
            message=f"Retrieved {len(batch_data)} production batches"
        )
    except Exception as e:
        return handle_database_error(e)

@production_bp.route('/api/production', methods=['POST'])
def create_batch():
    try:
        log_request_info()
        log_operation("create_batch")
        
        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")
        
        # Validate required fields
        required_fields = ['recipe', 'batchNo', 'feedType', 'formula', 'targetQty']
        validate_required_fields(data, required_fields)
        
        # Check if batch with same batch number already exists
        existing_batch = ProductionBatch.query.filter_by(batch_no=data['batchNo']).first()
        if existing_batch:
            raise APIError(f"Batch with number '{data['batchNo']}' already exists", 400, "DUPLICATE_BATCH")

        new_batch = ProductionBatch(
            recipe=data['recipe'],
            batch_no=data['batchNo'],
            feed_type=data['feedType'],
            formula=data['formula'],
            target_qty=data['targetQty'],
            actual_qty=data.get('actualQty', 0),
            product_range=data.get('productRange', '0%'),
            quality_check=data.get('qualityCheck', 'Pending'),
            status=data.get('status', 'Ready')
        )

        db.session.add(new_batch)
        if not safe_commit(db.session, f"create batch {new_batch.batch_no}"):
            raise APIError("Failed to create batch", 500, "CREATE_FAILED")
        
        return create_success_response(
            data=new_batch.to_dict(),
            message=f"Successfully created batch '{new_batch.batch_no}'",
            status_code=201
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)

@production_bp.route('/api/production/<int:batch_id>', methods=['PUT'])
def update_batch(batch_id):
    try:
        log_request_info()
        log_operation("update_batch", {"batch_id": batch_id})
        
        batch = ProductionBatch.query.get(batch_id)
        if not batch:
            raise APIError(f"Batch with ID {batch_id} not found", 404, "BATCH_NOT_FOUND")
        
        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Update fields if provided
        if 'recipe' in data:
            batch.recipe = data['recipe']
        if 'batchNo' in data:
            # Check if new batch number already exists
            existing_batch = ProductionBatch.query.filter_by(batch_no=data['batchNo']).first()
            if existing_batch and existing_batch.id != batch_id:
                raise APIError(f"Batch with number '{data['batchNo']}' already exists", 400, "DUPLICATE_BATCH")
            batch.batch_no = data['batchNo']
        if 'feedType' in data:
            batch.feed_type = data['feedType']
        if 'formula' in data:
            batch.formula = data['formula']
        if 'targetQty' in data:
            batch.target_qty = data['targetQty']
        if 'actualQty' in data:
            batch.actual_qty = data['actualQty']
        if 'productRange' in data:
            batch.product_range = data['productRange']
        if 'qualityCheck' in data:
            batch.quality_check = data['qualityCheck']
        if 'status' in data:
            batch.status = data['status']

        if not safe_commit(db.session, f"update batch {batch_id}"):
            raise APIError("Failed to update batch", 500, "UPDATE_FAILED")
        
        return create_success_response(
            data=batch.to_dict(),
            message=f"Successfully updated batch '{batch.batch_no}'"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)

@production_bp.route('/api/production/<int:batch_id>', methods=['DELETE'])
def delete_batch(batch_id):
    try:
        log_request_info()
        log_operation("delete_batch", {"batch_id": batch_id})
        
        batch = ProductionBatch.query.get(batch_id)
        if not batch:
            raise APIError(f"Batch with ID {batch_id} not found", 404, "BATCH_NOT_FOUND")
        
        batch_number = batch.batch_no
        db.session.delete(batch)
        if not safe_commit(db.session, f"delete batch {batch_id}"):
            raise APIError("Failed to delete batch", 500, "DELETE_FAILED")
        
        return create_success_response(
            data=None,
            message=f"Successfully deleted batch '{batch_number}'"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)

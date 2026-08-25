from flask import Blueprint, request, jsonify
from models import db
from models.orders import IntakeOrder, OutloadingOrder, BulkLineOrder, PTLineOrder
from utils.error_handler import (
    log_request_info, log_operation, safe_commit, validate_required_fields,
    create_success_response, handle_api_error, handle_database_error,
    APIError
)
from sqlalchemy import text, or_, and_

orders_bp = Blueprint('orders', __name__, url_prefix='/api/orders')

# === Test endpoint ===
@orders_bp.route('/test', methods=['GET'])
def test_orders():
    try:
        log_request_info()
        log_operation("test_orders")

        # Test basic database connection
        result = db.session.execute(text("SELECT 1")).fetchone()
        
        # Test if tables exist
        pt_count = db.session.execute(text("SELECT COUNT(*) FROM pt_line_orders")).fetchone()
        bulk_count = db.session.execute(text("SELECT COUNT(*) FROM bulk_line_orders")).fetchone()
        
        return create_success_response(
            data={
                "database_connected": True,
                "pt_orders_count": pt_count[0] if pt_count else 0,
                "bulk_orders_count": bulk_count[0] if bulk_count else 0
            },
            message="Database connection test completed"
        )
    except Exception as e:
        return handle_database_error(e)

# === Intake Orders ===
@orders_bp.route('/intake1', methods=['GET'])
def get_intake1_orders():
    try:
        log_request_info()
        log_operation("get_intake1_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        total_count = IntakeOrder.query.filter_by(line='1').count()
        
        # Get paginated orders
        orders = IntakeOrder.query.filter_by(line='1')\
            .order_by(IntakeOrder.id.desc())\
            .offset((page - 1) * per_page)\
            .limit(per_page)\
            .all()
        
        order_data = [o.to_dict() for o in orders]

        return create_success_response(
            data={
                'orders': order_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(order_data)} intake line 1 orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/intake2', methods=['GET'])
def get_intake2_orders():
    try:
        log_request_info()
        log_operation("get_intake2_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        total_count = IntakeOrder.query.filter_by(line='2').count()
        
        # Get paginated orders
        orders = IntakeOrder.query.filter_by(line='2')\
            .order_by(IntakeOrder.id.desc())\
            .offset((page - 1) * per_page)\
            .limit(per_page)\
            .all()
        
        order_data = [o.to_dict() for o in orders]

        return create_success_response(
            data={
                'orders': order_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(order_data)} intake line 2 orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/mineral', methods=['GET'])
def get_mineral_orders():
    try:
        log_request_info()
        log_operation("get_mineral_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Fetch mineral orders from database (filter by mineral destinations 401-408)
        query = IntakeOrder.query.filter(
            or_(
                and_(IntakeOrder.destination_silo1 >= '401', IntakeOrder.destination_silo1 <= '408'),
                and_(IntakeOrder.destination_silo2 >= '401', IntakeOrder.destination_silo2 <= '408')
            )
        ).order_by(IntakeOrder.created_at.desc())
        
        total_count = query.count()
        orders = query.paginate(
            page=page, 
            per_page=per_page, 
            error_out=False
        )
        
        order_data = []
        for order in orders.items:
            order_data.append({
                'id': order.id,
                'badge_no': order.badge_no,
                'source_material_code': order.source_material_code,
                'declared_quantity_kg': order.declared_quantity_kg,
                'destination_silo1': order.destination_silo1,
                'destination_silo2': order.destination_silo2,
                'rfid_badge_reading': order.rfid_badge_reading,
                'active_badge': order.active_badge,
                'active_destination': order.active_destination,
                'status_word': order.status_word,
                'line': order.line,
                'created_at': order.created_at.isoformat() if order.created_at else None,
                'updated_at': order.updated_at.isoformat() if order.updated_at else None
            })

        return create_success_response(
            data={
                'orders': order_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': orders.pages,
                    'has_next': orders.has_next,
                    'has_prev': orders.has_prev
                }
            },
            message=f"Retrieved {len(order_data)} mineral intake orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/intake/<int:order_id>', methods=['GET'])
def get_intake_order(order_id):
    try:
        log_request_info()
        log_operation("get_intake_order", {"order_id": order_id})

        order = IntakeOrder.query.get(order_id)
        if not order:
            raise APIError(f"Intake order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        return create_success_response(
            data=order.to_dict(),
            message=f"Retrieved intake order {order_id}"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/intake/<int:order_id>', methods=['DELETE'])
def delete_intake_order(order_id):
    try:
        log_request_info()
        log_operation("delete_intake_order", {"order_id": order_id})

        order = IntakeOrder.query.get(order_id)
        if not order:
            raise APIError(f"Intake order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        db.session.delete(order)
        if not safe_commit(db.session, f"delete intake order {order_id}"):
            raise APIError("Failed to delete intake order", 500, "DELETE_FAILED")

        return create_success_response(
            data=None,
            message=f"Successfully deleted intake order {order_id}",
            status_code=200
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/intake', methods=['POST'])
def add_intake_order():
    try:
        log_request_info()
        log_operation("add_intake_order")

        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Debug: Log the received data
        print(f"[DEBUG] Received data: {data}")

        # Validate required fields
        required_fields = [
            'badgeNo', 'sourceMaterialCode', 'declaredQuantityKG',
            'destinationSilo1', 'destinationSilo2', 'rfidBadgeReading',
            'activeBadge', 'activeDestination', 'statusWord', 'line'
        ]
        validate_required_fields(data, required_fields)

        # Convert declaredQuantityKG to int if it's a float
        declared_qty = data['declaredQuantityKG']
        if isinstance(declared_qty, float):
            declared_qty = int(declared_qty)
        
        print(f"[DEBUG] Creating order with declared_qty: {declared_qty} (type: {type(declared_qty)})")

        order = IntakeOrder(
            badge_no=str(data['badgeNo']),
            source_material_code=str(data['sourceMaterialCode']),
            declared_quantity_kg=declared_qty,
            destination_silo1=str(data['destinationSilo1']),
            destination_silo2=str(data['destinationSilo2']),
            rfid_badge_reading=str(data['rfidBadgeReading']),
            active_badge=str(data['activeBadge']),
            active_destination=str(data['activeDestination']),
            status_word=str(data['statusWord']),
            line=str(data['line'])
        )

        # Don't store in database - only store when status is 8 via handle_order_status
        # db.session.add(order)
        # if not safe_commit(db.session, f"add intake order {order.badge_no}"):
        #     raise APIError("Failed to create intake order", 500, "CREATE_FAILED")

        return create_success_response(
            data=order.to_dict(),
            message=f"Successfully created intake order for badge {order.badge_no}",
            status_code=201
        )
    except APIError:
        raise
    except Exception as e:
        print(f"[DEBUG] Error creating intake order: {str(e)}")
        print(f"[DEBUG] Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return handle_database_error(e)


# === Outloading Orders ===
@orders_bp.route('/outload1', methods=['GET'])
def get_outloading1_orders():
    try:
        log_request_info()
        log_operation("get_outloading1_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        total_count = OutloadingOrder.query.count()
        
        # Get paginated orders
        orders = OutloadingOrder.query\
            .order_by(OutloadingOrder.id.desc())\
            .offset((page - 1) * per_page)\
            .limit(per_page)\
            .all()
        
        order_data = [o.to_dict() for o in orders]

        return create_success_response(
            data={
                'orders': order_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(order_data)} outloading line 1 orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/outload2', methods=['GET'])
def get_outloading2_orders():
    try:
        log_request_info()
        log_operation("get_outloading2_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        total_count = OutloadingOrder.query.count()
        
        # Get paginated orders
        orders = OutloadingOrder.query\
            .order_by(OutloadingOrder.id.desc())\
            .offset((page - 1) * per_page)\
            .limit(per_page)\
            .all()
        
        order_data = [o.to_dict() for o in orders]

        return create_success_response(
            data={
                'orders': order_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(order_data)} outloading line 2 orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/outload3', methods=['GET'])
def get_outloading3_orders():
    try:
        log_request_info()
        log_operation("get_outloading3_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        total_count = OutloadingOrder.query.count()
        
        # Get paginated orders
        orders = OutloadingOrder.query\
            .order_by(OutloadingOrder.id.desc())\
            .offset((page - 1) * per_page)\
            .limit(per_page)\
            .all()
        
        order_data = [o.to_dict() for o in orders]

        return create_success_response(
            data={
                'orders': order_data,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(order_data)} outloading line 3 orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/outloading/<int:order_id>', methods=['GET'])
def get_outloading_order(order_id):
    try:
        log_request_info()
        log_operation("get_outloading_order", {"order_id": order_id})

        order = OutloadingOrder.query.get(order_id)
        if not order:
            raise APIError(f"Outloading order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        return create_success_response(
            data=order.to_dict(),
            message=f"Retrieved outloading order {order_id}"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/outloading/<int:order_id>', methods=['DELETE'])
def delete_outloading_order(order_id):
    try:
        log_request_info()
        log_operation("delete_outloading_order", {"order_id": order_id})

        order = OutloadingOrder.query.get(order_id)
        if not order:
            raise APIError(f"Outloading order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        db.session.delete(order)
        if not safe_commit(db.session, f"delete outloading order {order_id}"):
            raise APIError("Failed to delete outloading order", 500, "DELETE_FAILED")

        return create_success_response(
            data=None,
            message=f"Successfully deleted outloading order {order_id}",
            status_code=200
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/outloading', methods=['POST'])
def add_outloading_order():
    try:
        log_request_info()
        log_operation("add_outloading_order")

        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Validate required fields
        required_fields = [
            'badgeNo', 'sourceMaterialCode', 'rfidSet', 'declaredQuantityKG',
            'destinationSilo1', 'destinationSilo2', 'rfidBadgeReading',
            'activeBadge', 'activeDestination', 'statusWord', 'activDestSet'
        ]
        validate_required_fields(data, required_fields)

        order = OutloadingOrder(
            badge_no=data['badgeNo'],
            source_material_code=data['sourceMaterialCode'],
            rfid_set=data['rfidSet'],
            declared_quantity_kg=data['declaredQuantityKG'],
            destination_silo1=data['destinationSilo1'],
            destination_silo2=data['destinationSilo2'],
            rfid_badge_reading=data['rfidBadgeReading'],
            active_badge=data['activeBadge'],
            active_destination=data['activeDestination'],
            status_word=data['statusWord'],
            activ_dest_set=data['activDestSet']
        )

        # Don't store in database - only store when status is 8 via handle_order_status
        # db.session.add(order)
        # if not safe_commit(db.session, f"add outloading order {order.badge_no}"):
        #     raise APIError("Failed to create outloading order", 500, "CREATE_FAILED")

        return create_success_response(
            data=order.to_dict(),
            message=f"Successfully created outloading order for badge {order.badge_no}",
            status_code=201
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


# === Bulk Line Orders ===
@orders_bp.route('/bulk', methods=['GET'])
def get_bulk_orders():
    try:
        log_request_info()
        log_operation("get_bulk_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        count_result = db.session.execute(text("SELECT COUNT(*) FROM bulk_line_orders"))
        total_count = count_result.fetchone()[0]

        # Calculate offset
        offset = (page - 1) * per_page

        # Use raw SQL with pagination
        result = db.session.execute(text("""
            SELECT id, source_silo, destination_silo1, destination_silo2, cc25_sel, 
                   declared_quantity_kg, scale_sel, status_word,
                   created_at, updated_at, completed_at, is_complete
            FROM bulk_line_orders
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        """), {'limit': per_page, 'offset': offset})
        
        orders = []
        for row in result:
            order_dict = {
                'id': row.id,
                'sourceSilo': row.source_silo,
                'destinationSilo1': row.destination_silo1,
                'destinationSilo2': row.destination_silo2,
                'cc25Sel': row.cc25_sel,
                'declaredQuantityKG': row.declared_quantity_kg,
                'scaleSel': row.scale_sel,
                'statusWord': row.status_word,
                'createdAt': row.created_at.isoformat() if row.created_at else None,
                'updatedAt': row.updated_at.isoformat() if row.updated_at else None,
                'completedAt': row.completed_at.isoformat() if row.completed_at else None,
                'isComplete': row.is_complete
            }
            orders.append(order_dict)

        return create_success_response(
            data={
                'orders': orders,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(orders)} bulk line orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/bulk/<int:order_id>', methods=['GET'])
def get_bulk_order(order_id):
    try:
        log_request_info()
        log_operation("get_bulk_order", {"order_id": order_id})

        order = BulkLineOrder.query.get(order_id)
        if not order:
            raise APIError(f"Bulk order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        return create_success_response(
            data=order.to_dict(),
            message=f"Retrieved bulk order {order_id}"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/bulk/<int:order_id>', methods=['DELETE'])
def delete_bulk_order(order_id):
    try:
        log_request_info()
        log_operation("delete_bulk_order", {"order_id": order_id})

        order = BulkLineOrder.query.get(order_id)
        if not order:
            raise APIError(f"Bulk order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        db.session.delete(order)
        if not safe_commit(db.session, f"delete bulk order {order_id}"):
            raise APIError("Failed to delete bulk order", 500, "DELETE_FAILED")

        return create_success_response(
            data=None,
            message=f"Successfully deleted bulk order {order_id}",
            status_code=200
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/bulk', methods=['POST'])
def add_bulk_order():
    try:
        log_request_info()
        log_operation("add_bulk_order")

        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Validate required fields
        required_fields = [
            'BulkLine_Source_Silo', 'BulkLine_DEST_1', 'BulkLine_DEST_2',
            'BulkLine_CC25_Sel', 'BulkLine_Weight_Quantity', 'BulkLine_Scale_Selection',
            'ActiveBulk_Source_Silo', 'ActiveBulk_DEST_1', 'ActiveBulk_DEST_2',
            'ActiveBulk_CC25_Sel', 'ActiveBulk_weightQuantity', 'ActiveBulk_ScaleSelect',
            'BulkLine_Status'
        ]
        validate_required_fields(data, required_fields)

        # The request payload uses the PLC tag names; the model uses column names.
        order = BulkLineOrder(
            source_silo=data['BulkLine_Source_Silo'],
            destination_silo1=data['BulkLine_DEST_1'],
            destination_silo2=data['BulkLine_DEST_2'],
            cc25_sel=data['BulkLine_CC25_Sel'],
            declared_quantity_kg=data['BulkLine_Weight_Quantity'],
            scale_sel=data['BulkLine_Scale_Selection'],
            active_source_silo=data['ActiveBulk_Source_Silo'],
            active_dest1=data['ActiveBulk_DEST_1'],
            active_dest2=data['ActiveBulk_DEST_2'],
            active_cc25_sel=data['ActiveBulk_CC25_Sel'],
            active_qty_kg=data['ActiveBulk_weightQuantity'],
            active_scale_sel=data['ActiveBulk_ScaleSelect'],
            status_word=data['BulkLine_Status']
        )

        # Don't store in database - only store when status is 8 via handle_order_status
        # db.session.add(order)
        # if not safe_commit(db.session, "add bulk order"):
        #     raise APIError("Failed to create bulk order", 500, "CREATE_FAILED")

        return create_success_response(
            data=order.to_dict(),
            message="Successfully created bulk order",
            status_code=201
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


# === PT Line Orders ===
@orders_bp.route('/pt', methods=['GET'])
def get_pt_orders():
    try:
        log_request_info()
        log_operation("get_pt_orders")

        # Get pagination parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        
        # Validate pagination parameters
        if page < 1:
            page = 1
        if per_page < 1 or per_page > 100:
            per_page = 10

        # Get total count
        count_result = db.session.execute(text("SELECT COUNT(*) FROM pt_line_orders"))
        total_count = count_result.fetchone()[0]

        # Calculate offset
        offset = (page - 1) * per_page

        # Use raw SQL with pagination
        result = db.session.execute(text("""
            SELECT id, pit_no, raw_code, destination_silo1, destination_silo2, 
                   declared_quantity_kg, scale_sel, status_word,
                   created_at, updated_at, completed_at, is_complete
            FROM pt_line_orders
            ORDER BY id DESC
            LIMIT :limit OFFSET :offset
        """), {'limit': per_page, 'offset': offset})
        
        orders = []
        for row in result:
            order_dict = {
                'id': row.id,
                'pitNo': row.pit_no,
                'rawCode': row.raw_code,
                'destinationSilo1': row.destination_silo1,
                'destinationSilo2': row.destination_silo2,
                'declaredQuantityKG': row.declared_quantity_kg,
                'scaleSel': row.scale_sel,
                'statusWord': row.status_word,
                'createdAt': row.created_at.isoformat() if row.created_at else None,
                'updatedAt': row.updated_at.isoformat() if row.updated_at else None,
                'completedAt': row.completed_at.isoformat() if row.completed_at else None,
                'isComplete': row.is_complete
            }
            orders.append(order_dict)

        return create_success_response(
            data={
                'orders': orders,
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total_count': total_count,
                    'total_pages': (total_count + per_page - 1) // per_page,
                    'has_next': page * per_page < total_count,
                    'has_prev': page > 1
                }
            },
            message=f"Retrieved {len(orders)} PT line orders (page {page})"
        )
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/pt/<int:order_id>', methods=['GET'])
def get_pt_order(order_id):
    try:
        log_request_info()
        log_operation("get_pt_order", {"order_id": order_id})

        order = PTLineOrder.query.get(order_id)
        if not order:
            raise APIError(f"PT order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        return create_success_response(
            data=order.to_dict(),
            message=f"Retrieved PT order {order_id}"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/pt/<int:order_id>', methods=['DELETE'])
def delete_pt_order(order_id):
    try:
        log_request_info()
        log_operation("delete_pt_order", {"order_id": order_id})

        order = PTLineOrder.query.get(order_id)
        if not order:
            raise APIError(f"PT order with ID {order_id} not found", 404, "ORDER_NOT_FOUND")

        db.session.delete(order)
        if not safe_commit(db.session, f"delete PT order {order_id}"):
            raise APIError("Failed to delete PT order", 500, "DELETE_FAILED")

        return create_success_response(
            data=None,
            message=f"Successfully deleted PT order {order_id}",
            status_code=200
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


@orders_bp.route('/pt', methods=['POST'])
def add_pt_order():
    try:
        log_request_info()
        log_operation("add_pt_order")

        data = request.get_json()
        if not data:
            raise APIError("No JSON data provided", 400, "NO_DATA")

        # Validate required fields
        required_fields = [
            'PitLine_Pit_Number', 'PitLine_RawMaterialCode', 'PitLine_DEST_1',
            'PitLine_DEST_2', 'PitLine_Weight_Quantity', 'PitLine_Scale_Selection',
            'ActivePit_Pit_Number', 'ActivePit_RawMaterialCod', 'ActivePit_DEST_1',
            'ActivePit_DEST_2', 'ActivePit_Weight_Quant', 'ActivePit_Scale_Select',
            'PitLine_Status'
        ]
        validate_required_fields(data, required_fields)

        # The request payload uses the PLC tag names; the model uses column names.
        # The ActivePit_* tags are still validated above (they are part of the PLC
        # payload contract) but PTLineOrder has no active_* columns — the live
        # active values are read back from the PLC, not stored on the order row.
        order = PTLineOrder(
            pit_no=data['PitLine_Pit_Number'],
            raw_code=data['PitLine_RawMaterialCode'],
            destination_silo1=data['PitLine_DEST_1'],
            destination_silo2=data['PitLine_DEST_2'],
            declared_quantity_kg=data['PitLine_Weight_Quantity'],
            scale_sel=data['PitLine_Scale_Selection'],
            status_word=data['PitLine_Status']
        )

        # Don't store in database - only store when status is 8 via handle_order_status
        # db.session.add(order)
        # if not safe_commit(db.session, "add PT order"):
        #     raise APIError("Failed to create PT order", 500, "CREATE_FAILED")

        return create_success_response(
            data=order.to_dict(),
            message="Successfully created PT order",
            status_code=201
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)


# Seed test data endpoint
@orders_bp.route('/seed', methods=['POST'])
def seed_test_data():
    try:
        log_request_info()
        log_operation("seed_test_data")

        # Check if data already exists
        if BulkLineOrder.query.first() and PTLineOrder.query.first():
            return create_success_response(
                data=None,
                message="Test data already exists"
            )

        # Add sample bulk order
        bulk_order = BulkLineOrder(
            source_silo="Silo A",
            destination_silo1="Destination 1",
            destination_silo2="Destination 2",
            cc25_sel="CC25-1",
            declared_quantity_kg=1000,
            scale_sel="Scale 1",
            active_source_silo="Silo B",
            active_dest1="Active Dest 1",
            active_dest2="Active Dest 2",
            active_cc25_sel="CC25-2",
            active_qty_kg=500,
            active_scale_sel="Scale 2",
            status_word="Active"
        )
        db.session.add(bulk_order)

        # Add sample PT order
        pt_order = PTLineOrder(
            pit_no="Pit 1",
            raw_code="RM001",
            destination_silo1="PT Dest 1",
            destination_silo2="PT Dest 2",
            declared_quantity_kg=750,
            scale_sel="PT Scale 1",
            status_word="Active"
        )
        db.session.add(pt_order)

        if not safe_commit(db.session, "seed test data"):
            raise APIError("Failed to seed test data", 500, "SEED_FAILED")

        return create_success_response(
            data={
                "bulk_order_id": bulk_order.id,
                "pt_order_id": pt_order.id
            },
            message="Test data seeded successfully"
        )
    except APIError:
        raise
    except Exception as e:
        return handle_database_error(e)

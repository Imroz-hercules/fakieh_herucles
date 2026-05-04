# ─────────────── Orders History APIs ───────────────
from flask import Blueprint, jsonify, request
from datetime import datetime
from models import db
from models.orders import IntakeOrder, OutloadingOrder, BulkLineOrder, PTLineOrder

# Create a new blueprint for orders history
orders_history_bp = Blueprint("orders_history", __name__, url_prefix="/api/orders")

@orders_history_bp.route("/active", methods=["GET"])
def get_active_orders():
    """
    Get all active (not completed) orders from DB
    """
    try:
        active_orders = {
            "intake": [o.to_dict() for o in IntakeOrder.query.filter_by(is_complete=False).order_by(IntakeOrder.id.desc()).all()],
            "outloading": [o.to_dict() for o in OutloadingOrder.query.filter_by(is_complete=False).order_by(OutloadingOrder.id.desc()).all()],
            "bulk": [o.to_dict() for o in BulkLineOrder.query.filter_by(is_complete=False).order_by(BulkLineOrder.id.desc()).all()],
            "pit": [o.to_dict() for o in PTLineOrder.query.filter_by(is_complete=False).order_by(PTLineOrder.id.desc()).all()],
        }
        
        # Add counts for summary
        total_active = sum(len(orders) for orders in active_orders.values())
        
        return jsonify({
            "ok": True,
            "total_active_orders": total_active,
            "orders": active_orders,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/completed", methods=["GET"])
def get_completed_orders():
    """
    Get all completed orders from DB with optional date range filtering
    """
    try:
        # Get date range filters from query parameters
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        
        # Build base queries
        intake_query = IntakeOrder.query.filter_by(is_complete=True)
        outloading_query = OutloadingOrder.query.filter_by(is_complete=True)
        bulk_query = BulkLineOrder.query.filter_by(is_complete=True)
        pit_query = PTLineOrder.query.filter_by(is_complete=True)
        
        # Apply date filters if provided
        if from_date:
            try:
                from_dt = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
                intake_query = intake_query.filter(IntakeOrder.finished_at >= from_dt)
                outloading_query = outloading_query.filter(OutloadingOrder.finished_at >= from_dt)
                bulk_query = bulk_query.filter(BulkLineOrder.finished_at >= from_dt)
                pit_query = pit_query.filter(PTLineOrder.finished_at >= from_dt)
            except ValueError:
                return jsonify({"error": "Invalid 'from' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
        
        if to_date:
            try:
                to_dt = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
                intake_query = intake_query.filter(IntakeOrder.finished_at <= to_dt)
                outloading_query = outloading_query.filter(OutloadingOrder.finished_at <= to_dt)
                bulk_query = bulk_query.filter(BulkLineOrder.finished_at <= to_dt)
                pit_query = pit_query.filter(PTLineOrder.finished_at <= to_dt)
            except ValueError:
                return jsonify({"error": "Invalid 'to' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
        
        completed_orders = {
            "intake": [o.to_dict() for o in intake_query.order_by(IntakeOrder.finished_at.desc()).all()],
            "outloading": [o.to_dict() for o in outloading_query.order_by(OutloadingOrder.finished_at.desc()).all()],
            "bulk": [o.to_dict() for o in bulk_query.order_by(BulkLineOrder.finished_at.desc()).all()],
            "pit": [o.to_dict() for o in pit_query.order_by(PTLineOrder.finished_at.desc()).all()],
        }
        
        # Add counts for summary
        total_completed = sum(len(orders) for orders in completed_orders.values())
        
        return jsonify({
            "ok": True,
            "total_completed_orders": total_completed,
            "date_filter": {
                "from": from_date,
                "to": to_date
            },
            "orders": completed_orders,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/history", methods=["GET"])
def get_all_orders_history():
    """
    Get full history: both active & completed orders with optional date range filtering
    """
    try:
        # Get date range filters from query parameters
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        order_type = request.args.get('type')  # 'active', 'completed', or 'all'
        
        # Build base queries
        intake_query = IntakeOrder.query
        outloading_query = OutloadingOrder.query
        bulk_query = BulkLineOrder.query
        pit_query = PTLineOrder.query
        
        # Apply order type filter
        if order_type == 'active':
            intake_query = intake_query.filter_by(is_complete=False)
            outloading_query = outloading_query.filter_by(is_complete=False)
            bulk_query = bulk_query.filter_by(is_complete=False)
            pit_query = pit_query.filter_by(is_complete=False)
        elif order_type == 'completed':
            intake_query = intake_query.filter_by(is_complete=True)
            outloading_query = outloading_query.filter_by(is_complete=True)
            bulk_query = bulk_query.filter_by(is_complete=True)
            pit_query = pit_query.filter_by(is_complete=True)
        # 'all' or no filter = show everything
        
        # Apply date filters if provided
        if from_date:
            try:
                from_dt = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
                intake_query = intake_query.filter(IntakeOrder.created_at >= from_dt)
                outloading_query = outloading_query.filter(OutloadingOrder.created_at >= from_dt)
                bulk_query = bulk_query.filter(BulkLineOrder.created_at >= from_dt)
                pit_query = pit_query.filter(PTLineOrder.created_at >= from_dt)
            except ValueError:
                return jsonify({"error": "Invalid 'from' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
        
        if to_date:
            try:
                to_dt = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
                intake_query = intake_query.filter(IntakeOrder.created_at <= to_dt)
                outloading_query = outloading_query.filter(OutloadingOrder.created_at <= to_dt)
                bulk_query = bulk_query.filter(BulkLineOrder.created_at <= to_dt)
                pit_query = pit_query.filter(PTLineOrder.created_at <= to_dt)
            except ValueError:
                return jsonify({"error": "Invalid 'to' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
        
        history = {
            "intake": [o.to_dict() for o in intake_query.order_by(IntakeOrder.id.desc()).all()],
            "outloading": [o.to_dict() for o in outloading_query.order_by(OutloadingOrder.id.desc()).all()],
            "bulk": [o.to_dict() for o in bulk_query.order_by(BulkLineOrder.id.desc()).all()],
            "pit": [o.to_dict() for o in pit_query.order_by(PTLineOrder.id.desc()).all()],
        }
        
        # Add counts for summary
        total_orders = sum(len(orders) for orders in history.values())
        active_count = sum(len([o for o in orders if not o.get('isComplete', False)]) for orders in history.values())
        completed_count = sum(len([o for o in orders if o.get('isComplete', False)]) for orders in history.values())
        
        return jsonify({
            "ok": True,
            "total_orders": total_orders,
            "active_orders": active_count,
            "completed_orders": completed_count,
            "filters": {
                "type": order_type or "all",
                "from": from_date,
                "to": to_date
            },
            "orders": history,
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@orders_history_bp.route("/stats", methods=["GET"])
def get_orders_statistics():
    """
    Get order statistics and summary information
    """
    try:
        # Get date range for statistics
        from_date = request.args.get('from')
        to_date = request.args.get('to')
        
        # Build base queries
        intake_query = IntakeOrder.query
        outloading_query = OutloadingOrder.query
        bulk_query = BulkLineOrder.query
        pit_query = PTLineOrder.query
        
        # Apply date filters if provided
        if from_date:
            try:
                from_dt = datetime.fromisoformat(from_date.replace('Z', '+00:00'))
                intake_query = intake_query.filter(IntakeOrder.created_at >= from_dt)
                outloading_query = outloading_query.filter(OutloadingOrder.created_at >= from_dt)
                bulk_query = bulk_query.filter(BulkLineOrder.created_at >= from_dt)
                pit_query = pit_query.filter(PTLineOrder.created_at >= from_dt)
            except ValueError:
                return jsonify({"error": "Invalid 'from' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
        
        if to_date:
            try:
                to_dt = datetime.fromisoformat(to_date.replace('Z', '+00:00'))
                intake_query = intake_query.filter(IntakeOrder.created_at <= to_dt)
                outloading_query = outloading_query.filter(OutloadingOrder.created_at <= to_dt)
                bulk_query = bulk_query.filter(BulkLineOrder.created_at <= to_dt)
                pit_query = pit_query.filter(PTLineOrder.created_at <= to_dt)
            except ValueError:
                return jsonify({"error": "Invalid 'to' date format. Use ISO format (YYYY-MM-DDTHH:MM:SS)"}), 400
        
        # Calculate statistics
        stats = {
            "intake": {
                "total": intake_query.count(),
                "active": intake_query.filter_by(is_complete=False).count(),
                "completed": intake_query.filter_by(is_complete=True).count(),
                "avg_duration_minutes": None  # Could calculate if needed
            },
            "outloading": {
                "total": outloading_query.count(),
                "active": outloading_query.filter_by(is_complete=False).count(),
                "completed": outloading_query.filter_by(is_complete=True).count(),
                "avg_duration_minutes": None
            },
            "bulk": {
                "total": bulk_query.count(),
                "active": bulk_query.filter_by(is_complete=False).count(),
                "completed": bulk_query.filter_by(is_complete=True).count(),
                "avg_duration_minutes": None
            },
            "pit": {
                "total": pit_query.count(),
                "active": pit_query.filter_by(is_complete=False).count(),
                "completed": pit_query.filter_by(is_complete=True).count(),
                "avg_duration_minutes": None
            }
        }
        
        # Calculate totals
        total_orders = sum(s["total"] for s in stats.values())
        total_active = sum(s["active"] for s in stats.values())
        total_completed = sum(s["completed"] for s in stats.values())
        
        return jsonify({
            "ok": True,
            "summary": {
                "total_orders": total_orders,
                "active_orders": total_active,
                "completed_orders": total_completed,
                "completion_rate": round((total_completed / total_orders * 100), 2) if total_orders > 0 else 0
            },
            "by_type": stats,
            "date_filter": {
                "from": from_date,
                "to": to_date
            },
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@orders_history_bp.route("/<int:order_id>", methods=["DELETE"])
def delete_order(order_id):
    """
    Delete a specific order by ID
    """
    try:
        # Try to find the order in each table
        order = None
        order_type = None
        
        # Check intake orders
        order = IntakeOrder.query.get(order_id)
        if order:
            order_type = "intake"
        else:
            # Check outloading orders
            order = OutloadingOrder.query.get(order_id)
            if order:
                order_type = "outloading"
            else:
                # Check bulk orders
                order = BulkLineOrder.query.get(order_id)
                if order:
                    order_type = "bulk"
                else:
                    # Check pit orders
                    order = PTLineOrder.query.get(order_id)
                    if order:
                        order_type = "pit"
        
        if not order:
            return jsonify({"error": "Order not found"}), 404
        
        # Delete the order
        db.session.delete(order)
        db.session.commit()
        
        return jsonify({
            "message": f"Order {order_id} deleted successfully",
            "order_type": order_type,
            "deleted_at": datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

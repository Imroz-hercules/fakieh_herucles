import json
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Set, Any
from flask import Blueprint, request, current_app
from flask_socketio import SocketIO, emit, join_room, leave_room
from routes.plc_routes import fetch_plant_orders_snapshot
from routes.orders_sink import persist_orders
from routes.silos_collect import collect_all_silos
from routes.silos_sink import persist_silos

# WebSocket Blueprint
websocket_bp = Blueprint('websocket', __name__, url_prefix='/api/websocket')

# Global state
_connected_clients: Set[str] = set()
_broadcast_running = False
_broadcast_thread = None
_socketio = None

def init_socketio(app):
    """Initialize SocketIO with the Flask app"""
    global _socketio
    _socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
    
    # Register event handlers after SocketIO is initialized
    register_socketio_events(_socketio)
    
    return _socketio

def get_socketio():
    """Get the SocketIO instance"""
    return _socketio

def register_socketio_events(socketio_instance):
    """Register SocketIO event handlers"""
    
    @socketio_instance.on('connect')
    def handle_connect():
        """Handle client connection"""
        client_id = request.sid
        _connected_clients.add(client_id)
        print(f"[websocket] Client connected: {client_id}")
        
        # Send initial data
        try:
            with current_app.app_context():
                data = fetch_plant_orders_snapshot()
            
            # Don't persist orders data to database - only store when status is 8 via handle_order_status
            # persist_orders(data)
            
            # Also collect and persist silo data
            try:
                silo_rows = collect_all_silos()
                persist_silos(silo_rows)
            except Exception as e:
                print(f"[websocket] Failed to persist silo data: {e}")
            
            emit('plc_data', {
                'type': 'initial',
                'data': data,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            emit('error', {'message': f'Failed to get initial data: {str(e)}'})

    @socketio_instance.on('disconnect')
    def handle_disconnect():
        """Handle client disconnection"""
        client_id = request.sid
        _connected_clients.discard(client_id)
        print(f"[websocket] Client disconnected: {client_id}")

    @socketio_instance.on('join')
    def handle_join(data):
        """Handle client joining a room"""
        room = data.get('room', 'default')
        join_room(room)
        emit('status', {'message': f'Joined room: {room}'})

    @socketio_instance.on('leave')
    def handle_leave(data):
        """Handle client leaving a room"""
        room = data.get('room', 'default')
        leave_room(room)
        emit('status', {'message': f'Left room: {room}'})

    @socketio_instance.on('subscribe_plc')
    def handle_subscribe_plc():
        """Handle PLC data subscription"""
        client_id = request.sid
        join_room('plc_data')
        emit('status', {'message': 'Subscribed to PLC data updates'})

    @socketio_instance.on('unsubscribe_plc')
    def handle_unsubscribe_plc():
        """Handle PLC data unsubscription"""
        client_id = request.sid
        leave_room('plc_data')
        emit('status', {'message': 'Unsubscribed from PLC data updates'})

# ---------- BROADCAST WORKER ----------

def broadcast_worker(app_instance):
    """Background worker for broadcasting PLC data"""
    global _broadcast_running
    
    # Get poll interval from config or use default
    # 🔥 CRITICAL: Use faster polling (0.5s) to catch status 8 window (2-3 seconds)
    poll_interval = float(app_instance.config.get('PLC_POLL_INTERVAL', 0.5))
    
    print(f"[websocket] Started broadcasting PLC data every {poll_interval}s (FAST POLLING for status 8 capture)")
    
    while _broadcast_running:
        try:
            # Get PLC data within application context (always, not just when clients are connected)
            with app_instance.app_context():
                data = fetch_plant_orders_snapshot()
                
                # Don't persist orders data to database - only store when status is 8 via handle_order_status
                # persist_orders(data)
                
                # Also collect and persist silo data
                try:
                    silo_rows = collect_all_silos()
                    persist_silos(silo_rows)
                except Exception as e:
                    print(f"[websocket] Failed to persist silo data: {e}")
            
            # Broadcast to all connected clients (only if there are clients)
            if _socketio and _connected_clients:
                _socketio.emit('plc_data', {
                    'type': 'update',
                    'data': data,
                    'timestamp': datetime.now().isoformat()  # Use local time instead of UTC
                }, room='plc_data')
                
        except Exception as e:
            print(f"[websocket] Broadcast error: {e}")
            if _socketio and _connected_clients:
                _socketio.emit('error', {
                    'message': f'Broadcast error: {str(e)}'
                }, room='plc_data')
        
        time.sleep(poll_interval)

# ---------- CONTROL ROUTES ----------

@websocket_bp.route("/start-broadcast", methods=["POST"])
def start_broadcast():
    """Start broadcasting PLC data"""
    global _broadcast_running, _broadcast_thread
    
    if _broadcast_running:
        return {'status': 'already_running', 'message': 'Broadcast is already running'}
    
    _broadcast_running = True
    app = current_app._get_current_object()
    app.config["PLC_BROADCAST_ACTIVE"] = True
    # Pass the Flask app instance to the worker
    _broadcast_thread = threading.Thread(target=broadcast_worker, args=(app,), daemon=True)
    _broadcast_thread.start()
    
    return {
        'status': 'started',
        'message': 'PLC data broadcast started',
        'connected_clients': len(_connected_clients)
    }

@websocket_bp.route("/stop-broadcast", methods=["POST"])
def stop_broadcast():
    """Stop broadcasting PLC data"""
    global _broadcast_running
    
    if not _broadcast_running:
        return {'status': 'not_running', 'message': 'Broadcast is not running'}
    
    _broadcast_running = False
    current_app._get_current_object().config["PLC_BROADCAST_ACTIVE"] = False
    return {'status': 'stopped', 'message': 'PLC data broadcast stopped'}

@websocket_bp.route("/status", methods=["GET"])
def websocket_status():
    """Get WebSocket status"""
    return {
        'broadcast_running': _broadcast_running,
        'connected_clients': len(_connected_clients),
        'client_ids': list(_connected_clients)
    }

# ---------- UTILITY FUNCTIONS ----------

def broadcast_plc_data(data: Dict[str, Any], event_type: str = 'update'):
    """Manually broadcast PLC data to all connected clients"""
    if _socketio and _connected_clients:
        _socketio.emit('plc_data', {
            'type': event_type,
            'data': data,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }, room='plc_data')

def get_connected_clients_count():
    """Get number of connected clients"""
    return len(_connected_clients)

import sys
import os
# Add the Backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
from models import db
# from routes.storage_routes import storage_bp
from routes.weighbridge import weighbridge_bp
from routes.orders import orders_bp
from routes.rfid_routes import rfid_bp
from routes.truck_routes import truck_bp
from routes.reports import reports_bp
from routes.material_routes import material_bp
import config
from routes.production_routes import production_bp
from utils.error_handler import handle_api_error, APIError
from routes.process_routes import process_bp
from routes.weigh_simple import wb_form
from routes.plant_flow import plant_bp
from routes.plc_routes import plc_bp , api_bp
from routes.orders_history_routes import orders_history_bp
from routes.data_ingestion import ingestion_bp
from routes.websocket_routes import websocket_bp, init_socketio
from routes.sqlserver_routes import sqlserver_bp
from routes.kpi_material_routes import kpi_material_bp
from routes.kpi_calendar_routes import kpi_calendar_bp
from routes.distribution_routes import distribution_bp
from routes.settings_routes import settings_bp
from routes.client_routes import client_bp
from routes.truck_entry_routes import truck_entry_bp
# Import models so db.create_all() picks up the new tables (PostgreSQL).
from models.distribution import DistributionRule, SystemSetting
from models.client import Client
from models.truck_weigh_order import TruckWeighOrder
from background_sync import start_silo_sync

app = Flask(__name__)
app.config.from_object(config)

# Initialize the database
db.init_app(app)

# Initialize SocketIO for WebSocket support
socketio = init_socketio(app)

# Configure CORS properly - allow both localhost and network IPs
CORS(app, origins=[
    "http://localhost:5173",
    "http://192.168.199.160:5173",
    "http://192.168.1.60:5173", 
    "http://192.168.199.60:5173",
    "http://192.168.0.60:5173"
], supports_credentials=True)

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'Server is running',
        'sqlserver_database': config.SQLSERVER_DATABASE,
        'batch_materials_table': config.SQLSERVER_BATCH_MATERIALS_TABLE,
    })

# Test endpoint to verify database connection
@app.route('/api/test', methods=['GET'])
def test_db():
    try:
        # Test database connection
        db.session.execute('SELECT 1')
        return jsonify({'status': 'Database connection successful'})
    except Exception as e:
        return jsonify({'error': f'Database connection failed: {str(e)}'}), 500

# Plant orders endpoint (redirects to PLC routes)
@app.route('/api/plant/orders', methods=['GET'])
def plant_orders_main():
    """Redirect to PLC plant orders endpoint"""
    from routes.plc_routes import plant_orders
    return plant_orders()

# Register error handlers
@app.errorhandler(APIError)
def handle_api_exception(error):
    return handle_api_error(error)

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': True,
        'message': 'Resource not found',
        'status_code': 404,
        'error_code': 'NOT_FOUND',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'path': request.path,
        'method': request.method
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': True,
        'message': 'Internal server error',
        'status_code': 500,
        'error_code': 'INTERNAL_ERROR',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'path': request.path,
        'method': request.method
    }), 500

# Register your blueprints
# app.register_blueprint(storage_bp)
app.register_blueprint(weighbridge_bp)
app.register_blueprint(orders_bp)
app.register_blueprint(rfid_bp)
app.register_blueprint(truck_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(production_bp)
app.register_blueprint(material_bp)
app.register_blueprint(process_bp)
app.register_blueprint(wb_form)
app.register_blueprint(plant_bp)
app.register_blueprint(plc_bp)
app.register_blueprint(orders_history_bp)
app.register_blueprint(ingestion_bp)
app.register_blueprint(websocket_bp)
app.register_blueprint(api_bp)
app.register_blueprint(sqlserver_bp)
app.register_blueprint(kpi_material_bp, url_prefix='/api')
app.register_blueprint(kpi_calendar_bp, url_prefix='/api')
app.register_blueprint(distribution_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(client_bp)
app.register_blueprint(truck_entry_bp)

if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Creates tables if they don't exist

        # Add distribution window columns on pre-existing installs
        try:
            from models.distribution import ensure_distribution_columns
            ensure_distribution_columns()
        except Exception as _mig_err:
            print(f"Distribution column migration skipped: {_mig_err}")

        try:
            from models.client import ensure_clients_index
            ensure_clients_index()
        except Exception as _client_idx_err:
            print(f"Clients index migration skipped: {_client_idx_err}")
        
        # Start background silo sync task (in-process; avoids HTTP self-call)
        start_silo_sync(app)

        # Start the report-distribution scheduler (APScheduler cron jobs)
        try:
            from scheduler import start_scheduler
            start_scheduler(app)
        except Exception as _sched_err:
            print(f"Distribution scheduler not started: {_sched_err}")
        
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)

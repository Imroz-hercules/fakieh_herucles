import logging
import traceback
from flask import jsonify, request
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api_debug.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class APIError(Exception):
    """Custom API Exception"""
    def __init__(self, message, status_code=500, error_code=None):
        super().__init__()
        self.message = message
        self.status_code = status_code
        self.error_code = error_code

def log_request_info():
    """Log request information for debugging"""
    logger.info(f"Request: {request.method} {request.url}")
    # Removed verbose header and body logging to reduce terminal output

def log_response_info(response_data, status_code):
    """Log response information for debugging"""
    logger.info(f"Response Status: {status_code}")
    # Removed verbose response data logging to reduce terminal output

def handle_api_error(error):
    """Handle API errors and return consistent error response"""
    error_info = {
        'error': True,
        'message': str(error),
        'status_code': getattr(error, 'status_code', 500),
        'error_code': getattr(error, 'error_code', 'INTERNAL_ERROR'),
        'timestamp': datetime.utcnow().isoformat(),
        'path': request.path,
        'method': request.method
    }
    
    # Log the error
    logger.error(f"API Error: {error_info}")
    logger.error(f"Traceback: {traceback.format_exc()}")
    
    return jsonify(error_info), error_info['status_code']

def handle_database_error(error):
    """Handle database-specific errors"""
    logger.error(f"Database Error: {str(error)}")
    logger.error(f"Traceback: {traceback.format_exc()}")
    
    error_info = {
        'error': True,
        'message': 'Database operation failed',
        'status_code': 500,
        'error_code': 'DATABASE_ERROR',
        'timestamp': datetime.utcnow().isoformat(),
        'path': request.path,
        'method': request.method
    }
    
    return jsonify(error_info), 500

def handle_validation_error(error):
    """Handle validation errors"""
    logger.error(f"Validation Error: {str(error)}")
    
    error_info = {
        'error': True,
        'message': str(error),
        'status_code': 400,
        'error_code': 'VALIDATION_ERROR',
        'timestamp': datetime.utcnow().isoformat(),
        'path': request.path,
        'method': request.method
    }
    
    return jsonify(error_info), 400

def safe_commit(db_session, operation_name="database operation"):
    """Safely commit database changes with error handling"""
    try:
        db_session.commit()
        logger.info(f"Successfully committed {operation_name}")
        return True
    except Exception as e:
        db_session.rollback()
        logger.error(f"Failed to commit {operation_name}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return False

def validate_required_fields(data, required_fields):
    """Validate that required fields are present in request data"""
    missing_fields = []
    for field in required_fields:
        if field not in data or data[field] is None or data[field] == "":
            missing_fields.append(field)
    
    if missing_fields:
        raise APIError(
            f"Missing required fields: {', '.join(missing_fields)}",
            status_code=400,
            error_code='MISSING_FIELDS'
        )

def log_operation(operation, details=None):
    """Log operation details for debugging"""
    # Simplified logging to reduce terminal output
    if details:
        logger.info(f"Operation: {operation} - {details}")
    else:
        logger.info(f"Operation: {operation}")

def create_success_response(data, message="Operation successful", status_code=200):
    """Create a consistent success response"""
    response = {
        'success': True,
        'message': message,
        'data': data,
        'timestamp': datetime.utcnow().isoformat()
    }
    
    log_response_info(response, status_code)
    return jsonify(response), status_code

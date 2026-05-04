from flask import Blueprint, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
import logging
import pyodbc

from config import SQLSERVER_ODBC_CONNECT

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Blueprint
sqlserver_bp = Blueprint('sqlserver', __name__)

def get_sqlserver_db():
    """Get SQL Server database instance"""
    from app import db
    return db

@sqlserver_bp.route('/api/sqlserver/test-connection', methods=['GET'])
def test_sqlserver_connection():
    """Test SQL Server database connection"""
    try:
        db = get_sqlserver_db()
        
        # Test if we can get the SQL Server engine
        try:
            sqlserver_engine = db.get_engine(bind='sqlserver')
            print(f"SQL Server Engine: {sqlserver_engine}")
        except Exception as e:
            return jsonify({
                'success': False,
                'error': 'Failed to get SQL Server engine',
                'message': str(e)
            }), 500
        
        # Test basic connection
        with sqlserver_engine.connect() as connection:
            result = connection.execute(text("SELECT 1 as test"))
            test_value = result.fetchone()[0]
            
            if test_value == 1:
                return jsonify({
                    'success': True,
                    'message': 'SQL Server connection successful',
                    'test_value': test_value
                }), 200
            else:
                return jsonify({
                    'success': False,
                    'error': 'SQL Server connection test failed',
                    'test_value': test_value
                }), 500
                
    except Exception as e:
        logger.error(f"Error testing SQL Server connection: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to test SQL Server connection',
            'message': str(e)
        }), 500

@sqlserver_bp.route('/api/sqlserver/batch-materials', methods=['GET'])
def get_batch_materials():
    """
    Get data from BatchMaterials table in SQL Server
    Query Parameters:
    - limit: Number of records to return (default: 100)
    - offset: Number of records to skip (default: 0)
    - source_server: Filter by Source Server
    - batch_name: Filter by Batch Name
    - product_name: Filter by Product Name
    - material_name: Filter by Material Name
    """
    try:
        # Get query parameters
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        source_server = request.args.get('source_server')
        batch_name = request.args.get('batch_name')
        product_name = request.args.get('product_name')
        material_name = request.args.get('material_name')
        
        # Validate limit
        if limit > 1000:
            limit = 1000
        if limit < 1:
            limit = 100

        # Build the base query with pyodbc parameter placeholders
        base_query = """
            SELECT TOP (?)
                [Source Server],
                [Batch GUID],
                [ROOTGUID],
                [OrderID],
                [Batch Name],
                [Product Name],
                [Batch Act Start],
                [Batch Act End],
                [Batch Transfer Time],
                [Quantity],
                [Material Name],
                [Material Code],
                [sp_prot],
                [SetPoint Float],
                [Actual Value Float],
                [FormulaCategoryName]
            FROM [ASMBatchReports].[dbo].[BatchMaterials]
            WHERE 1=1
        """
        
        # Add filters if provided and build parameter list
        params = [limit]
        if source_server:
            base_query += " AND [Source Server] LIKE ?"
            params.append(f'%{source_server}%')
            
        if batch_name:
            base_query += " AND [Batch Name] LIKE ?"
            params.append(f'%{batch_name}%')
            
        if product_name:
            base_query += " AND [Product Name] LIKE ?"
            params.append(f'%{product_name}%')
            
        if material_name:
            base_query += " AND [Material Name] LIKE ?"
            params.append(f'%{material_name}%')
        
        # Add ORDER BY for consistent results
        base_query += " ORDER BY [Batch Act Start] DESC"
        
        # Execute query using direct pyodbc connection (SQL auth — same DSN as config)
        print("Using direct pyodbc connection to SQL Server...")
        conn = pyodbc.connect(SQLSERVER_ODBC_CONNECT)
        cursor = conn.cursor()
        cursor.execute(base_query, params)
        result = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        conn.close()
        
        # Convert to list of dictionaries
        data = []
        for row in result:
            row_dict = {}
            for i, column in enumerate(columns):
                value = row[i]
                # Handle datetime objects
                if hasattr(value, 'isoformat'):
                    value = value.isoformat()
                row_dict[column] = value
            data.append(row_dict)
        
        return jsonify({
            'success': True,
            'data': data,
            'total_records': len(data),
            'limit': limit,
            'offset': offset,
            'filters_applied': {
                'source_server': source_server,
                'batch_name': batch_name,
                'product_name': product_name,
                'material_name': material_name
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching batch materials: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch batch materials data',
            'message': str(e)
        }), 500

@sqlserver_bp.route('/api/sqlserver/batch-materials/count', methods=['GET'])
def get_batch_materials_count():
    """Get total count of records in BatchMaterials table"""
    try:
        # Use direct pyodbc connection for SQL Server (SQL auth — same DSN as config)
        print("Using direct pyodbc connection to SQL Server for count...")
        conn = pyodbc.connect(SQLSERVER_ODBC_CONNECT)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as total FROM [ASMBatchReports].[dbo].[BatchMaterials]")
        result = cursor.fetchone()
        count = result[0]
        conn.close()
        
        return jsonify({
            'success': True,
            'total_records': count
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting batch materials count: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to get batch materials count',
            'message': str(e)
        }), 500

@sqlserver_bp.route('/api/sqlserver/batch-materials/<batch_guid>', methods=['GET'])
def get_batch_material_by_guid(batch_guid):
    """Get specific batch material by Batch GUID"""
    try:
        # Use direct pyodbc connection for SQL Server (SQL auth — same DSN as config)
        print("Using direct pyodbc connection to SQL Server for GUID lookup...")
        conn = pyodbc.connect(SQLSERVER_ODBC_CONNECT)
        cursor = conn.cursor()
        
        query = """
            SELECT 
                [Source Server],
                [Batch GUID],
                [ROOTGUID],
                [OrderID],
                [Batch Name],
                [Product Name],
                [Batch Act Start],
                [Batch Act End],
                [Batch Transfer Time],
                [Quantity],
                [Material Name],
                [Material Code],
                [sp_prot],
                [SetPoint Float],
                [Actual Value Float],
                [FormulaCategoryName]
            FROM [ASMBatchReports].[dbo].[BatchMaterials]
            WHERE [Batch GUID] = ?
        """
        
        cursor.execute(query, (batch_guid,))
        row = cursor.fetchone()
        
        if not row:
            conn.close()
            return jsonify({
                'success': False,
                'error': 'Batch material not found'
            }), 404
        
        # Convert to dictionary
        columns = [column[0] for column in cursor.description]
        data = {}
        for i, column in enumerate(columns):
            value = row[i]
            if hasattr(value, 'isoformat'):
                value = value.isoformat()
            data[column] = value
        
        conn.close()
                
        return jsonify({
            'success': True,
            'data': data
        }), 200
        
    except Exception as e:
        logger.error(f"Error fetching batch material by GUID: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Failed to fetch batch material',
            'message': str(e)
        }), 500

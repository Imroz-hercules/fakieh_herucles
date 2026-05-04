from flask import Blueprint, request, jsonify
from models import db
from models.reports import (
    DailyReport, WeeklyReport, MonthlyReport, DetailedReport, 
    MaterialConsumptionReport, ReportConfiguration, ColumnConfiguration, ColumnValue
)
from datetime import datetime, timedelta
from sqlalchemy import and_, or_, func
import json

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')

# === Daily Reports ===
@reports_bp.route('/daily', methods=['GET'])
def get_daily_reports():
    """Get daily reports with optional filtering"""
    try:
        # Get query parameters
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        product = request.args.get('product')
        facility_id = request.args.get('facility_id')
        shift = request.args.get('shift')
        
        query = DailyReport.query
        
        # Apply filters
        if start_date:
            query = query.filter(DailyReport.report_date >= start_date)
        if end_date:
            query = query.filter(DailyReport.report_date <= end_date)
        if product:
            query = query.filter(DailyReport.product_name.ilike(f'%{product}%'))
        if facility_id:
            query = query.filter(DailyReport.facility_id == facility_id)
        if shift:
            query = query.filter(DailyReport.shift == shift)
            
        reports = query.order_by(DailyReport.report_date.desc()).all()
        return jsonify([report.to_dict() for report in reports])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/daily/<int:report_id>', methods=['GET'])
def get_daily_report(report_id):
    """Get a specific daily report"""
    try:
        report = DailyReport.query.get_or_404(report_id)
        return jsonify(report.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/daily', methods=['POST'])
def create_daily_report():
    """Create a new daily report"""
    try:
        data = request.json
        report = DailyReport(
            product_name=data['productName'],
            no_of_batches=data['noOfBatches'],
            sum_sp=float(data['sumSP']),
            sum_act=float(data['sumAct']),
            err_kg=float(data['errKg']),
            err_percent=float(data['errPercent'].rstrip('%')),
            report_date=datetime.strptime(data['reportDate'], '%Y-%m-%d').date() if data.get('reportDate') else datetime.utcnow().date(),
            facility_id=data.get('facilityId'),
            shift=data.get('shift')
        )
        db.session.add(report)
        db.session.commit()
        return jsonify(report.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/daily/<int:report_id>', methods=['PUT'])
def update_daily_report(report_id):
    """Update a daily report"""
    try:
        report = DailyReport.query.get_or_404(report_id)
        data = request.json
        
        if 'productName' in data:
            report.product_name = data['productName']
        if 'noOfBatches' in data:
            report.no_of_batches = data['noOfBatches']
        if 'sumSP' in data:
            report.sum_sp = float(data['sumSP'])
        if 'sumAct' in data:
            report.sum_act = float(data['sumAct'])
        if 'errKg' in data:
            report.err_kg = float(data['errKg'])
        if 'errPercent' in data:
            report.err_percent = float(data['errPercent'].rstrip('%'))
        if 'reportDate' in data:
            report.report_date = datetime.strptime(data['reportDate'], '%Y-%m-%d').date()
        if 'facilityId' in data:
            report.facility_id = data['facilityId']
        if 'shift' in data:
            report.shift = data['shift']
            
        report.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(report.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/daily/<int:report_id>', methods=['DELETE'])
def delete_daily_report(report_id):
    """Delete a daily report"""
    try:
        report = DailyReport.query.get_or_404(report_id)
        db.session.delete(report)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Weekly Reports ===
@reports_bp.route('/weekly', methods=['GET'])
def get_weekly_reports():
    """Get weekly reports with optional filtering"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        product = request.args.get('product')
        facility_id = request.args.get('facility_id')
        
        query = WeeklyReport.query
        
        if start_date:
            query = query.filter(WeeklyReport.week_start_date >= start_date)
        if end_date:
            query = query.filter(WeeklyReport.week_end_date <= end_date)
        if product:
            query = query.filter(WeeklyReport.product_name.ilike(f'%{product}%'))
        if facility_id:
            query = query.filter(WeeklyReport.facility_id == facility_id)
            
        reports = query.order_by(WeeklyReport.week_start_date.desc()).all()
        return jsonify([report.to_dict() for report in reports])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/weekly/<int:report_id>', methods=['GET'])
def get_weekly_report(report_id):
    """Get a specific weekly report"""
    try:
        report = WeeklyReport.query.get_or_404(report_id)
        return jsonify(report.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/weekly', methods=['POST'])
def create_weekly_report():
    """Create a new weekly report"""
    try:
        data = request.json
        report = WeeklyReport(
            product_name=data['productName'],
            no_of_batches=data['noOfBatches'],
            sum_sp=float(data['sumSP']),
            sum_act=float(data['sumAct']),
            err_kg=float(data['errKg']),
            err_percent=float(data['errPercent'].rstrip('%')),
            week_start_date=datetime.strptime(data['weekStartDate'], '%Y-%m-%d').date(),
            week_end_date=datetime.strptime(data['weekEndDate'], '%Y-%m-%d').date(),
            facility_id=data.get('facilityId')
        )
        db.session.add(report)
        db.session.commit()
        return jsonify(report.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Monthly Reports ===
@reports_bp.route('/monthly', methods=['GET'])
def get_monthly_reports():
    """Get monthly reports with optional filtering"""
    try:
        month = request.args.get('month')
        year = request.args.get('year')
        product = request.args.get('product')
        facility_id = request.args.get('facility_id')
        
        query = MonthlyReport.query
        
        if month:
            query = query.filter(MonthlyReport.month == int(month))
        if year:
            query = query.filter(MonthlyReport.year == int(year))
        if product:
            query = query.filter(MonthlyReport.product_name.ilike(f'%{product}%'))
        if facility_id:
            query = query.filter(MonthlyReport.facility_id == facility_id)
            
        reports = query.order_by(MonthlyReport.year.desc(), MonthlyReport.month.desc()).all()
        return jsonify([report.to_dict() for report in reports])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/monthly/<int:report_id>', methods=['GET'])
def get_monthly_report(report_id):
    """Get a specific monthly report"""
    try:
        report = MonthlyReport.query.get_or_404(report_id)
        return jsonify(report.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/monthly', methods=['POST'])
def create_monthly_report():
    """Create a new monthly report"""
    try:
        data = request.json
        report = MonthlyReport(
            product_name=data['productName'],
            no_of_batches=data['noOfBatches'],
            sum_sp=float(data['sumSP']),
            sum_act=float(data['sumAct']),
            err_kg=float(data['errKg']),
            err_percent=float(data['errPercent'].rstrip('%')),
            month=data['month'],
            year=data['year'],
            facility_id=data.get('facilityId')
        )
        db.session.add(report)
        db.session.commit()
        return jsonify(report.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Detailed Reports ===
@reports_bp.route('/detailed', methods=['GET'])
def get_detailed_reports():
    """Get detailed reports with optional filtering"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        batch = request.args.get('batch')
        material = request.args.get('material')
        facility_id = request.args.get('facility_id')
        operator = request.args.get('operator')
        
        query = DetailedReport.query
        
        if start_date:
            query = query.filter(DetailedReport.report_date >= start_date)
        if end_date:
            query = query.filter(DetailedReport.report_date <= end_date)
        if batch:
            query = query.filter(DetailedReport.batch.ilike(f'%{batch}%'))
        if material:
            query = query.filter(DetailedReport.material_name.ilike(f'%{material}%'))
        if facility_id:
            query = query.filter(DetailedReport.facility_id == facility_id)
        if operator:
            query = query.filter(DetailedReport.operator.ilike(f'%{operator}%'))
            
        reports = query.order_by(DetailedReport.report_date.desc()).all()
        return jsonify([report.to_dict() for report in reports])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/detailed/<int:report_id>', methods=['GET'])
def get_detailed_report(report_id):
    """Get a specific detailed report"""
    try:
        report = DetailedReport.query.get_or_404(report_id)
        return jsonify(report.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/detailed', methods=['POST'])
def create_detailed_report():
    """Create a new detailed report"""
    try:
        data = request.json
        report = DetailedReport(
            batch=data['batch'],
            material_name=data['materialName'],
            code=data['code'],
            set_point=float(data['setPoint']),
            actual=float(data['actual']),
            err_kg=float(data['errKg']),
            err_percent=float(data['errPercent'].rstrip('%')),
            report_date=datetime.strptime(data['reportDate'], '%Y-%m-%d').date() if data.get('reportDate') else datetime.utcnow().date(),
            facility_id=data.get('facilityId'),
            operator=data.get('operator'),
            supplier=data.get('supplier')
        )
        db.session.add(report)
        db.session.commit()
        return jsonify(report.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Material Consumption Reports ===
@reports_bp.route('/material', methods=['GET'])
def get_material_reports():
    """Get material consumption reports with optional filtering"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        material = request.args.get('material')
        facility_id = request.args.get('facility_id')
        supplier = request.args.get('supplier')
        batch_id = request.args.get('batch_id')
        
        query = MaterialConsumptionReport.query
        
        if start_date:
            query = query.filter(MaterialConsumptionReport.report_date >= start_date)
        if end_date:
            query = query.filter(MaterialConsumptionReport.report_date <= end_date)
        if material:
            query = query.filter(MaterialConsumptionReport.material_name.ilike(f'%{material}%'))
        if facility_id:
            query = query.filter(MaterialConsumptionReport.facility_id == facility_id)
        if supplier:
            query = query.filter(MaterialConsumptionReport.supplier.ilike(f'%{supplier}%'))
        if batch_id:
            query = query.filter(MaterialConsumptionReport.batch_id == batch_id)
            
        reports = query.order_by(MaterialConsumptionReport.report_date.desc()).all()
        return jsonify([report.to_dict() for report in reports])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/material/<int:report_id>', methods=['GET'])
def get_material_report(report_id):
    """Get a specific material consumption report"""
    try:
        report = MaterialConsumptionReport.query.get_or_404(report_id)
        return jsonify(report.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/material', methods=['POST'])
def create_material_report():
    """Create a new material consumption report"""
    try:
        data = request.json
        report = MaterialConsumptionReport(
            material_name=data['materialName'],
            code=data['code'],
            planned_kg=float(data['plannedKg']),
            actual_kg=float(data['actualKg']),
            difference_percent=float(data['differencePercent'].rstrip('%')),
            report_date=datetime.strptime(data['reportDate'], '%Y-%m-%d').date() if data.get('reportDate') else datetime.utcnow().date(),
            facility_id=data.get('facilityId'),
            supplier=data.get('supplier'),
            batch_id=data.get('batchId')
        )
        db.session.add(report)
        db.session.commit()
        return jsonify(report.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Report Configuration ===
@reports_bp.route('/config/tabs', methods=['GET'])
def get_report_tabs():
    """Get all report tab configurations"""
    try:
        configs = ReportConfiguration.query.filter_by(is_active=True).order_by(ReportConfiguration.tab_order).all()
        return jsonify([config.to_dict() for config in configs])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/tabs', methods=['POST'])
def create_report_tab():
    """Create a new report tab configuration"""
    try:
        data = request.json
        config = ReportConfiguration(
            report_type=data['reportType'],
            tab_name=data['tabName'],
            tab_icon=data['tabIcon'],
            tab_order=data.get('tabOrder', 0),
            is_active=data.get('isActive', True)
        )
        db.session.add(config)
        db.session.commit()
        return jsonify(config.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/tabs/<int:config_id>', methods=['PUT'])
def update_report_tab(config_id):
    """Update a report tab configuration"""
    try:
        config = ReportConfiguration.query.get_or_404(config_id)
        data = request.json
        
        if 'reportType' in data:
            config.report_type = data['reportType']
        if 'tabName' in data:
            config.tab_name = data['tabName']
        if 'tabIcon' in data:
            config.tab_icon = data['tabIcon']
        if 'tabOrder' in data:
            config.tab_order = data['tabOrder']
        if 'isActive' in data:
            config.is_active = data['isActive']
            
        config.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(config.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/tabs/<int:config_id>', methods=['DELETE'])
def delete_report_tab(config_id):
    """Delete a report tab configuration"""
    try:
        config = ReportConfiguration.query.get_or_404(config_id)
        db.session.delete(config)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Column Configuration ===
@reports_bp.route('/config/columns/<report_type>', methods=['GET'])
def get_column_configs(report_type):
    """Get column configurations for a specific report type"""
    try:
        configs = ColumnConfiguration.query.filter_by(report_type=report_type).order_by(ColumnConfiguration.column_order).all()
        return jsonify([config.to_dict() for config in configs])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/columns', methods=['POST'])
def create_column_config():
    """Create a new column configuration"""
    try:
        data = request.json
        config = ColumnConfiguration(
            report_type=data['reportType'],
            column_name=data['columnName'],
            is_visible=data.get('isVisible', True),
            is_custom=data.get('isCustom', False),
            column_order=data.get('columnOrder', 0)
        )
        db.session.add(config)
        db.session.commit()
        return jsonify(config.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/columns/<int:config_id>', methods=['PUT'])
def update_column_config(config_id):
    """Update a column configuration"""
    try:
        config = ColumnConfiguration.query.get_or_404(config_id)
        data = request.json
        
        if 'reportType' in data:
            config.report_type = data['reportType']
        if 'columnName' in data:
            config.column_name = data['columnName']
        if 'isVisible' in data:
            config.is_visible = data['isVisible']
        if 'isCustom' in data:
            config.is_custom = data['isCustom']
        if 'columnOrder' in data:
            config.column_order = data['columnOrder']
            
        config.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(config.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/columns/<int:config_id>', methods=['DELETE'])
def delete_column_config(config_id):
    """Delete a column configuration"""
    try:
        config = ColumnConfiguration.query.get_or_404(config_id)
        db.session.delete(config)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Column Values ===
@reports_bp.route('/config/values/<column_name>', methods=['GET'])
def get_column_values(column_name):
    """Get values for a specific column"""
    try:
        values = ColumnValue.query.filter_by(column_name=column_name, is_active=True).all()
        return jsonify([value.to_dict() for value in values])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/values', methods=['POST'])
def create_column_value():
    """Create a new column value"""
    try:
        data = request.json
        value = ColumnValue(
            column_name=data['columnName'],
            value=data['value'],
            is_active=data.get('isActive', True)
        )
        db.session.add(value)
        db.session.commit()
        return jsonify(value.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/values/<int:value_id>', methods=['PUT'])
def update_column_value(value_id):
    """Update a column value"""
    try:
        value = ColumnValue.query.get_or_404(value_id)
        data = request.json
        
        if 'columnName' in data:
            value.column_name = data['columnName']
        if 'value' in data:
            value.value = data['value']
        if 'isActive' in data:
            value.is_active = data['isActive']
            
        value.updated_at = datetime.utcnow()
        db.session.commit()
        return jsonify(value.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@reports_bp.route('/config/values/<int:value_id>', methods=['DELETE'])
def delete_column_value(value_id):
    """Delete a column value"""
    try:
        value = ColumnValue.query.get_or_404(value_id)
        db.session.delete(value)
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Bulk Operations ===
@reports_bp.route('/bulk/daily', methods=['POST'])
def create_bulk_daily_reports():
    """Create multiple daily reports at once"""
    try:
        data = request.json
        reports = []
        
        for report_data in data:
            report = DailyReport(
                product_name=report_data['productName'],
                no_of_batches=report_data['noOfBatches'],
                sum_sp=float(report_data['sumSP']),
                sum_act=float(report_data['sumAct']),
                err_kg=float(report_data['errKg']),
                err_percent=float(report_data['errPercent'].rstrip('%')),
                report_date=datetime.strptime(report_data['reportDate'], '%Y-%m-%d').date() if report_data.get('reportDate') else datetime.utcnow().date(),
                facility_id=report_data.get('facilityId'),
                shift=report_data.get('shift')
            )
            reports.append(report)
            
        db.session.add_all(reports)
        db.session.commit()
        return jsonify([report.to_dict() for report in reports]), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# === Statistics and Analytics ===
@reports_bp.route('/stats/summary', methods=['GET'])
def get_report_summary():
    """Get summary statistics for all report types"""
    try:
        # Get counts for each report type
        daily_count = DailyReport.query.count()
        weekly_count = WeeklyReport.query.count()
        monthly_count = MonthlyReport.query.count()
        detailed_count = DetailedReport.query.count()
        material_count = MaterialConsumptionReport.query.count()
        
        # Get recent activity
        recent_daily = DailyReport.query.order_by(DailyReport.created_at.desc()).limit(5).all()
        recent_detailed = DetailedReport.query.order_by(DetailedReport.created_at.desc()).limit(5).all()
        
        return jsonify({
            'counts': {
                'daily': daily_count,
                'weekly': weekly_count,
                'monthly': monthly_count,
                'detailed': detailed_count,
                'material': material_count
            },
            'recentActivity': {
                'daily': [report.to_dict() for report in recent_daily],
                'detailed': [report.to_dict() for report in recent_detailed]
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# === Export Endpoints ===
@reports_bp.route('/export/<report_type>', methods=['GET'])
def export_reports(report_type):
    """Export reports as CSV"""
    try:
        # This would typically generate a CSV file
        # For now, return the data in a format suitable for CSV generation
        if report_type == 'daily':
            reports = DailyReport.query.all()
        elif report_type == 'weekly':
            reports = WeeklyReport.query.all()
        elif report_type == 'monthly':
            reports = MonthlyReport.query.all()
        elif report_type == 'detailed':
            reports = DetailedReport.query.all()
        elif report_type == 'material':
            reports = MaterialConsumptionReport.query.all()
        else:
            return jsonify({'error': 'Invalid report type'}), 400
            
        return jsonify([report.to_dict() for report in reports])
    except Exception as e:
        return jsonify({'error': str(e)}), 500 
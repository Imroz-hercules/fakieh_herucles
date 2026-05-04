from . import db
from datetime import datetime

class DailyReport(db.Model):
    __tablename__ = 'daily_reports'
    id = db.Column(db.Integer, primary_key=True)
    product_name = db.Column(db.String(100), nullable=False)
    no_of_batches = db.Column(db.Integer, nullable=False)
    sum_sp = db.Column(db.Float, nullable=False)  # Sum Set Point
    sum_act = db.Column(db.Float, nullable=False)  # Sum Actual
    err_kg = db.Column(db.Float, nullable=False)   # Error in KG
    err_percent = db.Column(db.Float, nullable=False)  # Error Percentage
    report_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date())
    facility_id = db.Column(db.String(50), nullable=True)
    shift = db.Column(db.String(20), nullable=True)  # Morning, Afternoon, Night
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productName': self.product_name,
            'noOfBatches': self.no_of_batches,
            'sumSP': str(self.sum_sp),
            'sumAct': str(self.sum_act),
            'errKg': str(self.err_kg),
            'errPercent': f"{self.err_percent:.2f}%",
            'reportDate': self.report_date.isoformat() if self.report_date else None,
            'facilityId': self.facility_id,
            'shift': self.shift,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class WeeklyReport(db.Model):
    __tablename__ = 'weekly_reports'
    id = db.Column(db.Integer, primary_key=True)
    product_name = db.Column(db.String(100), nullable=False)
    no_of_batches = db.Column(db.Integer, nullable=False)
    sum_sp = db.Column(db.Float, nullable=False)
    sum_act = db.Column(db.Float, nullable=False)
    err_kg = db.Column(db.Float, nullable=False)
    err_percent = db.Column(db.Float, nullable=False)
    week_start_date = db.Column(db.Date, nullable=False)
    week_end_date = db.Column(db.Date, nullable=False)
    facility_id = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productName': self.product_name,
            'noOfBatches': self.no_of_batches,
            'sumSP': str(self.sum_sp),
            'sumAct': str(self.sum_act),
            'errKg': str(self.err_kg),
            'errPercent': f"{self.err_percent:.2f}%",
            'weekStartDate': self.week_start_date.isoformat() if self.week_start_date else None,
            'weekEndDate': self.week_end_date.isoformat() if self.week_end_date else None,
            'facilityId': self.facility_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class MonthlyReport(db.Model):
    __tablename__ = 'monthly_reports'
    id = db.Column(db.Integer, primary_key=True)
    product_name = db.Column(db.String(100), nullable=False)
    no_of_batches = db.Column(db.Integer, nullable=False)
    sum_sp = db.Column(db.Float, nullable=False)
    sum_act = db.Column(db.Float, nullable=False)
    err_kg = db.Column(db.Float, nullable=False)
    err_percent = db.Column(db.Float, nullable=False)
    month = db.Column(db.Integer, nullable=False)  # 1-12
    year = db.Column(db.Integer, nullable=False)
    facility_id = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'productName': self.product_name,
            'noOfBatches': self.no_of_batches,
            'sumSP': str(self.sum_sp),
            'sumAct': str(self.sum_act),
            'errKg': str(self.err_kg),
            'errPercent': f"{self.err_percent:.2f}%",
            'month': self.month,
            'year': self.year,
            'facilityId': self.facility_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class DetailedReport(db.Model):
    __tablename__ = 'detailed_reports'
    id = db.Column(db.Integer, primary_key=True)
    batch = db.Column(db.String(50), nullable=False)
    material_name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    set_point = db.Column(db.Float, nullable=False)
    actual = db.Column(db.Float, nullable=False)
    err_kg = db.Column(db.Float, nullable=False)
    err_percent = db.Column(db.Float, nullable=False)
    report_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date())
    facility_id = db.Column(db.String(50), nullable=True)
    operator = db.Column(db.String(100), nullable=True)
    supplier = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'batch': self.batch,
            'materialName': self.material_name,
            'code': self.code,
            'setPoint': str(self.set_point),
            'actual': str(self.actual),
            'errKg': str(self.err_kg),
            'errPercent': f"{self.err_percent:.2f}%",
            'reportDate': self.report_date.isoformat() if self.report_date else None,
            'facilityId': self.facility_id,
            'operator': self.operator,
            'supplier': self.supplier,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class MaterialConsumptionReport(db.Model):
    __tablename__ = 'material_consumption_reports'
    id = db.Column(db.Integer, primary_key=True)
    material_name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), nullable=False)
    planned_kg = db.Column(db.Float, nullable=False)
    actual_kg = db.Column(db.Float, nullable=False)
    difference_percent = db.Column(db.Float, nullable=False)
    report_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date())
    facility_id = db.Column(db.String(50), nullable=True)
    supplier = db.Column(db.String(100), nullable=True)
    batch_id = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'materialName': self.material_name,
            'code': self.code,
            'plannedKg': str(self.planned_kg),
            'actualKg': str(self.actual_kg),
            'differencePercent': f"{self.difference_percent:.2f}%",
            'reportDate': self.report_date.isoformat() if self.report_date else None,
            'facilityId': self.facility_id,
            'supplier': self.supplier,
            'batchId': self.batch_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class ReportConfiguration(db.Model):
    __tablename__ = 'report_configurations'
    id = db.Column(db.Integer, primary_key=True)
    report_type = db.Column(db.String(50), nullable=False)  # daily, weekly, monthly, detailed, material
    tab_name = db.Column(db.String(100), nullable=False)
    tab_icon = db.Column(db.String(50), nullable=False)
    tab_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'reportType': self.report_type,
            'tabName': self.tab_name,
            'tabIcon': self.tab_icon,
            'tabOrder': self.tab_order,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class ColumnConfiguration(db.Model):
    __tablename__ = 'column_configurations'
    id = db.Column(db.Integer, primary_key=True)
    report_type = db.Column(db.String(50), nullable=False)
    column_name = db.Column(db.String(100), nullable=False)
    is_visible = db.Column(db.Boolean, default=True)
    is_custom = db.Column(db.Boolean, default=False)
    column_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'reportType': self.report_type,
            'columnName': self.column_name,
            'isVisible': self.is_visible,
            'isCustom': self.is_custom,
            'columnOrder': self.column_order,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

class ColumnValue(db.Model):
    __tablename__ = 'column_values'
    id = db.Column(db.Integer, primary_key=True)
    column_name = db.Column(db.String(100), nullable=False)
    value = db.Column(db.String(200), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'columnName': self.column_name,
            'value': self.value,
            'isActive': self.is_active,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        } 
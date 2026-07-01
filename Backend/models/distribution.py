from . import db
from datetime import datetime, time


class DistributionRule(db.Model):
    """A scheduled report-distribution rule (stored in PostgreSQL).

    Each rule defines which report tables to send, in which format(s),
    on which schedule, and to whom (email and/or disk).
    """
    __tablename__ = 'distribution_rules'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, default='')
    # List of catalog keys, e.g. ["daily", "batch_historical"]
    report_sources = db.Column(db.JSON, nullable=False, default=list)
    # List of formats the user picked, e.g. ["pdf", "xlsx", "csv"]
    formats = db.Column(db.JSON, nullable=False, default=list)
    delivery_method = db.Column(db.String(20), nullable=False, default='email')  # email | disk | both
    recipients = db.Column(db.JSON, nullable=False, default=list)
    save_path = db.Column(db.Text, nullable=False, default='')
    schedule_type = db.Column(db.String(10), nullable=False, default='daily')  # daily | weekly | monthly
    schedule_time = db.Column(db.Time, nullable=False, default=time(8, 0))      # when the email is SENT
    schedule_day_of_week = db.Column(db.Integer, nullable=True)   # 0=Mon..6=Sun (weekly)
    schedule_day_of_month = db.Column(db.Integer, nullable=True)  # 1..28 (monthly)
    # Data window — independent of the send trigger above.
    window_mode = db.Column(db.String(10), nullable=False, default='auto')  # auto | custom
    window_start_time = db.Column(db.Time, nullable=True, default=time(7, 0))  # auto-mode window start
    window_end_time = db.Column(db.Time, nullable=True, default=time(7, 0))    # auto-mode window end
    custom_start = db.Column(db.DateTime, nullable=True)  # custom-mode explicit start
    custom_end = db.Column(db.DateTime, nullable=True)    # custom-mode explicit end
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    last_run_at = db.Column(db.DateTime, nullable=True)
    last_run_status = db.Column(db.String(20), nullable=True)
    last_run_error = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'report_sources': self.report_sources or [],
            'formats': self.formats or [],
            'delivery_method': self.delivery_method,
            'recipients': self.recipients or [],
            'save_path': self.save_path or '',
            'schedule_type': self.schedule_type,
            'schedule_time': self.schedule_time.strftime('%H:%M') if self.schedule_time else '08:00',
            'schedule_day_of_week': self.schedule_day_of_week,
            'schedule_day_of_month': self.schedule_day_of_month,
            'window_mode': self.window_mode or 'auto',
            'window_start_time': self.window_start_time.strftime('%H:%M') if self.window_start_time else '07:00',
            'window_end_time': self.window_end_time.strftime('%H:%M') if self.window_end_time else '07:00',
            'custom_start': self.custom_start.isoformat() if self.custom_start else None,
            'custom_end': self.custom_end.isoformat() if self.custom_end else None,
            'enabled': self.enabled,
            'last_run_at': self.last_run_at.isoformat() if self.last_run_at else None,
            'last_run_status': self.last_run_status,
            'last_run_error': self.last_run_error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class SystemSetting(db.Model):
    """Generic key/value settings store (PostgreSQL).

    Used to persist the email configuration (SMTP vs Resend cloud) under
    the key ``smtp_config``. ``value`` holds a JSON-serialisable object.
    """
    __tablename__ = 'system_settings'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), nullable=False, unique=True)
    value = db.Column(db.JSON, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


def ensure_distribution_columns():
    """Add window columns to an existing distribution_rules table.

    ``db.create_all()`` does not alter existing tables, so on installs that
    were created before the window feature we add the new columns here.
    Safe to run repeatedly (PostgreSQL ``ADD COLUMN IF NOT EXISTS``).
    """
    from sqlalchemy import text
    statements = [
        "ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS window_mode VARCHAR(10) NOT NULL DEFAULT 'auto'",
        "ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS window_start_time TIME DEFAULT '07:00'",
        "ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS window_end_time TIME DEFAULT '07:00'",
        "ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS custom_start TIMESTAMP NULL",
        "ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS custom_end TIMESTAMP NULL",
    ]
    try:
        for stmt in statements:
            db.session.execute(text(stmt))
        db.session.commit()
    except Exception:
        db.session.rollback()

from datetime import datetime, timezone

from . import db


class Client(db.Model):
    """Delivery client contact records (PostgreSQL default bind — not SQL Server)."""

    __tablename__ = 'clients'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'phone': self.phone,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


def ensure_clients_index():
    """Create name search index on existing installs (safe to run repeatedly)."""
    from sqlalchemy import text

    db.session.execute(
        text('CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (LOWER(name))')
    )
    db.session.commit()

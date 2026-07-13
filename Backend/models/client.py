from datetime import datetime, timezone

from . import db


class Client(db.Model):
    """Delivery client contact records (PostgreSQL default bind — not SQL Server)."""

    __tablename__ = 'clients'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(50), nullable=False)
    client_number = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'phone': self.phone,
            'client_number': self.client_number or '',
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


def ensure_clients_index():
    """Ensure client_number column + name search index (safe to run repeatedly)."""
    from sqlalchemy import text

    db.session.execute(
        text(
            'ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_number VARCHAR(100)'
        )
    )
    db.session.execute(
        text('CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (LOWER(name))')
    )
    db.session.execute(
        text(
            'CREATE INDEX IF NOT EXISTS idx_clients_client_number '
            'ON clients (LOWER(client_number)) '
            "WHERE client_number IS NOT NULL AND client_number <> ''"
        )
    )
    db.session.commit()

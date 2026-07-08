from datetime import datetime

from . import db

# Queue lifecycle states
QUEUE_WAITING = "WAITING"
QUEUE_DISPATCHED = "DISPATCHED"
QUEUE_RUNNING = "RUNNING"
QUEUE_COMPLETED = "COMPLETED"
QUEUE_CANCELLED = "CANCELLED"

# States that occupy a PLC line (only one allowed per line at a time)
ACTIVE_STATUSES = frozenset({QUEUE_DISPATCHED, QUEUE_RUNNING})
OPEN_STATUSES = frozenset({QUEUE_WAITING, QUEUE_DISPATCHED, QUEUE_RUNNING})


class OrderQueue(db.Model):
    """
    Live order queue for sequential, RFID-matched dispatch to the PLC.

    Rows are created at enqueue time (status WAITING) and NEVER written to the
    PLC directly. A single dispatcher (see plc_routes.process_order_queue) writes
    exactly one order per PLC line, only when that line is Idle. This structurally
    prevents a second order from overwriting the PLC tags of a running order.
    """
    __tablename__ = "order_queue"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    # Routing / dispatch target
    order_type = db.Column(db.String(20), nullable=False)   # intake|mineral|outloading|bulk|pit
    db_no = db.Column(db.Integer, nullable=False)            # PLC data block (1/2/3/4)
    line = db.Column(db.Integer, nullable=False, default=0)  # 1/2/3 (0 for bulk/pit)

    # RFID matching key
    rfid_number = db.Column(db.String(50), nullable=True)

    # Queue lifecycle
    queue_status = db.Column(db.String(20), nullable=False, default=QUEUE_WAITING)
    queue_position = db.Column(db.Integer, nullable=True)

    # Common order payload (superset across all order types)
    badge_no = db.Column(db.String(50), nullable=True)
    material_code = db.Column(db.String(50), nullable=True)
    material_name = db.Column(db.String(100), nullable=True)
    declared_qty_kg = db.Column(db.Float, nullable=True)
    dest1 = db.Column(db.String(50), nullable=True)
    dest2 = db.Column(db.String(50), nullable=True)
    dest_sel = db.Column(db.String(50), nullable=True)   # outloading

    # Bulk-specific
    source_silo = db.Column(db.String(50), nullable=True)
    cc25_sel = db.Column(db.String(50), nullable=True)
    scale_sel = db.Column(db.String(50), nullable=True)

    # Pit-specific
    pit_no = db.Column(db.String(50), nullable=True)
    raw_code = db.Column(db.String(50), nullable=True)

    # Metadata
    truck_id = db.Column(db.Integer, nullable=True)
    client_id = db.Column(db.Integer, nullable=True)
    note = db.Column(db.String(255), nullable=True)

    # Lifecycle timestamps
    created_at = db.Column(db.DateTime, default=datetime.now)
    dispatched_at = db.Column(db.DateTime, nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)

    def to_dict(self):
        return {
            "id": self.id,
            "orderType": self.order_type,
            "dbNo": self.db_no,
            "line": self.line,
            "rfidNumber": self.rfid_number,
            "queueStatus": self.queue_status,
            "queuePosition": self.queue_position,
            "badgeNo": self.badge_no,
            "materialCode": self.material_code,
            "materialName": self.material_name or "",
            "declaredQuantityKG": self.declared_qty_kg or 0,
            "destinationSilo1": self.dest1 or "",
            "destinationSilo2": self.dest2 or "",
            "destSel": self.dest_sel or "",
            "sourceSilo": self.source_silo or "",
            "cc25Sel": self.cc25_sel or "",
            "scaleSel": self.scale_sel or "",
            "pitNo": self.pit_no or "",
            "rawCode": self.raw_code or "",
            "truckId": self.truck_id,
            "clientId": self.client_id,
            "note": self.note or "",
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "dispatchedAt": self.dispatched_at.isoformat() if self.dispatched_at else None,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "completedAt": self.completed_at.isoformat() if self.completed_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }


def ensure_order_queue_table():
    """Create order_queue table + indexes on existing installs (idempotent)."""
    from sqlalchemy import inspect, text

    db.create_all()
    insp = inspect(db.engine)
    if not insp.has_table("order_queue"):
        return

    index_statements = [
        "CREATE INDEX IF NOT EXISTS ix_order_queue_dispatch "
        "ON order_queue (order_type, line, queue_status, queue_position)",
        "CREATE INDEX IF NOT EXISTS ix_order_queue_status ON order_queue (queue_status)",
        "CREATE INDEX IF NOT EXISTS ix_order_queue_rfid ON order_queue (rfid_number)",
    ]
    try:
        for stmt in index_statements:
            db.session.execute(text(stmt))
        db.session.commit()
    except Exception:
        db.session.rollback()

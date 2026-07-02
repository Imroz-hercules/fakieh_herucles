from datetime import datetime

from sqlalchemy import Index

from . import db

# ─────────────── Intake Orders ───────────────
class IntakeOrder(db.Model):
    __tablename__ = 'intake_orders'
    __table_args__ = (
        Index("ix_intake_orders_complete_finished", "is_complete", "finished_at"),
        Index("ix_intake_orders_created_at", "created_at"),
    )
    id = db.Column(db.Integer, primary_key=True)
    badge_no = db.Column(db.String(20), nullable=False)
    source_material_code = db.Column(db.String(50), nullable=False)
    source_material_name = db.Column(db.String(100), nullable=True)
    declared_quantity_kg = db.Column(db.Integer, nullable=False)
    destination_silo1 = db.Column(db.String(50), nullable=False)
    destination_silo1_material_name = db.Column(db.String(100), nullable=True)
    destination_silo2 = db.Column(db.String(50), nullable=False)
    destination_silo2_material_name = db.Column(db.String(100), nullable=True)
    rfid_badge_reading = db.Column(db.String(50), nullable=False)
    active_badge = db.Column(db.String(10), nullable=False)
    active_destination = db.Column(db.String(50), nullable=False)
    status_word = db.Column(db.String(20), nullable=False)
    line = db.Column(db.String(20), nullable=False)
    truck_id = db.Column(db.Integer, nullable=True)
    client_id = db.Column(db.Integer, nullable=True)

    # 🔹 Lifecycle timestamps
    created_at = db.Column(db.DateTime, default=datetime.now)
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    idle_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    is_complete = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'badgeNo': self.badge_no,
            'sourceMaterialCode': self.source_material_code,
            'sourceMaterialName': self.source_material_name or '',
            'declaredQuantityKG': self.declared_quantity_kg,
            'destinationSilo1': self.destination_silo1,
            'destinationSilo1MaterialName': self.destination_silo1_material_name or '',
            'destinationSilo2': self.destination_silo2,
            'destinationSilo2MaterialName': self.destination_silo2_material_name or '',
            'rfidBadgeReading': self.rfid_badge_reading,
            'activeBadge': self.active_badge,
            'activeDestination': self.active_destination,
            'statusWord': self.status_word,
            'line': self.line,
            'truckId': self.truck_id,
            'clientId': self.client_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'finishedAt': self.finished_at.isoformat() if self.finished_at else None,
            'idleAt': self.idle_at.isoformat() if self.idle_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'isComplete': self.is_complete,
        }


# ─────────────── Outloading Orders ───────────────
class OutloadingOrder(db.Model):
    __tablename__ = 'outloading_orders'
    __table_args__ = (
        Index("ix_outloading_orders_complete_finished", "is_complete", "finished_at"),
        Index("ix_outloading_orders_created_at", "created_at"),
    )
    id = db.Column(db.Integer, primary_key=True)
    badge_no = db.Column(db.String(20), nullable=False)
    source_material_code = db.Column(db.String(50), nullable=False)
    source_material_name = db.Column(db.String(100), nullable=True)
    rfid_set = db.Column(db.String(50), nullable=False)
    declared_quantity_kg = db.Column(db.Integer, nullable=False)
    destination_silo1 = db.Column(db.String(50), nullable=False)
    destination_silo1_material_name = db.Column(db.String(100), nullable=True)
    destination_silo2 = db.Column(db.String(50), nullable=False)
    destination_silo2_material_name = db.Column(db.String(100), nullable=True)
    rfid_badge_reading = db.Column(db.String(50), nullable=False)
    active_badge = db.Column(db.String(10), nullable=False)
    active_destination = db.Column(db.String(50), nullable=False)
    status_word = db.Column(db.String(20), nullable=False)
    activ_dest_set = db.Column(db.String(50), nullable=False)
    line = db.Column(db.String(20), nullable=False)  # Add missing line field
    truck_id = db.Column(db.Integer, nullable=True)
    client_id = db.Column(db.Integer, nullable=True)

    # 🔹 Lifecycle timestamps
    created_at = db.Column(db.DateTime, default=datetime.now)
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    idle_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    is_complete = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'badgeNo': self.badge_no,
            'sourceMaterialCode': self.source_material_code,
            'sourceMaterialName': self.source_material_name or '',
            'rfidSet': self.rfid_set,
            'declaredQuantityKG': self.declared_quantity_kg,
            'destinationSilo1': self.destination_silo1,
            'destinationSilo1MaterialName': self.destination_silo1_material_name or '',
            'destinationSilo2': self.destination_silo2,
            'destinationSilo2MaterialName': self.destination_silo2_material_name or '',
            'rfidBadgeReading': self.rfid_badge_reading,
            'activeBadge': self.active_badge,
            'activeDestination': self.active_destination,
            'statusWord': self.status_word,
            'activDestSet': self.activ_dest_set,
            'line': self.line,
            'truckId': self.truck_id,
            'clientId': self.client_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'finishedAt': self.finished_at.isoformat() if self.finished_at else None,
            'idleAt': self.idle_at.isoformat() if self.idle_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'isComplete': self.is_complete,
        }


# ─────────────── Bulk Line Orders ───────────────
class BulkLineOrder(db.Model):
    __tablename__ = 'bulk_line_orders'
    __table_args__ = (
        Index("ix_bulk_line_orders_complete_finished", "is_complete", "finished_at"),
        Index("ix_bulk_line_orders_created_at", "created_at"),
    )
    id = db.Column(db.Integer, primary_key=True)
    badge_no = db.Column(db.String(20))
    source_material_code = db.Column(db.String(50))
    source_material_name = db.Column(db.String(100), nullable=True)
    feed = db.Column(db.String(50))
    recipe_name = db.Column(db.String(100))
    recipe_set = db.Column(db.String(50))
    recipe_quantity = db.Column(db.Integer)
    recipe_quantity_consumed = db.Column(db.Integer)
    weight_inv = db.Column(db.Integer)
    weight_wt = db.Column(db.Integer)
    weight_on = db.Column(db.Integer)
    source_silo = db.Column(db.String(100))
    destination_silo1 = db.Column(db.String(100))
    destination_silo1_material_name = db.Column(db.String(100), nullable=True)
    destination_silo2 = db.Column(db.String(100))
    destination_silo2_material_name = db.Column(db.String(100), nullable=True)
    cc25_sel = db.Column(db.String(50))
    declared_quantity_kg = db.Column(db.Float)
    scale_sel = db.Column(db.String(50))
    status_word = db.Column(db.String(50))
    active_source_silo = db.Column(db.String(100))
    active_dest1 = db.Column(db.String(100))
    active_dest2 = db.Column(db.String(100))
    active_cc25_sel = db.Column(db.String(50))
    active_qty_kg = db.Column(db.Float)
    active_scale_sel = db.Column(db.String(50))
    truck_id = db.Column(db.Integer, nullable=True)
    client_id = db.Column(db.Integer, nullable=True)

    # 🔹 Lifecycle timestamps
    created_at = db.Column(db.DateTime, default=datetime.now)
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    idle_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    completed_at = db.Column(db.DateTime, nullable=True)
    is_complete = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'badgeNo': getattr(self, 'badge_no', None) or '',
            'sourceMaterialCode': getattr(self, 'source_material_code', None) or '',
            'sourceMaterialName': getattr(self, 'source_material_name', None) or '',
            'feed': getattr(self, 'feed', None) or '',
            'recipeName': getattr(self, 'recipe_name', None) or '',
            'recipeSet': getattr(self, 'recipe_set', None) or '',
            'recipeQuantity': getattr(self, 'recipe_quantity', None) or 0,
            'recipeQuantityConsumed': getattr(self, 'recipe_quantity_consumed', None) or 0,
            'weightInv': getattr(self, 'weight_inv', None) or 0,
            'weightWt': getattr(self, 'weight_wt', None) or 0,
            'weightOn': getattr(self, 'weight_on', None) or 0,
            'sourceSilo': getattr(self, 'source_silo', None) or '',
            'destinationSilo1': getattr(self, 'destination_silo1', None) or '',
            'destinationSilo1MaterialName': getattr(self, 'destination_silo1_material_name', None) or '',
            'destinationSilo2': getattr(self, 'destination_silo2', None) or '',
            'destinationSilo2MaterialName': getattr(self, 'destination_silo2_material_name', None) or '',
            'cc25Sel': getattr(self, 'cc25_sel', None) or '',
            'declaredQuantityKG': getattr(self, 'declared_quantity_kg', None) or 0.0,
            'scaleSel': getattr(self, 'scale_sel', None) or '',
            'statusWord': getattr(self, 'status_word', None) or '',
            'activeSourceSilo': getattr(self, 'active_source_silo', None) or '',
            'activeDest1': getattr(self, 'active_dest1', None) or '',
            'activeDest2': getattr(self, 'active_dest2', None) or '',
            'activeCc25Sel': getattr(self, 'active_cc25_sel', None) or '',
            'activeQtyKG': getattr(self, 'active_qty_kg', None) or 0.0,
            'activeScaleSel': getattr(self, 'active_scale_sel', None) or '',
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'finishedAt': self.finished_at.isoformat() if self.finished_at else None,
            'idleAt': self.idle_at.isoformat() if self.idle_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'completedAt': self.completed_at.isoformat() if self.completed_at else None,
            'isComplete': getattr(self, 'is_complete', False),
            'line': 'Bulk',  # Bulk orders don't have line numbers
            'truckId': self.truck_id,
            'clientId': self.client_id,
        }


# ─────────────── PIT Line Orders ───────────────
class PTLineOrder(db.Model):
    __tablename__ = 'pt_line_orders'
    __table_args__ = (
        Index("ix_pt_line_orders_complete_finished", "is_complete", "finished_at"),
        Index("ix_pt_line_orders_created_at", "created_at"),
    )
    id = db.Column(db.Integer, primary_key=True)
    pit_no = db.Column(db.String(50))
    raw_code = db.Column(db.String(50))
    raw_material_name = db.Column(db.String(100), nullable=True)
    destination_silo1 = db.Column(db.String(100))
    destination_silo1_material_name = db.Column(db.String(100), nullable=True)
    destination_silo2 = db.Column(db.String(100))
    destination_silo2_material_name = db.Column(db.String(100), nullable=True)
    declared_quantity_kg = db.Column(db.Float)
    scale_sel = db.Column(db.String(50))
    status_word = db.Column(db.String(50))
    truck_id = db.Column(db.Integer, nullable=True)
    client_id = db.Column(db.Integer, nullable=True)

    # 🔹 Lifecycle timestamps
    created_at = db.Column(db.DateTime, default=datetime.now)
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    idle_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    completed_at = db.Column(db.DateTime, nullable=True)
    is_complete = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'badgeNo': getattr(self, 'pit_no', None) or '',  # Use pit_no as identifier for PIT orders
            'pitNo': getattr(self, 'pit_no', None) or '',
            'rawCode': getattr(self, 'raw_code', None) or '',
            'rawMaterialName': getattr(self, 'raw_material_name', None) or '',
            'destinationSilo1': getattr(self, 'destination_silo1', None) or '',
            'destinationSilo1MaterialName': getattr(self, 'destination_silo1_material_name', None) or '',
            'destinationSilo2': getattr(self, 'destination_silo2', None) or '',
            'destinationSilo2MaterialName': getattr(self, 'destination_silo2_material_name', None) or '',
            'declaredQuantityKG': getattr(self, 'declared_quantity_kg', None) or 0.0,
            'scaleSel': getattr(self, 'scale_sel', None) or '',
            'statusWord': getattr(self, 'status_word', None) or '',
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'startedAt': self.started_at.isoformat() if self.started_at else None,
            'finishedAt': self.finished_at.isoformat() if self.finished_at else None,
            'idleAt': self.idle_at.isoformat() if self.idle_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'completedAt': self.completed_at.isoformat() if self.completed_at else None,
            'isComplete': getattr(self, 'is_complete', False),
            'line': 'PIT',  # PIT orders don't have line numbers
            'truckId': self.truck_id,
            'clientId': self.client_id,
        }

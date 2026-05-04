from . import db
from datetime import datetime

class Material(db.Model):
    __tablename__ = 'materials'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String, nullable=False)
    code = db.Column(db.String, nullable=False, unique=True)
    type = db.Column(db.String, nullable=False)  # e.g., Raw Material, Treated Material
    stock = db.Column(db.Float, nullable=False, default=0)
    unit = db.Column(db.String, nullable=False)  # e.g., KG, L, Units
    cost = db.Column(db.Float, nullable=False, default=0)
    reorder_level = db.Column(db.Float, nullable=False, default=0)
    status = db.Column(db.String, nullable=False, default='In Stock')  # In Stock, Low Stock, Critical
    supplier = db.Column(db.String, nullable=True)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "code": self.code,
            "type": self.type,
            "stock": self.stock,
            "unit": self.unit,
            "cost": self.cost,
            "reorderLevel": self.reorder_level,
            "status": self.status,
            "supplier": self.supplier,
            "lastUpdated": self.last_updated.isoformat()
        }

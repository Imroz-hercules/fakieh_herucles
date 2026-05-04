# models/weighbridge.py
from datetime import datetime
from . import db

class WeighbridgeRecord(db.Model):
    __tablename__ = 'weighbridge_records'

    id              = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    truck_id        = db.Column(db.Integer, nullable=False)
    timestamp       = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # NEW: 1 = Scale 1 (Intake), 2 = Scale 2 (Loadout)
    scale           = db.Column(db.SmallInteger, nullable=False, default=1)

    truck_plate     = db.Column(db.String)
    truck_driver    = db.Column(db.String)
    truck_material  = db.Column(db.String)
    weight          = db.Column(db.Float, nullable=False)
    rfid_linked     = db.Column(db.Boolean, default=False)
    order_linked    = db.Column(db.String)
    order_id        = db.Column(db.Integer)
    mode            = db.Column(db.String)   # 'TARE' or 'GROSS'

    def to_dict(self):
        return {
            "id": self.id,
            "truck_id": self.truck_id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "scale": self.scale,                           # <-- include
            "truck_plate": self.truck_plate,
            "truck_driver": self.truck_driver,
            "truck_material": self.truck_material,
            "weight": self.weight,
            "rfid_linked": self.rfid_linked,
            "order_linked": self.order_linked,
            "order_id": self.order_id,
            "mode": self.mode,
        }

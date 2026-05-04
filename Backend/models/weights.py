# models/weights.py
from . import db
from datetime import datetime

class WeightLog(db.Model):
    __tablename__ = "weights_log"
    id        = db.Column(db.BigInteger, primary_key=True)
    truck_id  = db.Column(db.Integer, nullable=False, index=True)
    stage     = db.Column(db.String(4), nullable=False)   # "IN" or "OUT"
    weight_kg = db.Column(db.Float, nullable=False)
    ts        = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, index=True)

class RFIDLog(db.Model):
    __tablename__ = "rfid_log"
    id           = db.Column(db.BigInteger, primary_key=True)
    rfid_number  = db.Column(db.String(64), nullable=False, index=True)
    truck_id     = db.Column(db.Integer, nullable=False, index=True)
    order_ref    = db.Column(db.String(128), nullable=False)   # e.g., "Intake Line 2"
    ts           = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, index=True)
    sent_to_plc  = db.Column(db.Boolean, default=False)
    plc_payload  = db.Column(db.JSON)  # store what we sent/ack we received

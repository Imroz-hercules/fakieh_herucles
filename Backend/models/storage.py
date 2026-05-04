# models/storage.py
from . import db

class Silo(db.Model):
    __tablename__ = 'silos'
    
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False)
    material = db.Column(db.String, nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    current = db.Column(db.Integer, nullable=False)
    temperature = db.Column(db.Float, nullable=False)
    humidity = db.Column(db.Float, nullable=False)
    last_updated = db.Column(db.String, nullable=False)
    status = db.Column(db.String, nullable=False)
    utilization = db.Column(db.Integer, nullable=False)

class BinMaterial(db.Model):
    __tablename__ = 'bin_materials'
    
    id = db.Column(db.Integer, primary_key=True)
    bin_name = db.Column(db.String, nullable=False)
    material_name = db.Column(db.String, nullable=False)
    material_code = db.Column(db.String, nullable=False)
    hl_active = db.Column(db.Boolean, nullable=False)
    lock_active = db.Column(db.Boolean, nullable=False)

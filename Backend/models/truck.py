from . import db

class Truck(db.Model):
    __tablename__ = 'trucks'
    id = db.Column(db.Integer, primary_key=True)
    license = db.Column(db.String)
    model = db.Column(db.String)
    year = db.Column(db.String)
    capacity = db.Column(db.String)
    company = db.Column(db.String)
    status = db.Column(db.String)
    contact = db.Column(db.String)

    def to_dict(self):
        return {
            "id": self.id,
            "license": self.license,
            "model": self.model,
            "year": self.year,
            "capacity": self.capacity,
            "company": self.company,
            "status": self.status,
            "contact": self.contact,
        }

class Driver(db.Model):
    __tablename__ = 'drivers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    license_no = db.Column(db.String(50), nullable=False, unique=True)
    assigned_truck = db.Column(db.String(100))  # keep for legacy UI if you want
    rfid = db.Column(db.String(50))
    contact = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Active")

    # NEW: map the existing DB column + relationship
    truck_id = db.Column(db.Integer, db.ForeignKey('trucks.id'), nullable=True)
    truck = db.relationship('Truck', backref='drivers')

    def to_dict(self):
        out = {
            "id": self.id,
            "name": self.name,
            "license_no": self.license_no,
            "assigned_truck": self.assigned_truck,
            "rfid": self.rfid,
            "contact": self.contact,
            "status": self.status,
            "truck_id": self.truck_id,
        }
        if self.truck:
            out["truck"] = self.truck.to_dict()
        return out

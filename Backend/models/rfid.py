from . import db

class RFIDTag(db.Model):
    __tablename__ = 'rfid_tags'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    tag_id = db.Column(db.String(50), nullable=False, unique=True)
    last_seen = db.Column(db.String(100))
    battery_level = db.Column(db.Integer)
    signal_strength = db.Column(db.Integer)
    status = db.Column(db.String(20))
    material = db.Column(db.String(50))
    container = db.Column(db.String(50))
    last_update = db.Column(db.String(50))

    def to_dict(self):
        # Return camelCase keys for frontend compatibility
        return {
            "id": self.id,
            "tagID": self.tag_id,
            "lastSeen": self.last_seen,
            "batteryLevel": self.battery_level,
            "signalStrength": self.signal_strength,
            "status": self.status,
            "material": self.material,
            "container": self.container,
            "lastUpdate": self.last_update
        }

class RFIDConfig(db.Model):
    __tablename__ = 'rfid_config'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    rfid_number = db.Column(db.String(50), nullable=False, unique=True)
    rfid_used = db.Column(db.Boolean, nullable=False, default=False)
    rfid_linked_to_order = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "rfid_number": self.rfid_number,
            "rfid_used": self.rfid_used,
            "rfid_linked_to_order": self.rfid_linked_to_order
        }
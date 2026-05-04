# models/weigh_visit.py
from . import db

class WeighVisit(db.Model):
    __tablename__ = 'weigh_visits'

    id             = db.Column(db.BigInteger, primary_key=True)
    ticket         = db.Column(db.String, unique=True, nullable=False)

    rfid           = db.Column(db.String, nullable=False)
    order_id       = db.Column(db.Integer)
    flow_type      = db.Column(db.String)        # 'intake' | 'loadout'
    scale          = db.Column(db.SmallInteger)  # 1 | 2

    truck_id       = db.Column(db.Integer)
    truck_plate    = db.Column(db.String)
    truck_model    = db.Column(db.String)
    truck_company  = db.Column(db.String)
    truck_capacity = db.Column(db.String)
    truck_contact  = db.Column(db.String)

    driver_id      = db.Column(db.Integer)
    driver_name    = db.Column(db.String)
    driver_license = db.Column(db.String)
    driver_contact = db.Column(db.String)

    material       = db.Column(db.String)

    entry_weight   = db.Column(db.Float)
    entry_time     = db.Column(db.DateTime(timezone=True))
    exit_weight    = db.Column(db.Float)
    exit_time      = db.Column(db.DateTime(timezone=True))

    status         = db.Column(db.String, default='open')
    created_at     = db.Column(db.DateTime(timezone=True), server_default=db.func.now())

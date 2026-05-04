from . import db
from datetime import datetime



class ProductionBatch(db.Model):
    __tablename__ = 'production_batches'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)  # e.g., "BCT-001"
    recipe = db.Column(db.String, nullable=False)  # e.g., "RCP-001"
    batch_no = db.Column(db.String, nullable=False, unique=True)  # e.g., "BAT1689"
    feed_type = db.Column(db.String, nullable=False)
    formula = db.Column(db.String, nullable=False)
    target_qty = db.Column(db.Integer, nullable=False)
    actual_qty = db.Column(db.Integer, nullable=False)
    product_range = db.Column(db.String, nullable=True)  # e.g., "95%"
    quality_check = db.Column(db.String, nullable=False)  # Passed, Failed, Warning
    status = db.Column(db.String, nullable=False)  # e.g., Completed, Ready
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'recipe': self.recipe,
            'batchNo': self.batch_no,
            'feedType': self.feed_type,
            'formula': self.formula,
            'targetQty': self.target_qty,
            'actualQty': self.actual_qty,
            'productRange': self.product_range,
            'qualityCheck': self.quality_check,
            'status': self.status,
            'createdAt': self.created_at.isoformat()
        }

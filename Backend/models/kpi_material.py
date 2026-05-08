"""SQL Server BatchMaterials view for batch reporting (ASMBatchReports)."""
from models import db
from sqlalchemy import PrimaryKeyConstraint
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER


class KPIMaterial(db.Model):
    __bind_key__ = "sqlserver"
    __tablename__ = "BatchMaterials"
    __table_args__ = (
        PrimaryKeyConstraint("Batch GUID", "OrderId", "Material Name", "Batch Act Start"),
        {"schema": "dbo"},
    )

    source_server = db.Column("Source Server", db.String(255))
    batch_guid = db.Column("Batch GUID", UNIQUEIDENTIFIER)
    rootguid = db.Column("ROOTGUID", UNIQUEIDENTIFIER)
    order_id = db.Column("OrderId", db.Integer)
    batch_name = db.Column("Batch Name", db.String(255))
    product_name = db.Column("Product Name", db.String(255))
    batch_act_start = db.Column("Batch Act Start", db.DateTime)
    batch_act_end = db.Column("Batch Act End", db.DateTime)
    batch_transfer_time = db.Column("Batch Transfer Time", db.DateTime)
    quantity = db.Column("Quantity", db.Float)
    material_name = db.Column("Material Name", db.String(255))
    material_code = db.Column("Material Code", db.String(255))
    setpoint_float = db.Column("SetPoint Float", db.Float)
    actual_value_float = db.Column("Actual Value Float", db.Float)
    formula_category_name = db.Column("FormulaCategoryName", db.String(255))

    def __repr__(self):
        return f"<KPIMaterial {self.batch_name}>"

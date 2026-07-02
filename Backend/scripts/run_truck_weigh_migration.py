"""Apply truck_weigh_orders schema (idempotent). Run on deploy before backend restart."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from models import db
from models.truck_weigh_order import ensure_truck_weigh_orders_table
from sqlalchemy import inspect


def main():
    with app.app_context():
        ensure_truck_weigh_orders_table()
        exists = inspect(db.engine).has_table("truck_weigh_orders")
        print(f"truck_weigh_orders table: {'OK' if exists else 'MISSING'}")
        if not exists:
            sys.exit(1)
    print("Truck weigh migration complete.")


if __name__ == "__main__":
    main()

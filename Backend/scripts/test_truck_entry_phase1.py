"""Phase 1 smoke tests for /api/truck-entry endpoints."""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from models import db
from models.truck import Truck
from models.truck_weigh_order import TruckWeighOrder


def run_tests():
    with app.app_context():
        db.create_all()

    client = app.test_client()
    results = []

    def check(name, cond, detail=""):
        results.append((name, cond, detail))
        status = "PASS" if cond else "FAIL"
        print(f"  [{status}] {name}" + (f" — {detail}" if detail and not cond else ""))

    # --- invalid material ---
    r = client.post(
        "/api/truck-entry/orders",
        json={"truck_id": 1, "material_code": "INVALID"},
    )
    check("reject invalid material", r.status_code == 400, r.get_data(as_text=True))

    # --- need a truck ---
    with app.app_context():
        truck = Truck.query.first()
        if not truck:
            truck = Truck(
                license="TEST-PHASE1",
                model="Test",
                year="2026",
                capacity="30T",
                company="Test Co",
                status="active",
                contact="000",
            )
            db.session.add(truck)
            db.session.commit()
        truck_id = truck.id
        # Clean open orders for this truck from prior runs
        TruckWeighOrder.query.filter(
            TruckWeighOrder.truck_id == truck_id,
            TruckWeighOrder.status.in_(["awaiting_first", "awaiting_second"]),
        ).delete(synchronize_session=False)
        db.session.commit()

    # --- create ---
    r = client.post(
        "/api/truck-entry/orders",
        json={"truck_id": truck_id, "material_code": "100"},
    )
    check("create order 201", r.status_code == 201, r.get_data(as_text=True))
    data = r.get_json() or {}
    order_id = data.get("id")
    check("create returns material_name", data.get("material_name") == "Yellow Maize 7.8%")
    check("create status awaiting_first", data.get("status") == "awaiting_first")

    # --- duplicate open order ---
    r2 = client.post(
        "/api/truck-entry/orders",
        json={"truck_id": truck_id, "material_code": "100"},
    )
    check("reject duplicate open order", r2.status_code == 409, r2.get_data(as_text=True))

    # --- first weight ---
    r = client.post(
        f"/api/truck-entry/orders/{order_id}/first",
        json={"weight": 24000},
    )
    check("first weight 200", r.status_code == 200, r.get_data(as_text=True))
    d1 = r.get_json() or {}
    check("status awaiting_second", d1.get("status") == "awaiting_second")
    check("site_status out_pending", d1.get("site_status") == "out_pending")

    # --- second before first again should fail (already past first) ---
    r = client.post(
        f"/api/truck-entry/orders/{order_id}/first",
        json={"weight": 1000},
    )
    check("reject second first call", r.status_code == 409)

    # --- second weight ---
    r = client.post(
        f"/api/truck-entry/orders/{order_id}/second",
        json={"weight": 12500},
    )
    check("second weight 200", r.status_code == 200, r.get_data(as_text=True))
    d2 = r.get_json() or {}
    check("status completed", d2.get("status") == "completed")
    check("net_kg correct", d2.get("net_kg") == 11500, f"net={d2.get('net_kg')}")

    # --- lists ---
    r = client.get("/api/truck-entry/orders/open")
    check("open list 200", r.status_code == 200)
    open_data = r.get_json() or {}
    open_ids = [o["id"] for o in open_data.get("orders", [])]
    check("completed order not in open", order_id not in open_ids)

    r = client.get("/api/truck-entry/orders/today")
    check("today list 200", r.status_code == 200)
    today = r.get_json() or {}
    today_ids = [row["id"] for row in today.get("rows", [])]
    check("completed order in today", order_id in today_ids)

    r = client.get(f"/api/truck-entry/orders/{order_id}")
    check("get order 200", r.status_code == 200)

    r = client.get("/api/truck-entry/status/by-truck")
    check("status by truck 200", r.status_code == 200)

    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"\n{passed}/{total} tests passed")
    return passed == total


if __name__ == "__main__":
    ok = run_tests()
    sys.exit(0 if ok else 1)

# routes/silos_sink.py
from typing import List, Dict, Any
from sqlalchemy import text
from models import db

def persist_silos(rows: List[Dict[str, Any]]):
    """
    rows: [{"silo_no": 101, "db_no": 1, "material_code": "...", "material_name": "...",
            "hl_active": True, "lock_active": False, "quantity_kg": 123.4}, ...]
    - Upserts into silo_status
    - Appends into silo_status_history only when material/HL/lock changed
    """
    if not rows:
        return

    engine = db.get_engine()
    with engine.begin() as conn:
        silo_nos = [int(r["silo_no"]) for r in rows]
        current = conn.execute(
            text("""
                SELECT silo_no, material_code, material_name, hl_active, lock_active
                FROM public.silo_status
                WHERE silo_no = ANY(:nos)
            """),
            {"nos": silo_nos}
        ).fetchall()
        cur_map = {r[0]: {"material_code": r[1], "material_name": r[2],
                          "hl_active": r[3], "lock_active": r[4]} for r in current}

        changed: List[Dict[str, Any]] = []
        for r in rows:
            s_no = int(r["silo_no"])
            old = cur_map.get(s_no)
            new = {
                "material_code": r.get("material_code"),
                "material_name": r.get("material_name"),
                "hl_active":     bool(r.get("hl_active", False)),
                "lock_active":   bool(r.get("lock_active", False)),
            }
            is_changed = (
                old is None or
                old["material_code"] != new["material_code"] or
                old["material_name"] != new["material_name"] or
                bool(old["hl_active"])  != bool(new["hl_active"])  or
                bool(old["lock_active"])!= bool(new["lock_active"])
            )
            if is_changed:
                changed.append({
                    "silo_no": s_no,
                    "db_no":   int(r.get("db_no") or 0),
                    **new
                })

        conn.execute(
            text("""
                INSERT INTO public.silo_status
                    (silo_no, db_no, material_code, material_name, hl_active, lock_active, quantity_kg)
                VALUES
                    (:silo_no, :db_no, :material_code, :material_name, :hl_active, :lock_active, :quantity_kg)
                ON CONFLICT (silo_no) DO UPDATE SET
                    db_no = EXCLUDED.db_no,
                    material_code = EXCLUDED.material_code,
                    material_name = EXCLUDED.material_name,
                    hl_active = EXCLUDED.hl_active,
                    lock_active = EXCLUDED.lock_active,
                    quantity_kg = COALESCE(EXCLUDED.quantity_kg, public.silo_status.quantity_kg),
                    updated_at = now()
            """),
            [
                {
                    "silo_no": int(r["silo_no"]),
                    "db_no":   int(r.get("db_no") or 0),
                    "material_code": r.get("material_code"),
                    "material_name": r.get("material_name"),
                    "hl_active":     bool(r.get("hl_active", False)),
                    "lock_active":   bool(r.get("lock_active", False)),
                    "quantity_kg":   r.get("quantity_kg"),
                }
                for r in rows
            ]
        )

        if changed:
            conn.execute(
                text("""
                    INSERT INTO public.silo_status_history
                        (silo_no, db_no, material_code, material_name, hl_active, lock_active)
                    VALUES
                        (:silo_no, :db_no, :material_code, :material_name, :hl_active, :lock_active)
                """),
                changed
            )


def persist_silo_qty_batch(qty_by_silo: Dict[int, float]) -> int:
    """Upsert quantity_kg for every silo in the DB5 qty map."""
    if not qty_by_silo:
        return 0

    engine = db.get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO public.silo_status
                    (silo_no, db_no, material_code, material_name, hl_active, lock_active, quantity_kg)
                VALUES
                    (:silo_no, 0, '', '', false, false, :quantity_kg)
                ON CONFLICT (silo_no) DO UPDATE SET
                    quantity_kg = EXCLUDED.quantity_kg,
                    updated_at = now()
            """),
            [
                {"silo_no": int(silo_no), "quantity_kg": float(qty)}
                for silo_no, qty in qty_by_silo.items()
            ],
        )
    return len(qty_by_silo)

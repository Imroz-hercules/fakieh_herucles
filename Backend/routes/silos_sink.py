# routes/silos_sink.py
from typing import List, Dict, Any
from sqlalchemy import text
from models import db

def persist_silos(rows: List[Dict[str, Any]]):
    """
    rows: [{"silo_no": 101, "db_no": 1, "material_code": "...", "material_name": "...",
            "hl_active": True, "lock_active": False}, ...]
    - Upserts into silo_status
    - Appends into silo_status_history only when something changed
    """
    if not rows:
        return

    engine = db.get_engine()
    with engine.begin() as conn:
        # 1) Load current snapshots for these silos
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

        # 2) Upsert snapshots and collect changed rows for history
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

        # 3) UPSERT snapshots (do it for all rows, not just changed, to refresh updated_at)
        conn.execute(
            text("""
                INSERT INTO public.silo_status
                    (silo_no, db_no, material_code, material_name, hl_active, lock_active)
                VALUES
                    (:silo_no, :db_no, :material_code, :material_name, :hl_active, :lock_active)
                ON CONFLICT (silo_no) DO UPDATE SET
                    db_no = EXCLUDED.db_no,
                    material_code = EXCLUDED.material_code,
                    material_name = EXCLUDED.material_name,
                    hl_active = EXCLUDED.hl_active,
                    lock_active = EXCLUDED.lock_active,
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
                }
                for r in rows
            ]
        )

        # 4) Insert into history only on change
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

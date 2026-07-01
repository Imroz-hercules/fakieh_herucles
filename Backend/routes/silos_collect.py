# routes/silos_collect.py
from typing import List, Dict, Any
from routes.plc_routes import load_map_from_pg, read_db_bytes, render_silos, fetch_silo_qty_from_plc

def collect_all_silos(db_list=(1, 2, 3)) -> List[Dict[str, Any]]:
    """Read silos from all mapped DBs and return normalized rows for sink."""
    qty_by_silo = fetch_silo_qty_from_plc()
    out: List[Dict[str, Any]] = []
    for db_no in db_list:
        m = load_map_from_pg(db_no)
        need = max(96, int(m.get("max_byte", 0)) + 8)
        b = read_db_bytes(db_no, need)
        if not b:
            continue
        rows = render_silos(b, m["silo_meta"], m["hl_map"])
        for r in rows:
            name = str(r.get("bin_name") or "")
            try:
                s_no = int(name.split()[-1])
            except Exception:
                continue
            out.append({
                "silo_no": s_no,
                "db_no": db_no,
                "material_code": r.get("material_code"),
                "material_name": r.get("material_name"),
                "hl_active": bool(r.get("hl_active", False)),
                "lock_active": bool(r.get("lock_active", False)),
                "quantity_kg": qty_by_silo.get(s_no),
            })
    return out

# routes/silos_collect.py
from typing import List, Dict, Any
from routes.plc_routes import load_map_from_pg, read_db_bytes, render_silos

def collect_all_silos(db_list=(1,2,3,4)) -> List[Dict[str, Any]]:
    """Read silos from all mapped DBs and return normalized rows for sink."""
    out: List[Dict[str, Any]] = []
    for db_no in db_list:
        m = load_map_from_pg(db_no)
        need = max(96, int(m.get("max_byte", 0)) + 8)
        b = read_db_bytes(db_no, need)
        if not b:
            continue
        # Updated: render_silos now properly handles both HL and LOCK bits from hl_map
        # The hl_map contains both "hl" and "lock" entries for each silo
        rows = render_silos(b, m["silo_meta"], m["hl_map"])
        # attach db_no and normalize silo number from "Silo 101"
        for r in rows:
            name = str(r.get("bin_name") or "")
            # expecting "Silo 101"
            try:
                s_no = int(name.split()[-1])
            except Exception:
                continue
            out.append({
                "silo_no": s_no,
                "db_no":   db_no,
                "material_code": r.get("material_code"),
                "material_name": r.get("material_name"),
                "hl_active":     bool(r.get("hl_active", False)),
                "lock_active":   bool(r.get("lock_active", False)),
            })
    return out

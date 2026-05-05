import os
import time
import json
import threading
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from flask import Blueprint, jsonify, current_app
from models import db
from routes.plc_routes import fetch_plant_orders_snapshot
from routes.orders_sink import persist_orders
from routes.silos_collect import collect_all_silos
from routes.silos_sink import persist_silos
from psycopg2.extras import execute_batch

# Data Ingestion Blueprint
ingestion_bp = Blueprint('ingestion', __name__, url_prefix='/api/ingestion')

# Configuration
POLL_SEC = float(os.getenv("POLL_SEC", "1"))  # 1 second by default
ONLY_ON_CHANGES = os.getenv("ONLY_ON_CHANGES", "true").lower() == "true"

# Global state for change detection
_last_snapshot = {}
_ingestion_running = False
_ingestion_thread = None

def nz(x, default=None):
    """Null/zero value helper"""
    return default if (x is None or (isinstance(x, str) and x.strip() == "")) else x

def get_table_columns(cur, table):
    """Get column names for a table"""
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
    """, (table,))
    return {row[0].lower() for row in cur.fetchall()}

def insert_rows(cur, table, rows, wanted_cols):
    """Insert rows into table"""
    if not rows: 
        return 0
    cols = [c for c in wanted_cols if any(c in r for r in rows)]
    if not cols:
        return 0
    values = [[r.get(c) for c in cols] for r in rows]
    ph = ",".join(["%s"] * len(cols))
    sql = f"INSERT INTO {table} ({','.join(cols)}) VALUES ({ph})"
    execute_batch(cur, sql, values, page_size=200)
    return len(rows)

# ---------- MAPPERS ----------

def map_intake_rows(payload, table_cols):
    """Map intake orders to database rows"""
    rows = []
    for rec in payload.get("intake", []) or []:
        sw_code = (rec.get("status_word") or {}).get("code", 0)
        row = {
            "badge_no":               nz(rec.get("badge_no")),
            "source_material_code":   nz(rec.get("material_code")),
            "declared_quantity_kg":   nz(rec.get("declared_qty_kg")),
            "destination_silo1":      nz(rec.get("dest1")),
            "destination_silo2":      nz(rec.get("dest2")),
            "rfid_badge_reading":     nz(rec.get("rfid_badge_reading"), 0.0),
            "active_badge":           nz(rec.get("active_badge"), 0),
            "active_destination":     nz(rec.get("active_destination"), 0),
            "status_word":            nz(sw_code, 0),
            "line":                   nz(rec.get("line")),
        }
        if "ingest_ts" in table_cols:
            row["ingest_ts"] = "NOW()"
        rows.append(row)
    return rows

def map_outloading_rows(payload, table_cols):
    """Map outloading orders to database rows"""
    rows = []
    for rec in payload.get("outloading", []) or []:
        sw_code = (rec.get("status_word") or {}).get("code", 0)
        row = {
            "badge_no":               nz(rec.get("badge_no")),
            "source_material_code":   nz(rec.get("material_code")),
            "declared_quantity_kg":   nz(rec.get("declared_qty_kg")),
            "destination_silo1":      nz(rec.get("dest1")),
            "destination_silo2":      nz(rec.get("dest2")),
            "rfid_badge_reading":     nz(rec.get("rfid_badge_reading"), 0.0),
            "active_badge":           nz(rec.get("active_badge"), 0),
            "active_destination":     nz(rec.get("active_destination"), 0),
            "status_word":            nz(sw_code, 0),
            "line":                   nz(rec.get("line")),
        }
        if "ingest_ts" in table_cols:
            row["ingest_ts"] = "NOW()"
        rows.append(row)
    return rows

def map_bulk_row(payload, table_cols):
    """Map bulk orders to database rows"""
    rec = payload.get("bulk")
    if not rec: 
        return []
    sw_code = (rec.get("status_word") or {}).get("code", 0)
    row = {
        "source_silo":           nz(rec.get("source_silo")),
        "destination_silo1":     nz(rec.get("dest1")),
        "destination_silo2":     nz(rec.get("dest2")),
        "cc25_sel":              nz(rec.get("cc25_sel")),
        "declared_quantity_kg":  nz(rec.get("declared_qty_kg")),
        "scale_sel":             nz(rec.get("scale_sel")),
        "status_word":           nz(sw_code, 0),
    }
    if "ingest_ts" in table_cols:
        row["ingest_ts"] = "NOW()"
    return [row]

def map_pt_row(payload, table_cols):
    """Map pit orders to database rows"""
    rec = payload.get("pit")
    if not rec:
        return []
    sw_code = (rec.get("status_word") or {}).get("code", 0)
    row = {
        "pit_no":                nz(rec.get("pit_no")),
        "raw_material_code":     nz(rec.get("raw_code")),
        "declared_quantity_kg":  nz(rec.get("declared_qty_kg")),
        "destination_silo1":     nz(rec.get("dest1")),
        "destination_silo2":     nz(rec.get("dest2")),
        "scale_sel":             nz(rec.get("scale_sel")),
        "status_word":           nz(sw_code, 0),
    }
    if "ingest_ts" in table_cols:
        row["ingest_ts"] = "NOW()"
    return [row]

# ---------- CHANGE FILTER ----------

def snapshot(payload):
    """Return a stable, comparable snapshot of what we'd store."""
    return json.dumps(payload, sort_keys=True, ensure_ascii=False)

def changed(key, payload):
    """Check if data has changed since last snapshot"""
    global _last_snapshot
    snap = snapshot(payload)
    if _last_snapshot.get(key) != snap:
        _last_snapshot[key] = snap
        return True
    return False

# ---------- DATA INGESTION ----------

def ingest_orders_data(payload):
    """Ingest orders data into database tables"""
    try:
        # Use the main database connection (fakieh)
        with db.engine.raw_connection() as conn:
            with conn.cursor() as cur:
                # intake_orders
                intake_cols = get_table_columns(cur, "intake_orders")
                intake_rows = map_intake_rows(payload, intake_cols)
                if intake_rows:
                    plain_cols = [c for c in intake_rows[0].keys() if intake_rows[0][c] != "NOW()"]
                    cols_with_now = [c for c in intake_rows[0].keys() if intake_rows[0][c] == "NOW()"]
                    if cols_with_now:
                        cols = plain_cols + cols_with_now
                        values = []
                        for r in intake_rows:
                            values.append([r.get(c) for c in plain_cols])
                        ph = ",".join(["%s"] * len(plain_cols))
                        if cols_with_now:
                            ph = ph + "," + ",".join(["NOW()"] * len(cols_with_now))
                        sql = f"INSERT INTO intake_orders ({','.join(cols)}) VALUES ({ph})"
                        execute_batch(cur, sql, values, page_size=200)
                    else:
                        insert_rows(cur, "intake_orders", intake_rows, intake_cols)

                # outloading_orders
                out_cols = get_table_columns(cur, "outloading_orders")
                if out_cols:
                    out_rows = map_outloading_rows(payload, out_cols)
                    if out_rows:
                        plain_cols = [c for c in out_rows[0].keys() if out_rows[0][c] != "NOW()"]
                        cols_with_now = [c for c in out_rows[0].keys() if out_rows[0][c] == "NOW()"]
                        if cols_with_now:
                            cols = plain_cols + cols_with_now
                            values = []
                            for r in out_rows:
                                values.append([r.get(c) for c in plain_cols])
                            ph = ",".join(["%s"] * len(plain_cols))
                            if cols_with_now:
                                ph = ph + "," + ",".join(["NOW()"] * len(cols_with_now))
                            sql = f"INSERT INTO outloading_orders ({','.join(cols)}) VALUES ({ph})"
                            execute_batch(cur, sql, values, page_size=200)
                        else:
                            insert_rows(cur, "outloading_orders", out_rows, out_cols)

                # bulk_line_orders
                bulk_cols = get_table_columns(cur, "bulk_line_orders")
                if bulk_cols:
                    bulk_rows = map_bulk_row(payload, bulk_cols)
                    if bulk_rows:
                        plain_cols = [c for c in bulk_rows[0].keys() if bulk_rows[0][c] != "NOW()"]
                        cols_with_now = [c for c in bulk_rows[0].keys() if bulk_rows[0][c] == "NOW()"]
                        if cols_with_now:
                            cols = plain_cols + cols_with_now
                            values = []
                            for r in bulk_rows:
                                values.append([r.get(c) for c in plain_cols])
                            ph = ",".join(["%s"] * len(plain_cols))
                            if cols_with_now:
                                ph = ph + "," + ",".join(["NOW()"] * len(cols_with_now))
                            sql = f"INSERT INTO bulk_line_orders ({','.join(cols)}) VALUES ({ph})"
                            execute_batch(cur, sql, values, page_size=50)
                        else:
                            insert_rows(cur, "bulk_line_orders", bulk_rows, bulk_cols)

                # pt_line_orders
                pt_cols = get_table_columns(cur, "pt_line_orders")
                if pt_cols:
                    pt_rows = map_pt_row(payload, pt_cols)
                    if pt_rows:
                        plain_cols = [c for c in pt_rows[0].keys() if pt_rows[0][c] != "NOW()"]
                        cols_with_now = [c for c in pt_rows[0].keys() if pt_rows[0][c] == "NOW()"]
                        if cols_with_now:
                            cols = plain_cols + cols_with_now
                            values = []
                            for r in pt_rows:
                                values.append([r.get(c) for c in plain_cols])
                            ph = ",".join(["%s"] * len(plain_cols))
                            if cols_with_now:
                                ph = ph + "," + ",".join(["NOW()"] * len(cols_with_now))
                            sql = f"INSERT INTO pt_line_orders ({','.join(cols)}) VALUES ({ph})"
                            execute_batch(cur, sql, values, page_size=50)
                        else:
                            insert_rows(cur, "pt_line_orders", pt_rows, pt_cols)

        return True
    except Exception as e:
        print(f"[ingestion] DB error: {e}")
        return False

def ingestion_worker(app_instance):
    """Background worker for continuous data ingestion"""
    global _ingestion_running
    
    print(f"[ingestion] Started polling every {POLL_SEC}s, ONLY_ON_CHANGES={ONLY_ON_CHANGES}")
    
    while _ingestion_running:
        try:
            # Get data from PLC routes within application context
            with app_instance.app_context():
                payload = fetch_plant_orders_snapshot()
                
                # Check for changes if enabled
                if ONLY_ON_CHANGES and not changed("plant_orders", payload):
                    time.sleep(POLL_SEC)
                    continue

                # Ingest data using the orders sink (more reliable)
                try:
                    persist_orders(payload)
                    print(f"[ingestion] Orders data persisted successfully at {datetime.now(timezone.utc).isoformat()}")
                    
                    # Also collect and persist silo data
                    try:
                        silo_rows = collect_all_silos()
                        persist_silos(silo_rows)
                        print(f"[ingestion] Silo data persisted successfully")
                    except Exception as e:
                        print(f"[ingestion] Failed to persist silo data: {e}")
                    
                    success = True
                except Exception as e:
                    print(f"[ingestion] Failed to persist orders data: {e}")
                    success = False
            
        except Exception as e:
            print(f"[ingestion] Error: {e}")
        
        time.sleep(POLL_SEC)

# ---------- ROUTES ----------

@ingestion_bp.route("/start", methods=["POST"])
def start_ingestion():
    """Start the data ingestion process"""
    global _ingestion_running, _ingestion_thread
    
    if _ingestion_running:
        return jsonify({"status": "already_running", "message": "Ingestion is already running"})
    
    _ingestion_running = True
    # Pass the Flask app instance to the worker
    _ingestion_thread = threading.Thread(target=ingestion_worker, args=(current_app._get_current_object(),), daemon=True)
    _ingestion_thread.start()
    
    return jsonify({
        "status": "started",
        "message": "Data ingestion started",
        "poll_interval": POLL_SEC,
        "only_on_changes": ONLY_ON_CHANGES
    })

@ingestion_bp.route("/stop", methods=["POST"])
def stop_ingestion():
    """Stop the data ingestion process"""
    global _ingestion_running
    
    if not _ingestion_running:
        return jsonify({"status": "not_running", "message": "Ingestion is not running"})
    
    _ingestion_running = False
    return jsonify({"status": "stopped", "message": "Data ingestion stopped"})

@ingestion_bp.route("/status", methods=["GET"])
def ingestion_status():
    """Get ingestion status"""
    return jsonify({
        "running": _ingestion_running,
        "poll_interval": POLL_SEC,
        "only_on_changes": ONLY_ON_CHANGES,
        "last_snapshot_keys": list(_last_snapshot.keys())
    })

@ingestion_bp.route("/ingest-now", methods=["POST"])
def ingest_now():
    """Manually trigger data ingestion once"""
    try:
        with current_app.app_context():
            payload = fetch_plant_orders_snapshot()
        
        try:
            persist_orders(payload)
            
            # Also collect and persist silo data
            try:
                silo_rows = collect_all_silos()
                persist_silos(silo_rows)
            except Exception as e:
                print(f"[ingestion] Failed to persist silo data: {e}")
            
            return jsonify({
                "status": "success",
                "message": "Orders and silo data persisted successfully",
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to persist data: {str(e)}"}), 500
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

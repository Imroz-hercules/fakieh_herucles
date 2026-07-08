#!/usr/bin/env python3
"""
Simulate a truck presenting its RFID at a line by writing the RFID value into
the PLC tag L{line}_RFID_BadgeReading. Use this to verify that a WAITING queued
order auto-starts (the dispatcher matches the scanned RFID and writes the order).

Usage (from repo root):
  py -3 Backend/scripts/simulate_rfid_scan.py --rfid 100 --tab intake-line-1
  py -3 Backend/scripts/simulate_rfid_scan.py --rfid 100 --db 1 --line 1
  py -3 Backend/scripts/simulate_rfid_scan.py --rfid 100 --tab intake-line-1 --wait
  py -3 Backend/scripts/simulate_rfid_scan.py --rfid 0  --db 1 --line 1   # clear

Requires: the backend broadcast/poller must be running so process_order_queue
executes each poll cycle and picks up the scanned RFID.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import app  # noqa: E402
from models import db  # noqa: E402
from models.order_queue import OrderQueue  # noqa: E402
from routes.plc_routes import (  # noqa: E402
    load_map_from_pg,
    _write_tags,
    read_db_bytes,
    render_lines,
    _needed_bytes,
    _nz,
    _normalize_rfid,
    _snap7_loaded,
    DEMO_MODE,
    QUEUE_STRICT_RFID,
)

# tab name -> (db_no, line)
TAB_MAP = {
    "intake-line-1": (1, 1),
    "intake-line-2": (1, 2),
    "mineral-intake": (3, 3),
    "outloading-1": (2, 1),
    "outloading-2": (2, 2),
    "outloading-3": (2, 3),
}

# tab family -> queue order_type (mirrors queueMatchForTab on the frontend)
_ORDER_TYPE = {1: "intake", 2: "outloading", 3: "mineral"}


def _resolve_target(args) -> tuple[int, int]:
    if args.tab:
        return TAB_MAP[args.tab]
    if args.db and args.line:
        return args.db, args.line
    raise SystemExit("Provide either --tab OR both --db and --line")


def _matching_rows(order_type: str, line: int, rfid: str):
    """Waiting/dispatched/running queue rows for this line + RFID."""
    return (
        OrderQueue.query
        .filter(OrderQueue.order_type == order_type,
                OrderQueue.line == line,
                OrderQueue.rfid_number == rfid)
        .order_by(OrderQueue.queue_position.asc(), OrderQueue.created_at.asc())
        .all()
    )


def _read_scan_tag(db_no: int, m: dict, line: int):
    """Read L{line}_RFID_BadgeReading straight back from the PLC."""
    b = read_db_bytes(db_no, _needed_bytes(m))
    if not b:
        return None
    lines = render_lines(b, m["line_tags"])
    return _normalize_rfid(_nz(lines, f"L{line}_RFID_BadgeReading"))


def _read_line_state(db_no: int, m: dict, line: int):
    """Read exactly what the dispatcher sees: (status_word, scanned_rfid)."""
    b = read_db_bytes(db_no, _needed_bytes(m))
    if not b:
        return None, None
    lines = render_lines(b, m["line_tags"])
    status = _nz(lines, f"L{line}_StatusWord")
    scanned = _normalize_rfid(_nz(lines, f"L{line}_RFID_BadgeReading"))
    return status, scanned


def _diagnose(db_no: int, m: dict, line: int, order_type: str, rfid: str) -> None:
    """One-shot report of everything that gates auto-dispatch for this line."""
    from models.order_queue import ACTIVE_STATUSES

    print("\n================ DISPATCH DIAGNOSIS ================")
    status, scanned = _read_line_state(db_no, m, line)
    print(f"Line target       : {order_type} line {line} (DB{db_no})")
    print(f"L{line}_StatusWord : {status!r}  (dispatch requires 1 = Idle)")
    print(f"L{line}_RFID read  : {scanned!r}  (dispatch requires this to match a WAITING rfid)")
    print(f"QUEUE_STRICT_RFID  : {QUEUE_STRICT_RFID}  (this script's env; the SERVER uses its own)")

    rows = (
        OrderQueue.query
        .filter(OrderQueue.order_type == order_type, OrderQueue.line == line)
        .order_by(OrderQueue.id.asc())
        .all()
    )
    print(f"\nAll queue rows for {order_type} line {line} ({len(rows)}):")
    if not rows:
        print("    (none)")
    for r in rows:
        print(f"    #{r.id}  status={r.queue_status:<10} pos={r.queue_position} "
              f"rfid={r.rfid_number} qty={r.declared_qty_kg}")

    active = [r for r in rows if r.queue_status in ACTIVE_STATUSES]
    waiting = [r for r in rows if r.queue_status == "WAITING"]

    print("\nVerdict:")
    if active:
        ids = ", ".join(f"#{r.id}({r.queue_status})" for r in active)
        print(f"  ⛔ Line is BLOCKED by active row(s): {ids}. A new order can't dispatch")
        print("     until these complete or are cancelled. -> This is your cause.")
    elif status != 1:
        print(f"  ⛔ StatusWord is {status!r}, not 1 (Idle) -> dispatcher's `if status==1`")
        print("     branch never runs. -> This is your cause.")
    elif not any(_normalize_rfid(r.rfid_number) == _normalize_rfid(rfid) for r in waiting):
        print(f"  ⛔ No WAITING row on this line matches RFID {rfid}. -> This is your cause.")
    elif scanned != _normalize_rfid(rfid):
        print(f"  ⛔ Reader shows {scanned!r}, not {rfid}. Write the RFID first, then diagnose.")
    else:
        print("  ✅ Everything the dispatcher checks is satisfied RIGHT NOW.")
        print("     If it still doesn't move, the running server isn't executing the")
        print("     dispatcher (stale code) -> restart the backend with PLC_VERBOSE_LOGS=1.")
    print("===================================================\n")


def _print_rows(rows) -> None:
    if not rows:
        print("    (no matching queue rows for this line + RFID)")
        return
    for r in rows:
        print(f"    #{r.id}  status={r.queue_status:<10} pos={r.queue_position} "
              f"rfid={r.rfid_number} qty={r.declared_qty_kg}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rfid", required=True, help="RFID value to write (e.g. 100). Use 0 to clear.")
    ap.add_argument("--tab", choices=sorted(TAB_MAP), help="Pick the line by tab name.")
    ap.add_argument("--db", type=int, help="PLC DB (1=intake, 2=outloading, 3=mineral).")
    ap.add_argument("--line", type=int, help="Line number (1/2/3).")
    ap.add_argument("--wait", action="store_true",
                    help="After writing, poll the queue and print status transitions.")
    ap.add_argument("--timeout", type=int, default=60,
                    help="Seconds to wait for a transition when --wait is set (default 60).")
    ap.add_argument("--verify-tag", action="store_true",
                    help="After writing, read L{line}_RFID_BadgeReading back over a few "
                         "seconds to check whether the PLC keeps the value or overwrites it.")
    ap.add_argument("--diagnose", action="store_true",
                    help="After writing, print a one-shot report of every condition that "
                         "gates auto-dispatch (status word, scanned RFID, queue rows) and a verdict.")
    args = ap.parse_args()

    db_no, line = _resolve_target(args)
    rfid = str(args.rfid).strip()
    tag = f"L{line}_RFID_BadgeReading"

    with app.app_context():
        if DEMO_MODE or not _snap7_loaded:
            print("ERROR: snap7 missing or DEMO_MODE=true — cannot write to PLC.")
            sys.exit(1)

        # Snapshot the matching queue rows BEFORE we write, so we can detect change.
        order_type = _ORDER_TYPE.get(db_no, "")
        before = {}
        if order_type:
            before = {r.id: r.queue_status for r in _matching_rows(order_type, line, rfid)}
            print(f"Queue rows before scan ({order_type} line {line}, RFID {rfid}):")
            _print_rows(_matching_rows(order_type, line, rfid))

        try:
            m = load_map_from_pg(db_no)
            written = _write_tags(db_no, m, {tag: float(rfid)})
        except Exception as e:
            print(f"ERROR: failed writing {tag} to DB{db_no}: {e}")
            sys.exit(1)

        print(f"\nWrote {tag}={rfid} to DB{db_no} (line {line}). Written: {written}")

        if args.verify_tag:
            want = _normalize_rfid(rfid)
            print(f"\nVerifying the PLC keeps {tag}={want} (reading back for ~10s)...")
            held = True
            for i in range(6):
                got = _read_scan_tag(db_no, m, line)
                ok = (got == want)
                held = held and ok
                print(f"  [{time.strftime('%H:%M:%S')}] read {tag} = {got!r} "
                      f"({'kept' if ok else 'OVERWRITTEN'})")
                if not ok:
                    break
                time.sleep(2)
            if held:
                print("→ Value persisted. The register is writable, so an auto-scan test "
                      "should work if the poll cycle reads it in time.")
            else:
                print("→ The PLC overwrote the reader register (as expected for a live "
                      "reader input). You can't fake a scan by writing here — use the "
                      "Start button or QUEUE_STRICT_RFID=0 to test the dispatch flow.")

        if args.diagnose and order_type:
            _diagnose(db_no, m, line, order_type, rfid)

        if not args.wait:
            print("Watch the Orders page / backend log: the matching WAITING order")
            print("should move WAITING -> DISPATCHED -> RUNNING within one poll cycle.")
            return

        if not order_type:
            print("--wait is only supported for RFID lines (intake/outloading/mineral).")
            return

        print(f"\nWaiting up to {args.timeout}s for a status transition "
              f"(needs the broadcast poller running)...")
        deadline = time.time() + args.timeout
        last_seen = dict(before)
        while time.time() < deadline:
            db.session.expire_all()  # force a fresh read from the DB each poll
            rows = _matching_rows(order_type, line, rfid)
            changed = False
            for r in rows:
                prev = last_seen.get(r.id)
                if prev != r.queue_status:
                    print(f"  [{time.strftime('%H:%M:%S')}] #{r.id}: "
                          f"{prev or 'NEW'} -> {r.queue_status}")
                    last_seen[r.id] = r.queue_status
                    changed = True
            if any(s in ("DISPATCHED", "RUNNING") for s in last_seen.values()):
                print("\n✅ Auto-start confirmed: the waiting order was dispatched.")
                return
            if changed:
                pass
            time.sleep(2)

        print("\n⏳ Timed out with no dispatch. Checklist:")
        print("   - Is the backend broadcast/poller Running?")
        print("   - Is there a WAITING order for this line with exactly this RFID?")
        print("   - Is the line Idle with no active (DISPATCHED/RUNNING) queue row?")
        print("   - Current rows:")
        _print_rows(_matching_rows(order_type, line, rfid))


if __name__ == "__main__":
    main()

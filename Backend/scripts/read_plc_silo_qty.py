#!/usr/bin/env python3
"""
Read silo quantities directly from PLC DB5 (QTY_BIN### tags).

Usage (from repo root):
  py -3 Backend/scripts/read_plc_silo_qty.py
  py -3 Backend/scripts/read_plc_silo_qty.py --probe
  py -3 Backend/scripts/read_plc_silo_qty.py --scan-dbs
  py -3 Backend/scripts/read_plc_silo_qty.py --silo 109
  py -3 Backend/scripts/read_plc_silo_qty.py --db 5 --nonzero

Requires: pip install python-snap7
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

_BACKEND = Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

try:
    import snap7
    from snap7.util import get_real
except ImportError:
    print("ERROR: python-snap7 not installed. Run: pip install python-snap7")
    sys.exit(1)

from routes.silo_qty_map import QTY_MAP_DB5, load_qty_map  # noqa: E402

DEFAULT_CONFIG_PATH = _BACKEND / "config.json"

# Sizes to probe when PLC rejects "Address out of range"
_PROBE_SIZES = [
    2, 16, 32, 48, 64, 80, 96, 128, 160, 192, 256, 384, 512,
    768, 1024, 1280, 1536, 1792, 2048, 2560, 3072, 3584, 4096,
]


def load_plc_settings(config_path: Path) -> Tuple[str, int, int]:
    ip = os.getenv("PLC_IP", "192.168.0.100")
    rack = int(os.getenv("PLC_RACK", "0"))
    slot = int(os.getenv("PLC_SLOT", "3"))
    if config_path.is_file():
        try:
            with open(config_path, encoding="utf-8") as f:
                cfg = json.load(f)
            plc = cfg.get("plc", {})
            ip = os.getenv("PLC_IP", str(plc.get("ip", ip)))
            rack = int(os.getenv("PLC_RACK", str(plc.get("rack", rack))))
            slot = int(os.getenv("PLC_SLOT", str(plc.get("slot", slot))))
        except Exception as e:
            print(f"WARN: could not read {config_path}: {e}")
    return ip, rack, slot


def _is_out_of_range(err: Exception) -> bool:
    return "out of range" in str(err).lower()


def probe_db_size(plc: snap7.client.Client, db_no: int, want: int) -> Tuple[Optional[bytearray], int]:
    """
    Read the largest possible chunk from DB start.
    Returns (buffer, bytes_read). buffer is None if even 2 bytes fail.
    """
    sizes: List[int] = []
    if want not in _PROBE_SIZES:
        sizes.append(want)
    for s in _PROBE_SIZES:
        if s <= want and s not in sizes:
            sizes.append(s)
    sizes.sort()

    best_buf: Optional[bytearray] = None
    best_len = 0

    for size in sizes:
        try:
            data = plc.db_read(db_no, 0, size)
            best_buf = bytearray(data)
            best_len = size
        except Exception as e:
            if _is_out_of_range(e):
                continue
            raise

    return best_buf, best_len


def decode_qty(buf: bytearray, qty_map: Dict[int, Tuple[int, str]]) -> Dict[int, float]:
    out: Dict[int, float] = {}
    length = len(buf)
    for silo_no, (offset, typ) in sorted(qty_map.items()):
        if typ.upper() != "REAL" or offset + 4 > length:
            continue
        try:
            out[silo_no] = round(get_real(buf, offset), 3)
        except Exception:
            pass
    return out


def silos_out_of_range(qty_map: Dict[int, Tuple[int, str]], buf_len: int) -> List[int]:
    return sorted(
        s for s, (off, typ) in qty_map.items()
        if typ.upper() == "REAL" and off + 4 > buf_len
    )


def plc_address(db_no: int, offset: int) -> str:
    return f"DB{db_no}.DBD{offset}"


def scan_databases(plc: snap7.client.Client, db_min: int, db_max: int) -> None:
    print(f"\n{'DB':>4}  {'Readable':>10}  {'Notes'}")
    print("-" * 50)
    for db_no in range(db_min, db_max + 1):
        try:
            buf, size = probe_db_size(plc, db_no, 512)
            if buf is None or size == 0:
                print(f"{db_no:>4}  {'no':>10}  (not accessible)")
                continue
            # Quick sanity: count non-zero reals in first min(size, 500) bytes
            nonzero = 0
            for off in range(0, min(size, 500) - 3, 4):
                try:
                    if abs(get_real(buf, off)) > 0.001:
                        nonzero += 1
                except Exception:
                    pass
            note = f"{size} bytes readable"
            if nonzero:
                note += f", ~{nonzero} non-zero REALs in scanned range"
            print(f"{db_no:>4}  {'yes':>10}  {note}")
        except Exception as e:
            print(f"{db_no:>4}  {'error':>10}  {e}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Read QTY_BIN silo quantities live from Siemens PLC."
    )
    parser.add_argument("--ip", help="PLC IP (default: config.json or 192.168.0.100)")
    parser.add_argument("--rack", type=int, help="PLC rack (default: 0)")
    parser.add_argument("--slot", type=int, help="PLC slot (default: 3)")
    parser.add_argument("--db", type=int, default=5, help="Data block number (default: 5)")
    parser.add_argument("--silo", type=int, action="append", help="Only show this silo (repeatable)")
    parser.add_argument("--nonzero", action="store_true", help="Only show silos with qty != 0")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of table")
    parser.add_argument("--probe", action="store_true", help="Only probe DB size, do not print all silos")
    parser.add_argument("--scan-dbs", action="store_true", help="Scan DB numbers for readable blocks")
    parser.add_argument("--scan-min", type=int, default=1, help="First DB to scan (default: 1)")
    parser.add_argument("--scan-max", type=int, default=20, help="Last DB to scan (default: 20)")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Path to config.json")
    args = parser.parse_args()

    ip, rack, slot = load_plc_settings(args.config)
    if args.ip:
        ip = args.ip
    if args.rack is not None:
        rack = args.rack
    if args.slot is not None:
        slot = args.slot

    m = load_qty_map(args.db)
    qty_map: Dict[int, Tuple[int, str]] = m["qty_map"]
    want_size = max(32, int(m.get("max_byte", 492)) + 8)
    filter_silos = set(args.silo) if args.silo else None

    plc = snap7.client.Client()
    print(f"Connecting to PLC {ip} rack={rack} slot={slot} ...")
    try:
        plc.connect(ip, rack, slot)
        if not plc.get_connected():
            print("ERROR: Failed to connect to PLC")
            return 1

        if args.scan_dbs:
            scan_databases(plc, args.scan_min, args.scan_max)
            return 0

        print(f"Probing DB{args.db} (need up to {want_size} bytes for full QTY_BIN map) ...")
        buf, actual_size = probe_db_size(plc, args.db, want_size)

        if buf is None or actual_size == 0:
            print(f"ERROR: DB{args.db} is not readable (even 2 bytes failed).")
            print("  - Confirm DB number in TIA Portal (QTY_BIN struct may not be DB5).")
            print("  - Try: py -3 Backend/scripts/read_plc_silo_qty.py --scan-dbs")
            return 1

        missing = silos_out_of_range(qty_map, len(buf))
        print(f"OK: read {actual_size} bytes from DB{args.db}")

        if args.probe:
            print(f"  Required for all 123 silos: {want_size} bytes (last tag QTY_BIN930 @ offset 488)")
            if missing:
                print(f"  WARNING: {len(missing)} silos out of range with current DB size:")
                print(f"    first missing: Silo {missing[0]} @ offset {qty_map[missing[0]][0]}")
                print(f"    last missing:  Silo {missing[-1]} @ offset {qty_map[missing[-1]][0]}")
            else:
                print("  All mapped silos fit in this DB size.")
            return 0

        if not qty_map:
            print(f"ERROR: No quantity map defined for DB{args.db}")
            return 1

        values = decode_qty(buf, qty_map)

        rows = []
        for silo_no in sorted(values.keys()):
            if filter_silos and silo_no not in filter_silos:
                continue
            qty = values[silo_no]
            if args.nonzero and qty == 0:
                continue
            offset, _ = qty_map[silo_no]
            rows.append({
                "silo_no": silo_no,
                "tag": f"QTY_BIN{silo_no}",
                "offset": offset,
                "address": plc_address(args.db, offset),
                "quantity_kg": qty,
            })

        if args.json:
            print(json.dumps({
                "plc": {"ip": ip, "rack": rack, "slot": slot, "db": args.db},
                "read_bytes": actual_size,
                "required_bytes": want_size,
                "missing_silos": missing,
                "count": len(rows),
                "silos": rows,
            }, indent=2))
        else:
            if missing:
                print(f"WARNING: DB{args.db} only {actual_size} bytes — "
                      f"{len(missing)} silos beyond range (need {want_size} bytes total).")
                print("  Try --probe or confirm correct DB in TIA Portal.\n")

            print(f"{'Silo':>6}  {'Tag':<12}  {'Offset':>6}  {'PLC Address':<14}  {'Qty (KG)':>12}")
            print("-" * 58)
            for r in rows:
                print(
                    f"{r['silo_no']:>6}  {r['tag']:<12}  {r['offset']:>6}  "
                    f"{r['address']:<14}  {r['quantity_kg']:>12.3f}"
                )
            print("-" * 58)
            print(f"Silos decoded: {len(rows)} / {len(qty_map)} mapped")
            print(f"Non-zero quantities: {sum(1 for r in rows if r['quantity_kg'] != 0)}")
            if missing:
                print(f"Out of range (not read): {len(missing)} silos")

        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        if _is_out_of_range(e):
            print("  DB exists but requested size too large. Re-run with --probe")
        return 1
    finally:
        try:
            if plc.get_connected():
                plc.disconnect()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())

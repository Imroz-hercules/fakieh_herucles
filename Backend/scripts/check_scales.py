#!/usr/bin/env python3
"""
Read live weight from Baykon BX23 weighbridge scales.

Primary method (works out of the box): HTTP status.cgi — same feed as the web UI.
  GET http://<ip>/status.cgi  Basic auth admin:(empty password)
  XML field <lowerrow> holds the weight; <kgunit>/<unstablesign>/<grosssign> etc.

Optional fallback: Modbus TCP port 502 (only if Ethernet Data Format is set to
Modbus TCP 4/5 on the indicator keypad).

Usage:
  py -3 Backend/scripts/check_scales.py
  py -3 Backend/scripts/check_scales.py --once
  py -3 Backend/scripts/check_scales.py --scale 1
  py -3 Backend/scripts/check_scales.py --method modbus --once --verbose
"""
from __future__ import annotations

import argparse
import base64
import re
import struct
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from typing import Optional

SCALES = [
    {
        "name": "Scale 1",
        "ip": "192.168.1.200",
        "mac": "44-6F-D8-20-13-85",
    },
    {
        "name": "Scale 2",
        "ip": "192.168.1.220",
        "mac": "44:6F:D8:20:34:D1",
    },
]

DEFAULT_PORT = 502
HTTP_USER = "admin"
HTTP_PASS = ""  # Baykon Embedded WEB Server default

# Baykon Modbus protocol addresses (40001-based → subtract 40001)
BAYKON_REGS = [
    (0, 2, "display"),
    (5, 2, "gross"),
    (3, 2, "tare"),
]

_TX_ID = 0
NBSP_RE = re.compile(r"(?:&#160;|&nbsp;|\xa0|\s)+")
NUM_RE = re.compile(r"([+-]?\d+(?:[.,]\d+)?)")


def normalize_mac(mac: str) -> str:
    return mac.replace("-", ":").upper()


def ping(ip: str, timeout_ms: int = 1000) -> bool:
    try:
        r = subprocess.run(
            ["ping", "-n", "1", "-w", str(timeout_ms), ip],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return r.returncode == 0
    except Exception:
        return False


def tcp_open(ip: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True
    except OSError:
        return False


# ---------- HTTP / status.cgi (web UI feed) ----------

def http_status(ip: str, timeout: float = 5.0) -> tuple[Optional[dict], str]:
    """
    Poll the same endpoint the Remote Access web UI uses.
    Returns (fields_dict, detail).
    """
    url = f"http://{ip}/status.cgi"
    token = base64.b64encode(f"{HTTP_USER}:{HTTP_PASS}".encode()).decode()
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, f"HTTP error: {e}"

    try:
        text = raw.decode("utf-8", "replace")
        root = ET.fromstring(text)
    except ET.ParseError as e:
        return None, f"bad XML: {e} raw={raw[:120]!r}"

    fields = {child.tag: (child.text or "") for child in root}
    return fields, "ok"


def parse_web_weight(fields: dict) -> tuple[Optional[float], str]:
    lower = NBSP_RE.sub(" ", fields.get("lowerrow", "")).strip()
    m = NUM_RE.search(lower.replace(",", "."))
    if not m:
        return None, f"no number in lowerrow={lower!r}"
    weight = float(m.group(1))
    unit = (fields.get("kgunit") or fields.get("lbunit") or "").strip() or "kg"
    stable = fields.get("unstablesign", "1") != "1"
    mode = "NET" if fields.get("netsign") == "1" else "GROSS"
    detail = f"web status.cgi value={lower!r} unit={unit} mode={mode} stable={stable}"
    return weight, detail


def read_http(ip: str) -> tuple[Optional[float], str]:
    fields, detail = http_status(ip)
    if fields is None:
        return None, detail
    return parse_web_weight(fields)


# ---------- Modbus TCP (optional) ----------

def _next_tx_id() -> int:
    global _TX_ID
    _TX_ID = (_TX_ID + 1) & 0xFFFF
    return _TX_ID


def _recv_exact(sock: socket.socket, n: int) -> Optional[bytes]:
    buf = b""
    while len(buf) < n:
        try:
            chunk = sock.recv(n - len(buf))
        except socket.timeout:
            return None
        if not chunk:
            return None
        buf += chunk
    return buf


def modbus_read(
    ip: str,
    port: int,
    unit_id: int,
    function: int,
    address: int,
    count: int,
    timeout: float = 2.0,
) -> tuple[Optional[list[int]], str]:
    tx = _next_tx_id()
    pdu = struct.pack(">BHH", function, address, count)
    packet = struct.pack(">HHHB", tx, 0, 1 + len(pdu), unit_id) + pdu
    try:
        with socket.create_connection((ip, port), timeout=timeout) as sock:
            sock.settimeout(timeout)
            sock.sendall(packet)
            hdr = _recv_exact(sock, 7)
            if hdr is None:
                return None, "NO_REPLY"
            _tx, proto, resp_len, _unit = struct.unpack(">HHHB", hdr)
            body = _recv_exact(sock, resp_len - 1)
            if body is None:
                return None, "timeout PDU"
    except OSError as e:
        return None, f"connect error: {e}"

    if proto != 0 or not body:
        return None, "bad response"
    if body[0] & 0x80:
        return None, f"exception code={body[1] if len(body) > 1 else -1}"
    byte_count = body[1]
    data = body[2 : 2 + byte_count]
    regs = list(struct.unpack(">" + "H" * (byte_count // 2), data))
    return regs, "ok"


def baykon_int32(regs: list[int], order: str = "abcd") -> Optional[float]:
    if len(regs) < 2:
        return None
    a, b = regs[0], regs[1]
    if order == "cdab":
        a, b = b, a
    raw = (a << 16) | b
    return float(struct.unpack(">i", struct.pack(">I", raw & 0xFFFFFFFF))[0])


def read_modbus(
    ip: str,
    port: int,
    unit_id: int,
    register: Optional[int],
    verbose: bool,
) -> tuple[Optional[float], str]:
    targets = [(register, 2, "custom")] if register is not None else list(BAYKON_REGS)
    for addr, cnt, label in targets:
        regs, detail = modbus_read(ip, port, unit_id, 3, addr, cnt)
        if verbose:
            print(f"    fc=3 unit={unit_id} addr={addr} ({label}): {detail} {regs}")
        if regs is None:
            continue
        for order in ("abcd", "cdab"):
            w = baykon_int32(regs, order)
            if w is not None and -500 <= w <= 120_000:
                return w, f"modbus addr={addr} ({label}) order={order} regs={regs}"
    return None, "modbus: no reply or no plausible value (enable Modbus TCP on indicator)"


# ---------- main loop ----------

def check_one(
    scale: dict,
    method: str,
    port: int,
    once: bool,
    unit_id: int,
    register: Optional[int],
    verbose: bool,
) -> None:
    name, ip, mac = scale["name"], scale["ip"], normalize_mac(scale["mac"])
    print("=" * 60)
    print(f"{name}  ip={ip}  mac={mac}")

    alive = ping(ip)
    print(f"  ping: {'OK' if alive else 'FAIL'}")
    if not alive:
        print("  -> not reachable on LAN")
        return

    def one_read() -> None:
        if method in ("http", "auto"):
            w, detail = read_http(ip)
            if w is not None:
                print(f"  weight: {w:.2f} kg | {detail}")
                return
            if method == "http":
                print(f"  weight: UNKNOWN | {detail}")
                return
            if verbose:
                print(f"  http failed: {detail}; trying modbus...")

        if method in ("modbus", "auto"):
            if not tcp_open(ip, port):
                print(f"  weight: UNKNOWN | port {port} CLOSED")
                return
            w, detail = read_modbus(ip, port, unit_id, register, verbose)
            if w is None:
                print(f"  weight: UNKNOWN | {detail}")
            else:
                print(f"  weight: {w:.2f} kg | {detail}")

    print(f"  reading via {method} ...")
    one_read()
    if once:
        return

    print("  polling every 1s (Ctrl+C to stop)")
    try:
        while True:
            time.sleep(1)
            one_read()
    except KeyboardInterrupt:
        print("\n  stopped")


def main() -> int:
    ap = argparse.ArgumentParser(description="Read Baykon BX23 scale weight")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--scale", choices=["1", "2", "both"], default="both")
    ap.add_argument(
        "--method",
        choices=["http", "modbus", "auto"],
        default="http",
        help="http=status.cgi (default, same as web UI); modbus=port 502; auto=http then modbus",
    )
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--unit-id", type=int, default=1)
    ap.add_argument("--register", type=int, default=None)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    selected = SCALES
    if args.scale == "1":
        selected = [SCALES[0]]
    elif args.scale == "2":
        selected = [SCALES[1]]

    for s in selected:
        check_one(
            s,
            args.method,
            args.port,
            args.once,
            args.unit_id,
            args.register,
            args.verbose,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

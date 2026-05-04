# pip install python-snap7
import snap7
import struct

IP = "192.168.0.100"
RACK = 0
SLOT = 3
DB_NUMBER = 4  # you said DB4

# ---- helpers ---------------------------------------------------------------

def read_int(plc, db, start):
    # S7 uses big-endian for word/dword values
    data = plc.db_read(db, start, 2)
    return struct.unpack(">h", data)[0]

def read_real(plc, db, start):
    data = plc.db_read(db, start, 4)
    return struct.unpack(">f", data)[0]

def read_string16(plc, db, start):
    """
    S7 string layout: [max_len][curr_len][bytes...]
    For STRING[16], read 18 bytes (2 header + 16 data).
    """
    buf = bytearray(plc.db_read(db, start, 18))
    max_len = buf[0]
    curr_len = buf[1]
    curr_len = min(curr_len, max_len, 16)  # safety
    return bytes(buf[2:2+curr_len]).decode("ascii", errors="ignore")

def read_tag(plc, tag):
    t = tag["type"]
    a = tag["addr"]
    if t == "INT":
        return read_int(plc, DB_NUMBER, a)
    if t == "REAL":
        return read_real(plc, DB_NUMBER, a)
    if t == "STRING[16]":
        return read_string16(plc, DB_NUMBER, a)
    raise ValueError(f"Unsupported type: {t}")

# ---- hardcoded tag map (your list) ----------------------------------------

TAGS = [
    {"name": "ActiveBulk_Source_Silo",   "addr": 44, "type": "INT"},
    {"name": "ActiveBulk_DEST_1",        "addr": 46, "type": "INT"},
    {"name": "ActiveBulk_DEST_2",        "addr": 48, "type": "INT"},
    {"name": "ActiveBulk_CC25_Sel",      "addr": 50, "type": "INT"},
    {"name": "ActiveBulk_weightQuant",   "addr": 52, "type": "REAL"},
    {"name": "ActiveBulk_ScaleSelect",   "addr": 56, "type": "INT"},
    {"name": "ActivePit_Pit_Number",     "addr": 58, "type": "INT"},
    {"name": "ActivePit_RawMaterialCod", "addr": 60, "type": "STRING[16]"},
    {"name": "ActivePit_DEST_1",         "addr": 78, "type": "INT"},
    {"name": "ActivePit_DEST_2",         "addr": 80, "type": "INT"},
    {"name": "ActivePit_Weight_Quant",   "addr": 82, "type": "REAL"},
    {"name": "ActivePit_Scale_Select",   "addr": 86, "type": "INT"},
    {"name": "BulkLine_Status",          "addr": 88, "type": "INT"},
    {"name": "PitLine_Status",           "addr": 90, "type": "INT"},
]

# ---- main -----------------------------------------------------------------

def main():
    plc = snap7.client.Client()
    plc.connect(IP, RACK, SLOT)
    try:
        if not plc.get_connected():
            raise RuntimeError("Failed to connect to PLC")

        results = {}
        for tag in TAGS:
            try:
                results[tag["name"]] = read_tag(plc, tag)
            except Exception as e:
                results[tag["name"]] = f"ERROR: {e}"

        # print nicely
        for k, v in results.items():
            print(f"{k}: {v}")

    finally:
        try:
            plc.disconnect()
        except Exception:
            pass

if __name__ == "__main__":
    main()

# read_all_autodetect.py
import snap7, struct, json, re

IP, RACK, SLOT = "192.168.0.100", 0, 3
DB_MATERIALS_BOOL_ETC = 3  # materials, HL/LOCK, RFID/Badge/Destination/Status live here per your tests
CANDIDATE_ACTIVE_BLOCK_DBS = [3, 4]  # try DB3 then DB4; add more if needed

# ------------- low-level readers (S7 big-endian) -------------
def _i16_be(b: bytes) -> int: return struct.unpack(">h", b)[0]
def _f32_be(b: bytes) -> float: return struct.unpack(">f", b)[0]

def read_int(plc, db, start):  return _i16_be(plc.db_read(db, int(start), 2))
def read_real(plc, db, start): return _f32_be(plc.db_read(db, int(start), 4))
def read_bool(plc, db, byte_idx, bit_idx):
    b = plc.db_read(db, byte_idx, 1)
    return bool(b[0] & (1 << bit_idx))

def read_string(plc, db, start, max_len):
    buf = bytearray(plc.db_read(db, int(start), 2 + max_len))
    if not buf: return ""
    mlen = buf[0] or max_len
    clen = min(buf[1], mlen, max_len)
    return bytes(buf[2:2+clen]).decode("ascii", errors="ignore")

def parse_bool_addr(a):
    if isinstance(a, str):
        byte, bit = a.split("."); return int(byte), int(bit)
    byte = int(a); bit = int(round((a - byte)*10)); return byte, bit

# ------------- tag groups -------------
ACTIVE_TAGS = [
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

FIXED_DB3_TAGS = [
    # Materials S401..S408
    {"name": "MatCode_S401", "addr": 28,  "type": "STRING[16]"},
    {"name": "MatName_S401", "addr": 46,  "type": "STRING[32]"},
    {"name": "MatCode_S402", "addr": 80,  "type": "STRING[16]"},
    {"name": "MatName_S402", "addr": 98,  "type": "STRING[32]"},
    {"name": "MatCode_S403", "addr": 132, "type": "STRING[16]"},
    {"name": "MatName_S403", "addr": 150, "type": "STRING[32]"},
    {"name": "MatCode_S404", "addr": 184, "type": "STRING[16]"},
    {"name": "MatName_S404", "addr": 202, "type": "STRING[32]"},
    {"name": "MatCode_S405", "addr": 236, "type": "STRING[16]"},
    {"name": "MatName_S405", "addr": 254, "type": "STRING[32]"},
    {"name": "MatCode_S406", "addr": 288, "type": "STRING[16]"},
    {"name": "MatName_S406", "addr": 306, "type": "STRING[32]"},
    {"name": "MatCode_S407", "addr": 340, "type": "STRING[16]"},
    {"name": "MatName_S407", "addr": 358, "type": "STRING[32]"},
    {"name": "MatCode_S408", "addr": 392, "type": "STRING[16]"},
    {"name": "MatName_S408", "addr": 410, "type": "STRING[32]"},
    # HL/LOCK BOOLs
    {"name": "HL_S401",   "addr": "444.0", "type": "BOOL"},
    {"name": "LOCK_S401", "addr": "444.1", "type": "BOOL"},
    {"name": "HL_S402",   "addr": "444.2", "type": "BOOL"},
    {"name": "LOCK_S402", "addr": "444.3", "type": "BOOL"},
    {"name": "HL_S403",   "addr": "444.4", "type": "BOOL"},
    {"name": "LOCK_S403", "addr": "444.5", "type": "BOOL"},
    {"name": "HL_S404",   "addr": "444.6", "type": "BOOL"},
    {"name": "LOCK_S404", "addr": "444.7", "type": "BOOL"},
    {"name": "HL_S405",   "addr": "445.0", "type": "BOOL"},
    {"name": "LOCK_S405", "addr": "445.1", "type": "BOOL"},
    {"name": "HL_S406",   "addr": "445.2", "type": "BOOL"},
    {"name": "LOCK_S406", "addr": "445.3", "type": "BOOL"},
    {"name": "HL_S407",   "addr": "445.4", "type": "BOOL"},
    {"name": "LOCK_S407", "addr": "445.5", "type": "BOOL"},
    {"name": "HL_S408",   "addr": "445.6", "type": "BOOL"},
    {"name": "LOCK_S408", "addr": "445.7", "type": "BOOL"},
    # RFID / Badge / Destination / Status
    {"name": "RFID_BadgeReading", "addr": 446, "type": "REAL"},
    {"name": "ActiveBadge",       "addr": 450, "type": "INT"},
    {"name": "ActiveDestination", "addr": 452, "type": "INT"},
    {"name": "StatusWord",        "addr": 454, "type": "INT"},
]

# ------------- plausibility checks for Active* block -------------
def expect_int(val, lo, hi):   return isinstance(val, int) and lo <= val <= hi
def expect_set(val, s):        return val in s
def expect_real(val, lo, hi):  return isinstance(val, float) and lo <= val <= hi
def non_empty_str(s):          return isinstance(s, str) and (len(s) == 0 or all(32<=ord(c)<127 for c in s))

def score_active_block(plc, db):
    """Read Active* tags from 'db' and score how plausible the values are."""
    score, data, notes = 0, {}, []

    def read_one(tag):
        t,a = tag["type"].upper(), tag["addr"]
        if t=="INT":   return read_int(plc, db, a)
        if t=="REAL":  return read_real(plc, db, a)
        if t=="BOOL":
            byte, bit = parse_bool_addr(a); return read_bool(plc, db, byte, bit)
        if t.startswith("STRING["):
            n = int(re.search(r"\[(\d+)\]", t).group(1)); return read_string(plc, db, a, n)
        raise ValueError(t)

    # Read and evaluate
    for tag in ACTIVE_TAGS:
        try:
            v = read_one(tag)
            data[tag["name"]] = v
        except Exception as e:
            notes.append(f"ERROR reading {tag['name']} in DB{db}: {e}")
            return -1, data, notes  # hard fail for this db

    # Scoring rules (from your comments/spec)
    if expect_int(data["ActiveBulk_Source_Silo"], 0, 9999): score += 1
    # Typical ranges from your notes: 101-115 or 201-203
    if (expect_int(data["ActiveBulk_Source_Silo"],101,115) or
        expect_int(data["ActiveBulk_Source_Silo"],201,203)): score += 2

    # Dest 1/2: 301-322 except 313
    def dest_ok(v):
        return expect_int(v,301,322) and v != 313
    if dest_ok(data["ActiveBulk_DEST_1"]): score += 2
    if dest_ok(data["ActiveBulk_DEST_2"]): score += 2

    # CC25_Sel: 1 or 2
    if expect_set(data["ActiveBulk_CC25_Sel"], {1,2}): score += 2

    # Weight quant: non-crazy REAL
    if expect_real(data["ActiveBulk_weightQuant"], -1e6, 1e6): score += 1

    # ScaleSelect: 1 or 2
    if expect_set(data["ActiveBulk_ScaleSelect"], {1,2}): score += 2

    # Pit_Number: 1 or 2
    if expect_set(data["ActivePit_Pit_Number"], {1,2}): score += 2

    # RawMaterialCod: reasonable ASCII (may be empty)
    if non_empty_str(data["ActivePit_RawMaterialCod"]): score += 1

    # Pit Dest 1/2
    if dest_ok(data["ActivePit_DEST_1"]): score += 2
    if dest_ok(data["ActivePit_DEST_2"]): score += 2

    # Pit weight quant
    if expect_real(data["ActivePit_Weight_Quant"], -1e6, 1e6): score += 1

    # Pit scale select
    if expect_set(data["ActivePit_Scale_Select"], {1,2}): score += 2

    # Status words: 1/2/6/8
    if expect_set(data["BulkLine_Status"], {1,2,6,8}): score += 2
    if expect_set(data["PitLine_Status"], {1,2,6,8}): score += 2

    return score, data, notes

def main():
    plc = snap7.client.Client()
    plc.connect(IP, RACK, SLOT)

    try:
        # 1) Autodetect the best DB for the Active* block
        candidates = []
        for db in CANDIDATE_ACTIVE_BLOCK_DBS:
            score, data, notes = score_active_block(plc, db)
            candidates.append((db, score, data, notes))
        # Pick the highest score
        best_db, best_score, best_data, best_notes = max(candidates, key=lambda x: x[1])

        # 2) Read fixed DB3 tags
        fixed = {}
        for t in FIXED_DB3_TAGS:
            ty, a = t["type"].upper(), t["addr"]
            try:
                if ty=="INT":   fixed[t["name"]] = read_int(plc, DB_MATERIALS_BOOL_ETC, a)
                elif ty=="REAL": fixed[t["name"]] = read_real(plc, DB_MATERIALS_BOOL_ETC, a)
                elif ty=="BOOL":
                    byte, bit = parse_bool_addr(a)
                    fixed[t["name"]] = read_bool(plc, DB_MATERIALS_BOOL_ETC, byte, bit)
                elif ty.startswith("STRING["):
                    n = int(re.search(r"\[(\d+)\]", ty).group(1))
                    fixed[t["name"]] = read_string(plc, DB_MATERIALS_BOOL_ETC, a, n)
                else:
                    fixed[t["name"]] = f"ERROR: unsupported type {ty}"
            except Exception as e:
                fixed[t["name"]] = f"ERROR: {e}"

        # 3) Merge results
        out = {}
        out.update(best_data)   # Active* from best_db
        out.update(fixed)       # Others from DB3

        # 4) Emit JSON with a small debug block
        print(json.dumps({
            "active_block_db_selected": best_db,
            "active_block_score": best_score,
            "values": out,
            "debug": {
                "candidates": [{ "db": db, "score": sc, "notes": nts } for db, sc, _, nts in candidates],
                "hint": "If best_db != 3, your Active* offsets are not in DB3. Update your map or move these tags to that DB."
            }
        }, indent=2, ensure_ascii=False))

    finally:
        try: plc.disconnect()
        except Exception: pass

if __name__ == "__main__":
    main()

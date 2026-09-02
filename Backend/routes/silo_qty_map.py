# routes/silo_qty_map.py
"""DB5 quantity offsets from docs/silo_bin_tags.md (123 QTY_BIN tags, bytes 0–488)."""
from typing import Dict, Tuple, Any

# silo_no -> (byte_offset, type)
QTY_MAP_DB5: Dict[int, Tuple[int, str]] = {
    101: (0, "REAL"), 102: (4, "REAL"), 103: (8, "REAL"), 104: (12, "REAL"),
    105: (16, "REAL"), 106: (20, "REAL"), 107: (24, "REAL"), 108: (28, "REAL"),
    109: (32, "REAL"), 110: (36, "REAL"), 111: (40, "REAL"), 112: (44, "REAL"),
    113: (48, "REAL"), 114: (52, "REAL"), 115: (56, "REAL"),
    201: (60, "REAL"), 202: (64, "REAL"), 203: (68, "REAL"),
    301: (72, "REAL"), 302: (76, "REAL"), 303: (80, "REAL"), 304: (84, "REAL"),
    305: (88, "REAL"), 306: (92, "REAL"), 307: (96, "REAL"), 308: (100, "REAL"),
    309: (104, "REAL"), 310: (108, "REAL"), 311: (112, "REAL"), 312: (116, "REAL"),
    313: (120, "REAL"), 314: (124, "REAL"), 315: (128, "REAL"), 316: (132, "REAL"),
    317: (136, "REAL"), 318: (140, "REAL"), 319: (144, "REAL"), 320: (148, "REAL"),
    321: (152, "REAL"), 322: (156, "REAL"),
}

# BIN9xx: 901–930 @ 160–276
for _s in range(901, 931):
    QTY_MAP_DB5[_s] = (160 + (_s - 901) * 4, "REAL")

# BIN6xx: 601–605 @ 280–296
for _s in range(601, 606):
    QTY_MAP_DB5[_s] = (280 + (_s - 601) * 4, "REAL")

# BIN8xx: 801–848 @ 300–488
for _s in range(801, 849):
    QTY_MAP_DB5[_s] = (300 + (_s - 801) * 4, "REAL")


def load_qty_map(db_no: int = 5) -> Dict[str, Any]:
    if db_no != 5:
        return {"qty_map": {}, "max_byte": 0}
    max_off = max(off for off, _ in QTY_MAP_DB5.values())
    return {"qty_map": QTY_MAP_DB5, "max_byte": max_off + 4}

"""Deterministic dosing-accuracy analytics.

These are computed in plain Python from the batch history so the numbers are
exact and cheap. The AI layer *narrates* these facts (executive summary,
answers) but never invents them — which keeps the demo trustworthy.
"""

from __future__ import annotations

from collections import defaultdict
from statistics import mean

from . import data


def _agg(rows: list[dict]) -> dict:
    """Common accuracy stats for a group of scored rows."""
    devs = [r["deviation_pct"] for r in rows]
    abs_devs = [abs(d) for d in devs]
    total_sp = sum(r["setpoint"] for r in rows)
    total_act = sum(r["actual"] for r in rows)
    return {
        "count": len(rows),
        "mean_dev_pct": round(mean(devs), 2) if devs else 0.0,
        "mean_abs_dev_pct": round(mean(abs_devs), 2) if abs_devs else 0.0,
        "over": sum(1 for r in rows if r["status"] == "over"),
        "under": sum(1 for r in rows if r["status"] == "under"),
        "on_target": sum(1 for r in rows if r["status"] == "on_target"),
        "total_setpoint_kg": round(total_sp, 1),
        "total_actual_kg": round(total_act, 1),
        "shortfall_kg": round(total_sp - total_act, 1),  # +ve = under-dosed overall
    }


def overall() -> dict:
    rows = data.scored_rows()
    if not rows:
        return {"count": 0}
    stats = _agg(rows)
    n = stats["count"]
    stats["on_target_pct"] = round(100.0 * stats["on_target"] / n, 1)
    stats["over_pct"] = round(100.0 * stats["over"] / n, 1)
    stats["under_pct"] = round(100.0 * stats["under"] / n, 1)
    stats["flagged"] = stats["over"] + stats["under"]
    # A single headline "accuracy score": how close, on average, to target.
    stats["accuracy_score"] = round(max(0.0, 100.0 - stats["mean_abs_dev_pct"]), 1)
    return stats


def material_accuracy(min_count: int = 1) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in data.scored_rows():
        groups[r["material_name"]].append(r)

    out = []
    for name, rows in groups.items():
        if len(rows) < min_count:
            continue
        stats = _agg(rows)
        stats["material_name"] = name
        stats["material_code"] = rows[0]["material_code"]
        out.append(stats)
    return out


def batch_accuracy() -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in data.scored_rows():
        groups[r["batch_guid"]].append(r)

    out = []
    for guid, rows in groups.items():
        stats = _agg(rows)
        stats["batch_guid"] = guid
        stats["batch_name"] = rows[0]["batch_name"]
        stats["product_name"] = rows[0]["product_name"]
        stats["date"] = rows[0]["date"]
        stats["accuracy_score"] = round(max(0.0, 100.0 - stats["mean_abs_dev_pct"]), 1)
        out.append(stats)
    return out


def product_summary() -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in data.scored_rows():
        groups[r["product_name"]].append(r)

    out = []
    for name, rows in groups.items():
        stats = _agg(rows)
        stats["product_name"] = name
        stats["accuracy_score"] = round(max(0.0, 100.0 - stats["mean_abs_dev_pct"]), 1)
        out.append(stats)
    return sorted(out, key=lambda p: p["accuracy_score"])


def top_overdosed(n: int = 5, min_count: int = 2) -> list[dict]:
    mats = material_accuracy(min_count=min_count)
    return sorted(mats, key=lambda m: m["mean_dev_pct"], reverse=True)[:n]


def top_underdosed(n: int = 5, min_count: int = 2) -> list[dict]:
    mats = material_accuracy(min_count=min_count)
    return sorted(mats, key=lambda m: m["mean_dev_pct"])[:n]


def worst_materials(n: int = 5, min_count: int = 2) -> list[dict]:
    mats = material_accuracy(min_count=min_count)
    return sorted(mats, key=lambda m: m["mean_abs_dev_pct"], reverse=True)[:n]


def worst_batches(n: int = 5) -> list[dict]:
    return sorted(batch_accuracy(), key=lambda b: b["accuracy_score"])[:n]


def best_batches(n: int = 5) -> list[dict]:
    return sorted(batch_accuracy(), key=lambda b: b["accuracy_score"], reverse=True)[:n]


def headline() -> dict:
    """Everything the AI Insights card + the /ask context are built from."""
    return {
        "meta": data.dataset_meta(),
        "overall": overall(),
        "worst_materials": worst_materials(),
        "top_overdosed": top_overdosed(),
        "top_underdosed": top_underdosed(),
        "worst_batches": worst_batches(),
        "product_summary": product_summary(),
    }

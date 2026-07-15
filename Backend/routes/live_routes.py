"""Live dosing-quality monitoring API.

Backs the automatic (non-manual) live monitor on the Hercules AI page:

  * GET  /api/ai/live/state    — the current stream snapshot the UI polls:
                                 scored batch feed, live KPIs, drift status,
                                 model version, and drift/retrain notifications.
  * POST /api/ai/live/control  — presenter controls: start | pause | reset | speed.

The engine runs a background ticker; these endpoints only read/steer it.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ai_assistant.live.engine import get_engine

live_bp = Blueprint("ai_live_bp", __name__, url_prefix="/api/ai/live")


@live_bp.route("/state", methods=["GET"])
def state():
    return jsonify(get_engine().snapshot())


@live_bp.route("/control", methods=["POST"])
def control():
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").strip().lower()
    eng = get_engine()
    if action == "start":
        eng.start()
    elif action == "pause":
        eng.pause()
    elif action == "reset":
        eng.reset()
    elif action == "speed":
        try:
            eng.set_speed(float(body.get("value")))
        except (TypeError, ValueError):
            return jsonify({"error": "speed requires a numeric 'value' (seconds/batch)."}), 400
    else:
        return jsonify({"error": f"unknown action '{action}'."}), 400
    return jsonify(eng.snapshot())

"""Hercules AI Assistant API.

Two AI use cases over the Fakieh batch-dosing data:
  * Generative  — GET /api/ai/insights, POST /api/ai/ask (chatbot)
  * Predictive  — GET /api/ai/ml/info, POST /api/ai/ml/predict, GET /api/ai/ml/top-risks

Plus GET /api/ai/health (provider + model status) and GET /api/ai/history.
"""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ai_assistant import brain, logstore, providers
from ai_assistant.ml import predictor, predictor_severity

ai_bp = Blueprint("ai_bp", __name__, url_prefix="/api/ai")


@ai_bp.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "status": "ok",
            "providers": providers.available_providers(),
            "any_provider_configured": providers.any_configured(),
            "ml_model_ready": predictor.is_ready(),
            "ml_severity_ready": predictor_severity.is_ready(),
        }
    )


# ---------------------------------------------------------------------------
# Use case 1 — generative (chatbot + AI insights)
# ---------------------------------------------------------------------------
@ai_bp.route("/insights", methods=["GET"])
def insights():
    try:
        return jsonify(brain.executive_summary())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/ask", methods=["POST"])
def ask():
    body = request.get_json(silent=True) or {}
    question = (body.get("question") or "").strip()
    if not question:
        return jsonify({"error": "Missing 'question'."}), 400
    try:
        result = brain.ask(question)
        logstore.log(question, result.get("answer", ""), result.get("provider"), result.get("cached", False))
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/history", methods=["GET"])
def history():
    limit = request.args.get("limit", default=15, type=int)
    return jsonify({"history": logstore.recent(limit)})


# ---------------------------------------------------------------------------
# Use case 2 — predictive ML (dosing risk)
# ---------------------------------------------------------------------------
@ai_bp.route("/ml/info", methods=["GET"])
def ml_info():
    if not predictor.is_ready():
        return jsonify({"ready": False, "error": "Model not trained. Run: python -m ai_assistant.ml.train"}), 503
    try:
        return jsonify(predictor.model_info())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/ml/predict", methods=["POST"])
def ml_predict():
    if not predictor.is_ready():
        return jsonify({"error": "Model not trained."}), 503
    body = request.get_json(silent=True) or {}
    material_code = body.get("material_code")
    product_name = body.get("product_name")
    setpoint = body.get("setpoint")
    if not material_code or not product_name or setpoint in (None, ""):
        return jsonify({"error": "Provide material_code, product_name and setpoint."}), 400
    try:
        result = predictor.predict(
            material_code=material_code,
            product_name=product_name,
            setpoint=float(setpoint),
            quantity=body.get("quantity"),
            category=body.get("category"),
        )
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/ml/top-risks", methods=["GET"])
def ml_top_risks():
    if not predictor.is_ready():
        return jsonify({"error": "Model not trained."}), 503
    limit = request.args.get("limit", default=8, type=int)
    try:
        return jsonify({"top_risks": predictor.top_risks(limit)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Use case 2b — Dosing Severity Triage (multi-class ML: on_target / watch /
# severe, rather than the binary risk model above)
# ---------------------------------------------------------------------------
@ai_bp.route("/ml/severity/info", methods=["GET"])
def ml_severity_info():
    if not predictor_severity.is_ready():
        return jsonify({"ready": False, "error": "Severity model not trained. Run: python -m ai_assistant.ml.train_severity"}), 503
    try:
        return jsonify(predictor_severity.model_info())
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@ai_bp.route("/ml/severity/predict", methods=["POST"])
def ml_severity_predict():
    if not predictor_severity.is_ready():
        return jsonify({"error": "Severity model not trained."}), 503
    body = request.get_json(silent=True) or {}
    material_code = body.get("material_code")
    product_name = body.get("product_name")
    setpoint = body.get("setpoint")
    if not material_code or not product_name or setpoint in (None, ""):
        return jsonify({"error": "Provide material_code, product_name and setpoint."}), 400
    try:
        result = predictor_severity.predict(
            material_code=material_code,
            product_name=product_name,
            setpoint=float(setpoint),
            quantity=body.get("quantity"),
            category=body.get("category"),
        )
        return jsonify(result)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

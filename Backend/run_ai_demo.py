"""Standalone runner for the Hercules AI Assistant demo.

The full Hercules backend (app.py) needs the plant's PostgreSQL and SQL Server
databases and the PLC, which aren't present on a laptop. This slim entrypoint
boots on the same port (5000) the frontend expects, serving:
  * the AI Assistant feature (ai_routes.py)
  * local, CSV-backed versions of the batch-reporting endpoints
    (local_batch_routes.py) so Batch Calendar / Raw Data / Historical
    Reports — pages that already exist in the app — work with real data
    too, without needing the live SQL Server.

    python run_ai_demo.py

Then run the frontend (npm run dev).
"""

from __future__ import annotations

import os

from flask import Flask
from flask_cors import CORS

from routes.ai_routes import ai_bp
from routes.live_routes import live_bp
from routes.local_batch_routes import local_batch_bp
from ai_assistant import providers
from ai_assistant.ml import predictor
from ai_assistant.live.engine import get_engine


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},  # demo: allow the Vite dev server on any LAN IP
        supports_credentials=True,
    )
    app.register_blueprint(ai_bp)
    app.register_blueprint(live_bp)
    app.register_blueprint(local_batch_bp)

    # Boot the live monitor so batches are already streaming when the page opens.
    get_engine()

    @app.route("/", methods=["GET"])
    def index():
        return {
            "service": "Hercules AI Assistant (demo runner)",
            "endpoints": [
                "/api/ai/health",
                "/api/ai/insights",
                "/api/ai/ask (POST)",
                "/api/ai/ml/info",
                "/api/ai/ml/predict (POST)",
                "/api/ai/ml/top-risks",
                "/api/ai/live/state (automatic live monitor)",
                "/api/ai/live/control (POST: start|pause|reset|speed)",
                "/api/kpi (Batch Raw Data / Historical Reports)",
                "/api/kpi/csv-format-report (Batch Raw Data)",
                "/api/filter-options",
                "/api/kpi_calendar (Batch Calendar)",
                "/api/kpi_calendar/details",
            ],
        }

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))

    print("=" * 60)
    print(" Hercules AI Assistant — demo runner")
    print("=" * 60)
    for p in providers.available_providers():
        state = "configured" if p["configured"] else "NO KEY"
        print(f"  provider {p['provider']:<7} ({p['model']}): {state}")
    if not providers.any_configured():
        print("  ! No AI key set — chatbot will use offline cached answers.")
        print("    Set GEMINI_API_KEY (free from aistudio.google.com) to go live.")
    print(f"  ML dosing-risk model: {'ready' if predictor.is_ready() else 'NOT TRAINED (run python -m ai_assistant.ml.train)'}")
    print(f"  Listening on http://localhost:{port}")
    print("=" * 60)

    app.run(host="0.0.0.0", port=port, debug=False)

"""Hercules AI Assistant — an AI layer over the Fakieh feed-mill batch data.

Provides:
  * data.py       — loads/normalizes the batch dosing history and computes deviations
  * insights.py   — deterministic dosing-accuracy analytics (facts the AI narrates)
  * providers.py  — provider-agnostic text generation (Gemini live, Claude-ready)
  * cached_answers.py — offline "hero" answers so a live demo never fails
  * logstore.py   — lightweight SQLite log of questions/answers

The Flask blueprint that exposes this to the frontend lives in
``routes/ai_routes.py`` and is registered in ``app.py``.
"""

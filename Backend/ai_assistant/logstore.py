"""Lightweight SQLite log of AI questions and answers.

Deliberately uses stdlib sqlite3 (no Postgres) so the AI feature has a real,
persistent 'DB' story that runs on any machine without the plant databases.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("AI_LOG_DB", os.path.join(_HERE, "data", "ai_queries.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_query_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    question  TEXT NOT NULL,
    answer    TEXT NOT NULL,
    provider  TEXT,
    cached    INTEGER NOT NULL DEFAULT 0
);
"""


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA)
    return conn


def log(question: str, answer: str, provider: str | None, cached: bool) -> None:
    try:
        with _connect() as conn:
            conn.execute(
                "INSERT INTO ai_query_log (ts, question, answer, provider, cached) VALUES (?, ?, ?, ?, ?)",
                (datetime.now(timezone.utc).isoformat(), question, answer, provider, 1 if cached else 0),
            )
    except Exception:
        # Logging must never break the response.
        pass


def recent(limit: int = 15) -> list[dict]:
    try:
        with _connect() as conn:
            cur = conn.execute(
                "SELECT ts, question, answer, provider, cached FROM ai_query_log ORDER BY id DESC LIMIT ?",
                (int(limit),),
            )
            return [
                {
                    "ts": row["ts"],
                    "question": row["question"],
                    "answer": row["answer"],
                    "provider": row["provider"],
                    "cached": bool(row["cached"]),
                }
                for row in cur.fetchall()
            ]
    except Exception:
        return []

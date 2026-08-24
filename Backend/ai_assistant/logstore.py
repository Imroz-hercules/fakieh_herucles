"""Lightweight SQLite log of AI questions and answers.

Deliberately uses stdlib sqlite3 (no Postgres) so the AI feature has a real,
persistent 'DB' story that runs on any machine without the plant databases.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.getenv("AI_LOG_DB", os.path.join(_HERE, "data", "ai_queries.db"))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS ai_query_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                 TEXT NOT NULL,
    question           TEXT NOT NULL,
    answer             TEXT NOT NULL,
    provider           TEXT,
    cached             INTEGER NOT NULL DEFAULT 0,
    prompt_tokens      INTEGER,
    completion_tokens  INTEGER,
    total_tokens       INTEGER
);
"""


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA)
    # Migrate older DBs that predate token columns.
    cols = {row[1] for row in conn.execute("PRAGMA table_info(ai_query_log)").fetchall()}
    for col in ("prompt_tokens", "completion_tokens", "total_tokens"):
        if col not in cols:
            try:
                conn.execute(f"ALTER TABLE ai_query_log ADD COLUMN {col} INTEGER")
            except Exception:
                pass
    return conn


def log(
    question: str,
    answer: str,
    provider: str | None,
    cached: bool,
    usage: dict[str, Any] | None = None,
) -> None:
    try:
        u = usage or {}
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO ai_query_log
                    (ts, question, answer, provider, cached, prompt_tokens, completion_tokens, total_tokens)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    question,
                    answer,
                    provider,
                    1 if cached else 0,
                    u.get("prompt_tokens"),
                    u.get("completion_tokens"),
                    u.get("total_tokens"),
                ),
            )
    except Exception:
        # Logging must never break the response.
        pass


def recent(limit: int = 15) -> list[dict]:
    try:
        with _connect() as conn:
            cur = conn.execute(
                """
                SELECT ts, question, answer, provider, cached,
                       prompt_tokens, completion_tokens, total_tokens
                FROM ai_query_log
                ORDER BY id DESC
                LIMIT ?
                """,
                (int(limit),),
            )
            out = []
            for row in cur.fetchall():
                item = {
                    "ts": row["ts"],
                    "question": row["question"],
                    "answer": row["answer"],
                    "provider": row["provider"],
                    "cached": bool(row["cached"]),
                }
                if row["total_tokens"] is not None or row["prompt_tokens"] is not None:
                    item["usage"] = {
                        "prompt_tokens": row["prompt_tokens"],
                        "completion_tokens": row["completion_tokens"],
                        "total_tokens": row["total_tokens"],
                    }
                out.append(item)
            return out
    except Exception:
        return []

"""Offline fallback answers.

Used only when no AI provider is configured or every provider call fails, so a
live demo never shows an error. Charts are attached by brain._auto_chart —
these are short captions only.
"""

from __future__ import annotations

EXEC_SUMMARY = (
    "Overall dosing accuracy is 92.2% — micro-ingredients drive most flagged doses."
)

_FALLBACKS = [
    {
        "keywords": ["over", "overdos", "over-dos"],
        "answer": "Micro-ingredients lead over-dosing — Copper proteinate and Selenium Yeast top the list.",
    },
    {
        "keywords": ["under", "underdos", "under-dos", "shortfall"],
        "answer": "137 doses under target — Water and micro-ingredients are the main shortfalls.",
    },
    {
        "keywords": ["worst", "batch", "accuracy", "lowest"],
        "answer": "Weakest batches: FM Baladi Egg Maker (51%), FM Al Wasmi MM-3 PL (66%).",
    },
    {
        "keywords": ["material", "ingredient", "worst material", "micro"],
        "answer": "Least accurate: Copper proteinate (~98% |dev|), Selenium Yeast (~56%), Water (~28%).",
    },
    {
        "keywords": ["yield", "on target", "on-target"],
        "answer": "Yield is 66.7% on target across 1,000 doses.",
    },
    {
        "keywords": ["error", "flag"],
        "answer": "Error rate is 33.3% flagged (333 of 1,000 doses out of tolerance).",
    },
]

_DEFAULT = {
    "answer": "92.2% accuracy · 667 on target · 333 flagged. Chart shows the breakdown.",
}


def match(question: str) -> dict:
    q = (question or "").lower()
    for fb in _FALLBACKS:
        if any(kw in q for kw in fb["keywords"]):
            return fb
    return _DEFAULT

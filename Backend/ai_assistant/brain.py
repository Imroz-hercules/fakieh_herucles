"""Ties data + insights + providers together into the two AI features:

  * executive_summary() — a plain-English briefing for the AI Insights card.
  * ask(question)       — answers a free-text question, grounded in the data,
                          with an optional chart spec the frontend can render.

The model is only ever asked to *narrate numbers we computed*, never to do the
arithmetic itself. If no provider is configured (or all fail), we fall back to
pre-written cached answers so the demo still works offline.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from functools import lru_cache

from . import cached_answers, data, insights, providers
from .ml import predictor, predictor_severity

SYSTEM_PROMPT = (
    "You are Hercules AI, the production analyst for the Fakieh poultry feed mill. "
    "You explain batch dosing accuracy (SetPoint vs Actual weight of each ingredient) "
    "to plant managers and engineers. "
    "Rules: (1) Use ONLY the numbers in the DATA provided — never invent figures. "
    "(2) Be concise and direct; lead with the answer. "
    "(3) Use kilograms (kg) and percentages, and name specific materials, products, or batches. "
    "(4) A positive deviation means over-dosing, negative means under-dosing. "
    "(5) No preamble like 'Based on the data'. Write for a busy operator. "
    "(6) Output ONLY the final answer prose — never include planning, notes to yourself, "
    "meta-commentary, JSON, or code blocks."
)

# How the model should hand back a chart when one helps the answer.
_CHART_INSTRUCTIONS = (
    "\n\nCHART: If the question asks to compare, rank, break down, or show top/worst items, you MUST "
    "append EXACTLY ONE fenced block as the very last thing in your reply (after the prose):\n"
    "```chart\n"
    '{"type": "bar", "title": "Over-dosing by ingredient", "labels": ["A", "B", "C"], "values": [12.1, 8.4, 5.2], "unit": "%"}\n'
    "```\n"
    "Use type 'bar' (or 'line' for trends), 3-8 labels, numeric values only. Omit the block only if a chart truly does not fit."
)

_CHART_RE = re.compile(r"```chart\s*(\{.*?\})\s*```", re.DOTALL)


def _context_json() -> str:
    """Compact, grounded snapshot of the dataset for the model.

    Slimmed to essential fields so a small model isn't overwhelmed or tempted
    to echo the raw structure.
    """
    ov = insights.overall()
    mats = sorted(insights.material_accuracy(min_count=1), key=lambda m: m["count"], reverse=True)
    ctx = {
        "overall": {
            "total_doses": ov["count"],
            "accuracy_pct": ov["accuracy_score"],
            "on_target": ov["on_target"],
            "over_dosed": ov["over"],
            "under_dosed": ov["under"],
            "flagged": ov["flagged"],
        },
        "products": [
            {"name": p["product_name"], "accuracy_pct": p["accuracy_score"], "doses": p["count"]}
            for p in insights.product_summary()
        ],
        "ingredients": [
            {
                "name": m["material_name"],
                "doses": m["count"],
                "avg_deviation_pct": m["mean_dev_pct"],
                "avg_abs_deviation_pct": m["mean_abs_dev_pct"],
                "over": m["over"],
                "under": m["under"],
            }
            for m in mats
        ],
        "worst_batches": [
            {"product": b["product_name"], "accuracy_pct": b["accuracy_score"], "doses": b["count"]}
            for b in insights.worst_batches(8)
        ],
    }
    return json.dumps(ctx, ensure_ascii=False)


def _auto_chart(question: str):
    """Attach a relevant precomputed chart based on the question's intent.

    Used when the model doesn't emit its own chart block, so common demo
    questions still get a visual — reliably and grounded in real numbers.
    """
    q = (question or "").lower()

    def spec(title, rows, key, unit="%"):
        rows = [r for r in rows if r.get(key) is not None][:6]
        if not rows:
            return None
        return {
            "type": "bar",
            "title": title,
            "labels": [r.get("material_name") or r.get("product_name") for r in rows],
            "values": [round(float(r[key]), 1) for r in rows],
            "unit": unit,
        }

    if "under" in q:
        return spec("Most under-dosed ingredients (avg deviation %)", insights.top_underdosed(6), "mean_dev_pct")
    if "over" in q:
        return spec("Most over-dosed ingredients (avg deviation %)", insights.top_overdosed(6), "mean_dev_pct")
    if "product" in q:
        return spec("Lowest-accuracy products (accuracy %)", insights.product_summary()[:6], "accuracy_score")
    if "batch" in q:
        rows = insights.worst_batches(6)
        return {
            "type": "bar",
            "title": "Lowest-accuracy batches (accuracy %)",
            "labels": [r["product_name"] for r in rows],
            "values": [round(r["accuracy_score"], 1) for r in rows],
            "unit": "%",
        }
    if "worst" in q or "accuracy" in q or "material" in q or "ingredient" in q:
        return spec("Least accurate ingredients (avg |deviation| %)", insights.worst_materials(6), "mean_abs_dev_pct")
    return None


def _extract_chart(text: str):
    """Pull a trailing ```chart json``` block out of the answer, if present."""
    match = _CHART_RE.search(text)
    if not match:
        return text.strip(), None
    cleaned = _CHART_RE.sub("", text).strip()
    try:
        spec = json.loads(match.group(1))
        if isinstance(spec, dict) and spec.get("labels") and spec.get("values"):
            return cleaned, spec
    except (ValueError, TypeError):
        pass
    return cleaned, None


def _brief_facts() -> dict:
    """A compact, pre-summarized fact set for the briefing (avoids data-dumping)."""
    h = insights.headline()
    ov = h["overall"]
    return {
        "overall_accuracy_pct": ov["accuracy_score"],
        "total_doses": ov["count"],
        "on_target": ov["on_target"],
        "over_dosed": ov["over"],
        "under_dosed": ov["under"],
        "flagged": ov["flagged"],
        "worst_ingredients": [
            {"name": m["material_name"], "avg_deviation_pct": m["mean_abs_dev_pct"]}
            for m in h["worst_materials"][:3]
        ],
        "worst_batches": [
            {"product": b["product_name"], "accuracy_pct": b["accuracy_score"]}
            for b in h["worst_batches"][:2]
        ],
    }


def executive_summary() -> dict:
    """Structured headline metrics + an AI-written briefing for the card."""
    headline = insights.headline()
    prompt = (
        "Write a 3-4 sentence executive briefing for a plant manager's dashboard about batch dosing "
        "accuracy. Use flowing prose sentences ONLY — no bullet points, no lists, no JSON, no "
        "per-item breakdowns, and never output the word 'Correct'. Mention the overall accuracy, the "
        "number of flagged doses, and name 2-3 of the worst ingredients and one weak batch/product. "
        "Output ONLY the briefing paragraph.\n\nFACTS:\n" + json.dumps(_brief_facts(), ensure_ascii=False)
    )
    result = providers.generate(SYSTEM_PROMPT, prompt, temperature=0.3)
    if result["ok"]:
        summary, provider, cached = result["text"], result["provider"], False
    else:
        summary, provider, cached = cached_answers.EXEC_SUMMARY, None, True
    return {
        "summary": summary,
        "insights": headline,
        "provider": provider,
        "cached": cached,
        "errors": result.get("errors", []),
    }


# ---------------------------------------------------------------------------
# Predictive-question routing.
#
# The LLM path above only ever narrates HISTORICAL statistics — it has no way
# to answer "will my next batch overdose?" because that's not a question
# about the past, it's a request for a live prediction from the trained
# models. Without this, the LLM would silently substitute generic historical
# trivia for a question it can't actually answer, which reads as a canned
# non-answer. This routes forward-looking questions to the real models
# instead, and asks for specifics rather than guessing when it can't.
# ---------------------------------------------------------------------------

_PREDICTIVE_KEYWORDS = (
    "next batch", "will it", "will this", "would it", "going to overdose",
    "going to be", "about to run", "about to dose", "planning to",
    "should i run", "should i dose", "chance that", "chance of",
    "chance it", "risk of", "likely to overdose", "likely to be",
    "if i dose", "if i run", "before i run", "before running",
    "is there a risk",
)


def _clean_material_name(name: str) -> str:
    """Strip trailing strength/qty markers, e.g. 'Copper proteinate 15%' ->
    'Copper proteinate', '(100g)' -> ''. Users say the plain name, not the
    lab-notation suffix."""
    cleaned = re.sub(r"\s*\(?\d+[.\d]*\s*%?\)?\s*$", "", name).strip()
    return cleaned or name


@lru_cache(maxsize=1)
def _material_index() -> list[tuple[str, str, str]]:
    """(lowercased matchable name, material_code, display name), longest first
    so a specific match wins over a shorter incidental substring."""
    info = predictor.model_info()
    entries = []
    for m in info["options"]["materials"]:
        name = m["material_name"]
        cleaned = _clean_material_name(name).lower()
        if cleaned:
            entries.append((cleaned, m["material_code"], name))
    entries.sort(key=lambda t: -len(t[0]))
    return entries


def _find_material(question: str) -> tuple[str | None, str | None, int, int]:
    """Word-boundary match against known material names. Returns
    (code, display_name, match_start, match_end) or (None, None, -1, -1)."""
    q = question.lower()
    for name_lower, code, display in _material_index():
        m = re.search(r"\b" + re.escape(name_lower) + r"\b", q)
        if m:
            return code, display, m.start(), m.end()
    return None, None, -1, -1


_QTY_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(kilograms?|kgs?|grams?|g)\b", re.IGNORECASE)
_BARE_NUM_RE = re.compile(r"\b(\d+(?:\.\d+)?)\b")


def _extract_setpoint(question: str, exclude_start: int, exclude_end: int) -> float | None:
    """Find a target weight in the question, ignoring any number that's part
    of the matched material name itself (e.g. the '15' in 'Copper proteinate
    15%')."""
    remainder = question[:exclude_start] + " " + question[exclude_end:]
    m = _QTY_RE.search(remainder)
    if m:
        val = float(m.group(1))
        unit = m.group(2).lower()
        return val / 1000.0 if unit.startswith("g") and not unit.startswith("kg") else val
    m = _BARE_NUM_RE.search(remainder)
    if m:
        return float(m.group(1))
    return None


@lru_cache(maxsize=1)
def _material_common_product() -> dict:
    """Most-frequent product recipe for each material, so a prediction can
    run even if the user doesn't name a specific product."""
    counts: dict[str, Counter] = {}
    for r in data.scored_rows():
        counts.setdefault(r["material_code"], Counter())[r["product_name"]] += 1
    return {code: c.most_common(1)[0][0] for code, c in counts.items() if c}


def _clarify(question: str, missing: str) -> dict:
    return {
        "question": question,
        "answer": (
            f"I can predict the risk for a specific dose, but I need to know {missing}. "
            'For example: "will 0.9kg of Copper proteinate overdose?" — or use the '
            "Predictive ML tab above for the full form with dropdowns."
        ),
        "chart": None,
        "provider": None,
        "cached": False,
    }


def _try_predictive_answer(question: str) -> dict | None:
    """If this looks like a forward-looking prediction question, answer it
    with the trained models. Returns None if the question isn't predictive
    at all, so the caller falls through to the normal grounded-LLM answer."""
    q = question.lower()
    if not any(kw in q for kw in _PREDICTIVE_KEYWORDS):
        return None
    if not predictor.is_ready() or not predictor_severity.is_ready():
        return None

    code, material_name, start, end = _find_material(question)
    if not code:
        return _clarify(question, "which ingredient you're asking about")

    setpoint = _extract_setpoint(question, start, end)
    used_default = setpoint is None
    if used_default:
        meta = predictor.model_info()
        setpoint = meta.get("material_defaults", {}).get(code, {}).get("typical_setpoint")
    if not setpoint or setpoint <= 0:
        return _clarify(question, f"the target weight for {material_name} (in kg)")

    product = _material_common_product().get(code)
    risk = predictor.predict(material_code=code, product_name=product, setpoint=setpoint)
    sev = predictor_severity.predict(material_code=code, product_name=product, setpoint=setpoint)

    weight_note = f" (using its typical target of {setpoint:.2f} kg, since none was given)" if used_default else f" at {setpoint:.2f} kg"
    answer = (
        f"For {material_name}{weight_note}, the trained model predicts a {risk['risk_pct']}% chance "
        f"of coming out of tolerance ({risk['band']} risk), with the most likely outcome being "
        f'"{sev["severity_label"]}" ({sev["confidence_pct"]}% confidence). This is a live prediction '
        f"from the trained model for this specific dose, not a historical average."
    )
    return {
        "question": question,
        "answer": answer,
        "chart": None,
        "provider": "ml-model",
        "cached": False,
        "ml_prediction": {"risk": risk, "severity": sev},
    }


def ask(question: str) -> dict:
    """Answer a free-text question about the batch data (+ optional chart)."""
    question = (question or "").strip()
    if not question:
        return {"question": question, "answer": "Please ask a question about the dosing data.",
                "chart": None, "provider": None, "cached": False}

    predictive = _try_predictive_answer(question)
    if predictive is not None:
        return predictive

    prompt = (
        f"QUESTION: {question}\n\n"
        "Answer in 2-4 sentences of plain prose (a short markdown list is fine only if the user asks to "
        "rank or list items). Cite specific ingredient/product/batch names and figures from the DATA.\n\n"
        f"DATA:\n{_context_json()}"
    )
    result = providers.generate(SYSTEM_PROMPT, prompt, temperature=0.2)

    if result["ok"]:
        answer = result["text"].strip()
        chart = _auto_chart(question)  # reliable, grounded chart by question intent
        return {
            "question": question,
            "answer": answer,
            "chart": chart,
            "provider": result["provider"],
            "model": result["model"],
            "cached": False,
        }

    # Offline / no-key fallback.
    fallback = cached_answers.match(question)
    return {
        "question": question,
        "answer": fallback["answer"],
        "chart": fallback.get("chart"),
        "provider": None,
        "cached": True,
        "errors": result.get("errors", []),
    }

"""Offline fallback answers.

Used only when no AI provider is configured or every provider call fails, so a
live demo never shows an error. The numbers here mirror the real computed
analytics of the bundled dataset.
"""

from __future__ import annotations

EXEC_SUMMARY = (
    "Overall dosing accuracy across the last 1,000 recorded doses is 92.2%, with 667 doses "
    "on target and 333 flagged (196 over-dosed, 137 under-dosed). Accuracy problems concentrate "
    "in micro-ingredients: Copper proteinate 15% averages ~98% deviation from target and Selenium "
    "Yeast 4000 ~56%, while Water dosing is inconsistent (28% average deviation over 58 doses). "
    "The lowest-accuracy batches are FM Baladi Egg Maker (51%), FM Al Wasmi MM-3 PL (66%), and "
    "FM Maker 1 DDGS (70%) — worth reviewing feeder calibration on those recipes."
)

_FALLBACKS = [
    {
        "keywords": ["over", "overdos", "over-dos"],
        "answer": (
            "The most over-dosed ingredients are micro-ingredients dosed above target: "
            "Copper proteinate 15% and Selenium Yeast 4000 lead, with 196 of 1,000 doses over "
            "tolerance overall. These are small-quantity additives where the feeder overshoots the setpoint."
        ),
    },
    {
        "keywords": ["under", "underdos", "under-dos", "shortfall"],
        "answer": (
            "137 of 1,000 doses were under-dosed (below target minus 2%). Under-dosing is most common "
            "on Water and several micro-ingredients, meaning batches receive slightly less than the recipe specifies."
        ),
    },
    {
        "keywords": ["worst", "batch", "accuracy", "lowest"],
        "answer": (
            "The lowest-accuracy batches are FM Baladi Egg Maker (51% accuracy), FM Al Wasmi MM-3 PL (66%), "
            "and FM Maker 1 DDGS (70%). Their deviations are driven by micro-ingredient dosing, so feeder "
            "calibration on those recipes is the place to start."
        ),
    },
    {
        "keywords": ["material", "ingredient", "worst material"],
        "answer": (
            "The least accurate ingredients by average deviation are Copper proteinate 15% (~98%), "
            "Selenium Yeast 4000 (~56%), Water (~28%), Vitamin B12 1% (~25%) and Carrophyl Yellow (~21%). "
            "All are small-quantity additives where a few grams of error is a large percentage."
        ),
    },
]

_DEFAULT = {
    "answer": (
        "Across 1,000 recorded doses, overall accuracy is 92.2% — 667 on target, 196 over-dosed and "
        "137 under-dosed. The biggest accuracy problems are in micro-ingredients such as Copper proteinate "
        "15% and Selenium Yeast, and the weakest batches are the FM Baladi Egg Maker and FM Al Wasmi recipes. "
        "(This is an offline answer — add a Gemini or Claude API key for full conversational analysis.)"
    ),
}


def match(question: str) -> dict:
    q = (question or "").lower()
    for fb in _FALLBACKS:
        if any(kw in q for kw in fb["keywords"]):
            return fb
    return _DEFAULT

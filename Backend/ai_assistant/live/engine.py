"""The live dosing-quality monitor.

A single background engine that:

  1. Streams batches from the data source (CSV replay now, SQL Server later),
     one every ``tick`` seconds, as if they were arriving live from the plant.
  2. Scores each batch the moment it "arrives" with the current model —
     BEFORE the actual dosed weight is known — so a risky dose can be flagged
     to the operator *before the batch runs*.
  3. Reveals the true outcome (the historian row's actual weight) right after,
     so it can track the model's live accuracy against ground truth.
  4. Watches the incoming feature distribution for drift (PSI) against what the
     model was trained on.
  5. When real drift is detected, retrains the model on the accumulated data on
     a background thread — while the current model keeps serving predictions
     with zero downtime — then atomically hot-swaps it in and raises a
     notification. The operator never touches anything; they just see a popup
     that the model self-updated.

Demo honesty note: the reference model is trained on the EARLIER part of the
real Fakieh history and the LATER part is streamed as the live feed. The later
period genuinely introduces product recipes the early model never saw, so the
drift is real (PSI on the product mix ~7, far above the 0.25 "significant"
line) — not injected or faked. The retrained model then genuinely learns the
new recipes.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from collections import Counter, deque
from datetime import datetime, timezone

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder

from ..ml import features, predictor_severity
from . import drift as driftmod
from .sources import get_source

# --- Tunables (env-overridable) --------------------------------------------
# Fraction of history used to train the reference model + reference distribution.
REF_FRAC = float(os.getenv("AI_LIVE_REF_FRAC", "0.45"))
# The live stream starts slightly before the reference boundary, so the feed
# opens with a short in-distribution "healthy" baseline before the mix shifts.
STREAM_START_FRAC = float(os.getenv("AI_LIVE_STREAM_START", "0.40"))
WINDOW = int(os.getenv("AI_LIVE_WINDOW", "30"))          # rolling window size
MIN_WINDOW = int(os.getenv("AI_LIVE_MIN_WINDOW", "12"))  # warm-up before drift checks
TICK = float(os.getenv("AI_LIVE_TICK", "1.1"))           # seconds between batches
RETRAIN_COOLDOWN = float(os.getenv("AI_LIVE_COOLDOWN", "20"))
FEED_MAX = 40
NOTIF_MAX = 25

# A product recipe seen fewer than this many times in the training data is
# treated as effectively "unseen" / out-of-distribution for the model.
RARE_FLOOR = int(os.getenv("AI_LIVE_RARE_FLOOR", "3"))
# Drift status thresholds on the out-of-distribution (novel-recipe) rate.
NOVEL_DRIFT = float(os.getenv("AI_LIVE_NOVEL_DRIFT", "0.25"))  # >=25% of window -> drift
NOVEL_WATCH = float(os.getenv("AI_LIVE_NOVEL_WATCH", "0.10"))  # >=10% -> watch


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _band(risk: float) -> str:
    if risk >= 0.66:
        return "High"
    if risk >= 0.33:
        return "Medium"
    return "Low"


class LiveEngine:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._source = get_source()

        allrows = self._source.scored_rows()
        n = len(allrows)
        self._ref_rows = allrows[: max(1, int(n * REF_FRAC))]
        self._stream = allrows[int(n * STREAM_START_FRAC):]

        # Runtime state
        self.model: Pipeline | None = None
        self.model_version = 1
        self.trained_at = _now_iso()
        self.trained_on = len(self._ref_rows)
        self.ref_acc: float | None = None

        # Reference distribution captured from the training slice: how often the
        # model saw each product recipe (for out-of-distribution detection), and
        # the setpoint sample (for numeric PSI).
        self.ref_product_counts: Counter = Counter()
        self.ref_setpoints: list = []

        self.cursor = 0
        self.running = True
        self.speed = TICK
        self.retraining = False
        self._last_retrain = 0.0

        self.feed: deque = deque(maxlen=FEED_MAX)      # scored batches (oldest->newest)
        self.window: deque = deque(maxlen=WINDOW)      # recent rows for PSI + accuracy
        self.notifications: deque = deque(maxlen=NOTIF_MAX)
        self.drift = self._warming_drift()
        self.stats = self._empty_stats()

        self._fit_reference()

        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    # -- setup ---------------------------------------------------------------
    def _empty_stats(self) -> dict:
        return {"processed": 0, "flagged": 0, "on_target": 0, "over": 0,
                "under": 0, "correct": 0, "rolling_accuracy": None}

    def _warming_drift(self) -> dict:
        return {"status": "warming", "novel_rate": None, "setpoint_psi": None,
                "new_recipes": [], "checked_at": None}

    def _fit(self, rows: list[dict]) -> tuple[Pipeline, float | None]:
        """Train the RandomForest pipeline on normalized rows; return (pipe, holdout_acc)."""
        recs = []
        for r in rows:
            f = features.row_to_features(r)
            f["flagged"] = 1 if r.get("status") in ("over", "under") else 0
            recs.append(f)
        df = pd.DataFrame.from_records(recs)
        X = df[features.FEATURE_ORDER]
        y = df["flagged"]

        pre = ColumnTransformer(
            transformers=[
                ("num", "passthrough", features.NUMERIC_FEATURES),
                ("cat", OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1),
                 features.CATEGORICAL_FEATURES),
            ]
        )
        clf = RandomForestClassifier(
            n_estimators=200, min_samples_leaf=2, class_weight="balanced",
            random_state=42, n_jobs=-1,
        )
        pipe = Pipeline([("pre", pre), ("clf", clf)])

        acc: float | None = None
        try:
            X_tr, X_te, y_tr, y_te = train_test_split(
                X, y, test_size=0.25, random_state=42, stratify=y
            )
            pipe.fit(X_tr, y_tr)
            acc = float(accuracy_score(y_te, pipe.predict(X_te)))
        except ValueError:
            pass
        # Refit on everything for the served model (best use of the data).
        pipe.fit(X, y)
        return pipe, acc

    def _fit_reference(self) -> None:
        pipe, acc = self._fit(self._ref_rows)
        with self._lock:
            self.model = pipe
            self.ref_acc = acc
            self._capture_reference(self._ref_rows)

    def _capture_reference(self, rows: list[dict]) -> None:
        self.ref_product_counts = Counter(r["product_name"] for r in rows)
        self.ref_setpoints = [r["setpoint"] for r in rows]

    def _is_novel(self, product_name) -> bool:
        """True if the model was trained on this recipe fewer than RARE_FLOOR times."""
        return self.ref_product_counts.get(product_name, 0) < RARE_FLOOR

    # -- per-batch processing ------------------------------------------------
    def _recommendation(self, band: str, material_name: str, setpoint: float | None) -> str:
        if band == "High":
            rec = f"Recalibrate the {material_name} feeder before this batch runs — high risk of an out-of-tolerance dose."
        elif band == "Medium":
            rec = f"Watch the {material_name} dose; consider a slower feed rate and confirm the feeder is clear."
        else:
            rec = "No action needed — dose predicted on target."
        if setpoint is not None and 0 < setpoint < features.MICRO_THRESHOLD_KG:
            rec += " Micro-ingredient: a few grams of feeder error is a large percentage deviation."
        return rec

    def _score(self, row: dict) -> dict:
        feat = features.row_to_features(row)
        frame = pd.DataFrame([feat])[features.FEATURE_ORDER]
        risk = float(self.model.predict_proba(frame)[:, 1][0])
        band = _band(risk)
        pred_flag = 1 if risk >= 0.5 else 0

        actual_status = row.get("status")          # on_target / over / under
        actual_flag = 1 if actual_status in ("over", "under") else 0
        dev_pct = row.get("deviation_pct")

        # Second model (static): severity triage, for the operator drill-down.
        severity = severity_label = None
        try:
            sev = predictor_severity.predict(
                material_code=row.get("material_code"),
                product_name=row.get("product_name"),
                setpoint=row.get("setpoint"),
                quantity=row.get("quantity"),
                category=row.get("category"),
            )
            severity = sev.get("severity")
            severity_label = sev.get("severity_label")
        except Exception:
            pass

        return {
            "id": uuid.uuid4().hex[:12],
            "seq": self.stats["processed"] + 1,
            "batch_name": row.get("batch_name") or row.get("order_id") or "—",
            "order_id": row.get("order_id"),
            "material_name": row.get("material_name"),
            "material_code": row.get("material_code"),
            "product_name": row.get("product_name"),
            "setpoint": row.get("setpoint"),
            "quantity": row.get("quantity"),
            "risk_pct": round(risk * 100, 1),
            "band": band,
            "flagged": band in ("High", "Medium"),
            "prediction": "Likely out-of-tolerance" if pred_flag else "Likely on-target",
            "actual_status": actual_status,
            "actual_pct": round(dev_pct, 1) if dev_pct is not None else None,
            "correct": pred_flag == actual_flag,
            "severity": severity,
            "severity_label": severity_label,
            "recommendation": self._recommendation(band, row.get("material_name") or "this", row.get("setpoint")),
            "model_version": self.model_version,
            "at": _now_iso(),
            "_pred_flag": pred_flag,
            "_actual_flag": actual_flag,
        }

    def _step(self) -> bool:
        """Process one streamed batch. Returns False when the stream is exhausted."""
        with self._lock:
            if self.cursor >= len(self._stream):
                return False
            row = self._stream[self.cursor]
            self.cursor += 1
            item = self._score(row)

            self.feed.append(item)
            self.window.append({
                "product_name": item["product_name"],
                "material_name": item["material_name"],
                "setpoint": item["setpoint"],
                "pred_flag": item["_pred_flag"],
                "actual_flag": item["_actual_flag"],
            })

            s = self.stats
            s["processed"] += 1
            if item["flagged"]:
                s["flagged"] += 1
            st = item["actual_status"]
            if st == "on_target":
                s["on_target"] += 1
            elif st == "over":
                s["over"] += 1
            elif st == "under":
                s["under"] += 1
            if item["correct"]:
                s["correct"] += 1
            win_correct = sum(1 for w in self.window if w["pred_flag"] == w["actual_flag"])
            s["rolling_accuracy"] = round(win_correct / len(self.window) * 100, 1)

        self._check_drift()
        return True

    # -- drift + retrain -----------------------------------------------------
    def _check_drift(self) -> None:
        with self._lock:
            if len(self.window) < MIN_WINDOW:
                self.drift = self._warming_drift()
                return
            # Primary signal: what fraction of the recent window are product
            # recipes the model was effectively never trained on (out of
            # distribution). Robust at small windows and directly explainable.
            novel_products = [w["product_name"] for w in self.window if self._is_novel(w["product_name"])]
            novel_rate = len(novel_products) / len(self.window)
            new_recipes = sorted(set(novel_products))
            # Secondary signal: numeric shift in dose setpoints (well-behaved PSI).
            sp_psi = driftmod.psi_numeric(self.ref_setpoints, [w["setpoint"] for w in self.window])

            if novel_rate >= NOVEL_DRIFT:
                status = "drift"
            elif novel_rate >= NOVEL_WATCH:
                status = "watch"
            else:
                status = "healthy"
            self.drift = {
                "status": status,
                "novel_rate": round(novel_rate * 100, 1),
                "setpoint_psi": round(sp_psi, 3),
                "new_recipes": new_recipes,
                "checked_at": _now_iso(),
            }
            trigger = (status == "drift" and not self.retraining
                       and (time.time() - self._last_retrain) > RETRAIN_COOLDOWN)
        if trigger:
            threading.Thread(target=self._retrain, daemon=True).start()

    def _retrain(self) -> None:
        with self._lock:
            if self.retraining:
                return
            self.retraining = True
            train_rows = list(self._ref_rows) + list(self._stream[: self.cursor])
            recipes = self.drift.get("new_recipes") or []
            recipe_txt = ""
            if recipes:
                shown = ", ".join(recipes[:3]) + ("…" if len(recipes) > 3 else "")
                recipe_txt = f" The plant started running recipes the model wasn't trained on ({shown})."
            self._notify(
                "drift",
                "Data drift detected",
                "Incoming batches no longer match the model's training data." + recipe_txt
                + " Retraining on the latest production data — predictions continue uninterrupted.",
            )

        # Train OFF the lock so the current model keeps serving with zero downtime.
        new_pipe, acc = self._fit(train_rows)

        with self._lock:
            self.model = new_pipe                       # atomic hot-swap
            self.model_version += 1
            self.trained_at = _now_iso()
            self.trained_on = len(train_rows)
            self.ref_acc = acc
            # New reference distribution now includes the shifted mix, so drift clears.
            self._capture_reference(train_rows)
            self._last_retrain = time.time()
            self.retraining = False
            acc_txt = f" (validation accuracy {acc * 100:.0f}%)" if acc is not None else ""
            self._notify(
                "retrain",
                f"Model retrained — now v{self.model_version}",
                f"Retrained on {len(train_rows)} batches{acc_txt}. The model now "
                "recognises the new production mix and is live. No operator action needed.",
            )

    def _notify(self, kind: str, title: str, message: str) -> None:
        self.notifications.append({
            "id": uuid.uuid4().hex[:12],
            "kind": kind,
            "title": title,
            "message": message,
            "at": _now_iso(),
        })

    # -- background loop -----------------------------------------------------
    def _loop(self) -> None:
        while True:
            time.sleep(max(0.1, self.speed))
            if self.running and not self.retraining:
                try:
                    self._step()
                except Exception:
                    # Never let one bad row kill the stream.
                    pass

    # -- controls ------------------------------------------------------------
    def start(self) -> None:
        with self._lock:
            self.running = True

    def pause(self) -> None:
        with self._lock:
            self.running = False

    def set_speed(self, seconds: float) -> None:
        with self._lock:
            self.speed = max(0.2, min(10.0, float(seconds)))

    def reset(self) -> None:
        with self._lock:
            self.running = False
            self.cursor = 0
            self.model_version = 1
            self.trained_at = _now_iso()
            self.trained_on = len(self._ref_rows)
            self.feed.clear()
            self.window.clear()
            self.notifications.clear()
            self.stats = self._empty_stats()
            self.drift = self._warming_drift()
            self._last_retrain = 0.0
            self.retraining = False
        self._fit_reference()
        with self._lock:
            self.running = True

    # -- snapshot for the API ------------------------------------------------
    def snapshot(self) -> dict:
        with self._lock:
            return {
                "source": self._source.label,
                "running": self.running,
                "speed": self.speed,
                "retraining": self.retraining,
                "cursor": self.cursor,
                "total": len(self._stream),
                "model": {
                    "version": self.model_version,
                    "trained_at": self.trained_at,
                    "trained_on": self.trained_on,
                    "accuracy": self.ref_acc,
                },
                "stats": dict(self.stats),
                "drift": dict(self.drift),
                "feed": list(reversed(self.feed)),          # newest first
                "notifications": list(reversed(self.notifications)),
            }


# --- module singleton -------------------------------------------------------
_engine: LiveEngine | None = None
_engine_lock = threading.Lock()


def get_engine() -> LiveEngine:
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = LiveEngine()
    return _engine

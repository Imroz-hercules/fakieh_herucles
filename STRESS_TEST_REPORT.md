# Fakieh (Hercules) — Stress Test Report & Fix Guide

**Date:** 2026-08-24
**Scope:** Flask backend (`Backend/`, **201 registered routes**) + React/Vite frontend (`frontend-package/`).
**Audience:** an engineer or AI applying fixes. Every finding below is self-contained: exact file + line, the current code, the corrected code, and how to verify. Paths are relative to the repo root `C:\Users\Administrator\Projects\Fakieh`.

**Method:** full source read, then the app was launched against live databases and **~170 endpoint calls across two passes** were exercised (happy-path, full CRUD, negative/validation, and every code path flagged in the read). Frontend was type-checked, production-built, and loaded in a browser.

---

## 0. How to run it locally (to reproduce and verify fixes)

The app does **not** boot as-shipped (B1, B10). A local environment was created **without editing project files**:

1. **PostgreSQL** — a private cluster (the shipped default `postgres/Hercules@localhost:5432/Faikeh` is not valid on this machine):
   ```bash
   INITDB="/c/Program Files/PostgreSQL/17/bin"
   "$INITDB/initdb.exe" -D <scratch>/pgdata -U postgres -A trust --encoding=UTF8
   "$INITDB/pg_ctl.exe" -D <scratch>/pgdata -o "-p 5466 -c listen_addresses=127.0.0.1" -l pg.log start
   "$INITDB/psql.exe" -w -h 127.0.0.1 -p 5466 -U postgres -c 'CREATE DATABASE "Faikeh";'
   "$INITDB/psql.exe" -w -h 127.0.0.1 -p 5466 -U postgres -c 'CREATE DATABASE plc;'
   ```
   The app also reads two tables that no model creates — create them in `Faikeh` so the silo endpoints work:
   ```sql
   CREATE TABLE IF NOT EXISTS public.silo_status (
     silo_no INTEGER PRIMARY KEY, db_no INTEGER, material_code TEXT, material_name TEXT,
     hl_active BOOLEAN DEFAULT false, lock_active BOOLEAN DEFAULT false,
     quantity_kg DOUBLE PRECISION, updated_at TIMESTAMPTZ DEFAULT now());
   CREATE TABLE IF NOT EXISTS public.silo_status_history (
     id BIGSERIAL PRIMARY KEY, silo_no INTEGER, db_no INTEGER, material_code TEXT,
     material_name TEXT, hl_active BOOLEAN, lock_active BOOLEAN, created_at TIMESTAMPTZ DEFAULT now());
   ```
2. **SQL Server** — the remote server in `config.py` is unreachable. A local `localhost\SQLEXPRESS` instance was used (Windows auth) with database `ASMBatchReports`; the app's ORM created `dbo.BatchMaterials_Shadow` on boot and it was loaded with the 1000 rows from `fakieh_sql.csv` (setting `POBJID` = the CSV `ID` so the composite PK doesn't collide; `ProductCode` left blank since the CSV has none).
3. **Boot** with env overrides (no source edits): `DB_HOST=127.0.0.1`, `DB_PORT=5466`, `PORT=5001`, and the `sqlserver` bind repointed to `SERVER=localhost\SQLEXPRESS;Trusted_Connection=yes`.

Once fixed, `start.sh` (the intended launcher) runs `python3 Backend/app.py` on port 5000 + Vite on 8080.

---

## Summary of failures

| # | Sev | Area | File | One-line |
|---|-----|------|------|----------|
| B1 | High | Boot | `Backend/app.py:150` | `db.create_all()` unguarded → boot crashes if DB unreachable |
| B2 | High | Orders | `Backend/routes/orders.py:671,838,884` | model built with PLC-tag kwargs that aren't columns → 500 |
| B3 | High | AI/ML | `Backend/ai_assistant/ml/predictor.py:34`, `requirements.txt:19` | sklearn 1.5.0 pickle vs 1.9.0 installed → predict 500; `is_ready()` lies |
| B4 | Med | AI/LLM | `Backend/.env`, `Backend/ai_assistant/providers.py` | generative endpoints hang 70s+, no timeout, wrong model |
| B5 | Med | Reporting | `Backend/routes/sqlserver_routes.py:103,411` | SELECT `[sp_prot]` not in model/table → 500 |
| B6 | Med | Core | `Backend/app.py:74` | raw `SELECT 1` not wrapped in `text()` → 500 |
| B7 | Med | PLC | `Backend/routes/plc_routes.py:224` | hardcoded DSN `postgres:Hercules@localhost:5432/Faikeh` |
| B8 | Med | Frontend | `frontend-package/client/src/App.tsx:10-16` | imports 7 non-existent pages → `npm run check` fails (39 errors) |
| B9 | Med | Errors | `Backend/utils/error_handler.py:20,~38` | every `APIError` response has empty `message` |
| B10 | High | Boot | `Backend/models/kpi_material.py:8`, `app.py:150` | boot needs **both** Postgres+SQL Server reachable |
| B11 | Med | Logging | `Backend/utils/error_handler.py:11` | `api_debug.log` grew to 7.66 GB, no rotation |
| B12 | Low | PLC | `Backend/routes/plant_flow.py:14` | `/api/dispatch` calls hardcoded `http://localhost:5000` |
| B13 | Low | PLC | `Backend/routes/plc_routes.py:2690` | `/api/plc/debug/routes` 500 (`Blueprint.url_map`) |
| B14 | Low | Routing | `Backend/routes/plc_routes.py:1155 & 2577` | duplicate `/api/plc/health` route |
| B15 | Low | Ingestion | `Backend/routes/data_ingestion.py` (`ingest-now`) | blocks on PLC timeout when PLC absent |
| B16 | Low | Dead code | `Backend/routes/local_batch_routes.py` | blueprint never registered in `app.py` |

---

## Resolution status (updated 2026-08-25)

All findings have now been actioned. Two of them turned out **not to be defects** after
closer investigation — they are recorded here rather than silently dropped.

| # | Status | Where |
|---|--------|-------|
| B1 | Fixed | PR #1 (merged) — `db.create_all(bind_key=None)` guarded, fatal message + `sys.exit(1)` |
| B2 | Fixed | this PR — PLC-tag kwargs mapped to real model columns |
| B3 | Fixed | this PR — models retrained on the installed scikit-learn; version pinned; `is_ready()` now loads |
| B4 | Fixed | this PR — hard request timeout + fast model alias; existing cached fallback now reachable |
| B5 | **Not a defect** | see below |
| B6 | Fixed | PR #1 (merged) — `db.session.execute(text('SELECT 1'))` |
| B7 | Fixed | this PR — hardcoded DSN fallback removed |
| B8 | Fixed | PR #1 (merged) — `npx tsc --noEmit` clean (39 → 0) |
| B9 | Fixed | this PR — `super().__init__(message)` + defensive serialisers |
| B10 | Fixed | PR #1 (merged) — boot no longer requires the SQL Server bind |
| B11 | Fixed | this PR — `RotatingFileHandler`, level raised to WARNING, 7.15 GB log truncated |
| B12 | Fixed | this PR — `PLC_BASE_URL` derives from `PORT`, overridable, request timeout added |
| B13 | Fixed | this PR — `current_app.url_map.iter_rules()` |
| B14 | Fixed | this PR — second `/health` re-registered as `/db-health` |
| B15 | Fixed | this PR — DEMO_MODE fast-fail instead of blocking on the snap7 connect |
| B16 | **Not a defect** | see below |
| B17 | Fixed | this PR — new finding, see below |

### B5 is not a defect — it was an artifact of the test database

The report stated that `SELECT [sp_prot]` fails because the column "is not in the
model/table". That conclusion was wrong, and acting on it would have **removed a real
column from production queries**.

`sp_prot` genuinely exists in the production `BatchMaterials` table: it is present in the
`fakieh_sql.csv` export (column 17 of 17, with real values such as `203`, `202`) and it is
queried by the `_ro_*.py` investigation scripts that were run against the live server.

The 500 was environmental. The local `dbo.BatchMaterials_Shadow` table used for testing was
created by the app's ORM from `models/kpi_material.py`, and that model simply does not declare
every column of the real table — `sp_prot` among them. So the shadow table lacked a column the
raw SQL correctly asks for.

**Action taken:** no code change. The test table was corrected to match the real schema
(`ALTER TABLE dbo.BatchMaterials_Shadow ADD [sp_prot] varchar(50) NULL`, then populated from
the CSV), after which `GET /api/sqlserver/batch-materials` returns **200** with `sp_prot`
present in the payload.

*Related environment note:* the by-GUID variant (`sqlserver_routes.py:411`) uses `TRY_CONVERT`,
which the local test database rejects because it was created at a compatibility level below 110.
That is also a property of the scratch database, not of the code — `TRY_CONVERT` has existed
since SQL Server 2012.

### B16 is not a defect — the blueprint is unregistered on purpose

`local_batch_routes.py` defines `/api/kpi`, `/api/kpi_calendar`, etc. Those exact paths are
already served by `kpi_material_bp` and `kpi_calendar_bp`, which `app.py` registers with
`url_prefix='/api'`. Registering it would collide with them.

The module is intentionally registered **only** in `run_ai_demo.py`, and its own docstring
already says so and names what supersedes it. **Action taken:** none.

### B17 (new) — duplicate RFID registration returned 500

Found while stress-testing the order queue, not part of the original sweep.

`POST /api/rfid/config` with an already-registered tag returned **500** with
`"Failed to add RFID configuration. Please try again."` — advice that can never succeed,
because `rfid_config.rfid_number` is `unique=True` and the duplicate raises `IntegrityError`,
which the bare `except Exception` turned into a 500.

Fixed in `Backend/routes/rfid_routes.py`: a pre-check returns **409** with
`"RFID <n> is already registered"`, a missing field returns **400**, and `IntegrityError` is
caught separately to cover the race between the check and the commit.

### Verification performed after the fixes

Against the running app (IPv4 `127.0.0.1` — note that using `localhost` on Windows adds a
~2 s IPv6-fallback penalty per request and will make every endpoint look slow):

- **All 201 registered routes enumerated**; all 80 parameterless `GET /api` routes swept.
  56 → `200`, 7 → `400` (all of them correct "date range is required" validations, each
  confirmed `200` when called with parameters), remainder `200`. No `500`s.
  `/api/rfid/stream` is excluded from sweeps: it is a Server-Sent Events endpoint and streams
  by design.
- **Previously-failing endpoints now pass:** `POST /api/orders/{bulk,pt}` → `201`,
  `POST /api/orders/seed` → `200`, `/api/ai/ml/predict` + `/ml/severity/predict` +
  `/ml/top-risks` → `200`, `/api/sqlserver/batch-materials` → `200`.
- **Negative paths still reject correctly** (400, not 500), and `APIError` messages are no
  longer blank: `"Missing required fields: BulkLine_DEST_1, ..."`.
- **Order lifecycle:** enqueue → `201`; duplicate RFID → `409`; cancel → `200` and the row
  leaves the queue; re-enqueue of the same tag → `201`, proving the RFID lock is released.
- **Concurrency:** 300 requests over 12 threads across 10 endpoints — **300/300 `200`,
  0 errors**, p50 79 ms, p95 167 ms, ~129 req/s.
- **Frontend:** `npx tsc --noEmit` → **0 errors**; `npm run build` succeeds; initial JS chunk
  **307.56 kB** (vs ~1,306 kB before the split), route-level code splitting intact, no
  chunk-size or dynamic/static-import warnings.

*Known remaining slow path (not a regression, not fixed):* `GET /api/plc/health` takes ~5 s
when no PLC is attached, because it attempts a real connection and waits for the timeout. It is
correct and fast against real hardware, and the frontend declares the constant but never calls
it, so no user-facing screen is affected.

> **Confirmed NOT bugs (environment / correct behavior)** — do not "fix" these:
> `GET /api/plc/db/3/silos`, `/api/plc/db/5/silos-qty`, `/api/plc/lines`, `/api/plc/silos-plc`, `/api/plc/db/1/lines` → **503**, and `POST /api/plc/orders/create` → 500 ("Tag … not in mapping for DB4"): no physical PLC (`192.168.0.100`) and no `db{n}_map` tables in the test env. `GET /api/orders/{intake,bulk,pt,outloading}/<id>` → 404 and `/api/process/*`, `/api/wb-form/create` → 404: those orders only persist via the PLC status-8 lifecycle, which never fires without a PLC. `GET /api/reports/export/bogus` → 400 is correct validation.

---

## B1 — Unguarded `db.create_all()` crashes boot · High
**File:** `Backend/app.py:150` (inside `if __name__ == '__main__':`).
**Symptom (proof):**
```
psycopg2.OperationalError: connection to server at "localhost" (::1), port 5432 failed:
FATAL: password authentication failed for user "postgres"
  File ".../app.py", line 151, in <module>
    db.create_all()
```
**Current code:**
```python
if __name__ == '__main__':
    with app.app_context():
        db.create_all()  # Creates tables if they don't exist
```
**Corrected code:**
```python
if __name__ == '__main__':
    with app.app_context():
        try:
            db.create_all()
        except Exception as e:
            import sys
            print(f"FATAL: cannot initialize database "
                  f"({app.config.get('SQLALCHEMY_DATABASE_URI')}): {e}", file=sys.stderr)
            sys.exit(1)
```
Also make credentials real env vars (they already are in `config.py`, but document that `DB_USERNAME/DB_PASSWORD/DB_HOST/DB_PORT` must be set for any non-default install). **Verify:** with a wrong password the process now exits with one clear line instead of a traceback; with a correct DB it boots.

---

## B2 — `POST /api/orders/bulk` · `/api/orders/pt` · `/api/orders/seed` → 500 · High
**File:** `Backend/routes/orders.py` — `add_bulk_order` (constructor at `:671`), `add_pt_order` (`:838`), `seed_test_data` (`:884` and `:902`).
**Root cause:** the handlers build the ORM objects using **PLC-tag names as keyword args**, but those are not columns on the models (see `Backend/models/orders.py`). SQLAlchemy raises `TypeError`.
**Symptom (proof — server log):**
```
POST /api/orders/bulk -> 500   TypeError: 'BulkLine_Source_Silo' is an invalid keyword argument for BulkLineOrder
POST /api/orders/pt   -> 500   TypeError: 'PitLine_Pit_Number'   is an invalid keyword argument for PTLineOrder
POST /api/orders/seed -> 500   (same)
```
**Current code (`add_bulk_order`, orders.py:671):**
```python
order = BulkLineOrder(
    BulkLine_Source_Silo=data['BulkLine_Source_Silo'],
    BulkLine_DEST_1=data['BulkLine_DEST_1'],
    BulkLine_DEST_2=data['BulkLine_DEST_2'],
    BulkLine_CC25_Sel=data['BulkLine_CC25_Sel'],
    BulkLine_Weight_Quantity=data['BulkLine_Weight_Quantity'],
    BulkLine_Scale_Selection=data['BulkLine_Scale_Selection'],
    ActiveBulk_Source_Silo=data['ActiveBulk_Source_Silo'],
    ActiveBulk_DEST_1=data['ActiveBulk_DEST_1'],
    ActiveBulk_DEST_2=data['ActiveBulk_DEST_2'],
    ActiveBulk_CC25_Sel=data['ActiveBulk_CC25_Sel'],
    ActiveBulk_weightQuantity=data['ActiveBulk_weightQuantity'],
    ActiveBulk_ScaleSelect=data['ActiveBulk_ScaleSelect'],
    BulkLine_Status=data['BulkLine_Status']
)
```
**Corrected code** (map incoming JSON keys → real `BulkLineOrder` columns; keep reading the same `data[...]` keys):
```python
order = BulkLineOrder(
    source_silo=data['BulkLine_Source_Silo'],
    destination_silo1=data['BulkLine_DEST_1'],
    destination_silo2=data['BulkLine_DEST_2'],
    cc25_sel=data['BulkLine_CC25_Sel'],
    declared_quantity_kg=data['BulkLine_Weight_Quantity'],
    scale_sel=data['BulkLine_Scale_Selection'],
    active_source_silo=data['ActiveBulk_Source_Silo'],
    active_dest1=data['ActiveBulk_DEST_1'],
    active_dest2=data['ActiveBulk_DEST_2'],
    active_cc25_sel=data['ActiveBulk_CC25_Sel'],
    active_qty_kg=data['ActiveBulk_weightQuantity'],
    active_scale_sel=data['ActiveBulk_ScaleSelect'],
    status_word=data['BulkLine_Status'],
)
```
**Current code (`add_pt_order`, orders.py:838):**
```python
order = PTLineOrder(
    PitLine_Pit_Number=data['PitLine_Pit_Number'],
    PitLine_RawMaterialCode=data['PitLine_RawMaterialCode'],
    PitLine_DEST_1=data['PitLine_DEST_1'],
    PitLine_DEST_2=data['PitLine_DEST_2'],
    PitLine_Weight_Quantity=data['PitLine_Weight_Quantity'],
    PitLine_Scale_Selection=data['PitLine_Scale_Selection'],
    ActivePit_Pit_Number=data['ActivePit_Pit_Number'],
    ActivePit_RawMaterialCod=data['ActivePit_RawMaterialCod'],
    ActivePit_DEST_1=data['ActivePit_DEST_1'],
    ActivePit_DEST_2=data['ActivePit_DEST_2'],
    ActivePit_Weight_Quant=data['ActivePit_Weight_Quant'],
    ActivePit_Scale_Select=data['ActivePit_Scale_Select'],
    PitLine_Status=data['PitLine_Status']
)
```
**Corrected code** (the `PTLineOrder` model has **no** `active_*` columns — drop those fields):
```python
order = PTLineOrder(
    pit_no=data['PitLine_Pit_Number'],
    raw_code=data['PitLine_RawMaterialCode'],
    destination_silo1=data['PitLine_DEST_1'],
    destination_silo2=data['PitLine_DEST_2'],
    declared_quantity_kg=data['PitLine_Weight_Quantity'],
    scale_sel=data['PitLine_Scale_Selection'],
    status_word=data['PitLine_Status'],
)
```
Apply the same two mappings inside `seed_test_data` (orders.py:884 for the bulk object, :902 for the PT object).
**Note:** these handlers deliberately do **not** persist (the `db.session.add/commit` is commented out), so after the fix they return `201` with `order.to_dict()` and never write — that's the existing intent. **Verify:** re-POST the same bodies used in testing → expect `201`.

---

## B3 — ML predict endpoints 500 (scikit-learn version drift) · High
**Files:** models `Backend/ai_assistant/ml/model.joblib` + `model_severity.joblib` (pickled with scikit-learn **1.5.0**); `Backend/requirements.txt:19` pins nothing; `Backend/ai_assistant/ml/predictor.py:34` + `predictor_severity.py:32` (`is_ready` too weak).
**Symptom (proof):**
```
GET  /api/ai/health              -> 200  "ml_model_ready": true   (misleading)
GET  /api/ai/ml/top-risks        -> 500
POST /api/ai/ml/predict          -> 500
POST /api/ai/ml/severity/predict -> 500
   {"error":"Can't get attribute '_RemainderColsList' on sklearn.compose._column_transformer ..."}
Boot log: InconsistentVersionWarning: unpickle OrdinalEncoder from version 1.5.0 when using version 1.9.0.
```
**Fix (pick one):**
- **Pin the training version** — `Backend/requirements.txt` currently has bare `scikit-learn`. Change to:
  ```
  scikit-learn==1.5.0
  numpy<2.0
  joblib==1.4.2
  ```
  then `pip install -r requirements.txt` (reinstall in a clean venv).
- **Or retrain on the installed version:** `cd Backend && python -m ai_assistant.ml.train && python -m ai_assistant.ml.train_severity` (regenerates the `.joblib` files for sklearn 1.9.0).
**Also make `is_ready()` honest** so `/api/ai/health` stops lying. Current (`predictor.py:34`):
```python
def is_ready() -> bool:
    return os.path.exists(MODEL_PATH) and os.path.exists(META_PATH)
```
Corrected:
```python
def is_ready() -> bool:
    if not (os.path.exists(MODEL_PATH) and os.path.exists(META_PATH)):
        return False
    try:
        _model()            # actually load; returns False if the pickle is incompatible
        return True
    except Exception:
        return False
```
Apply the same to `predictor_severity.py:32`. **Verify:** `POST /api/ai/ml/predict {"material_code":"100607","product_name":"FM Ruminant 13%","setpoint":0.9}` → `200` with a risk value.

---

## B4 — Generative AI endpoints hang 70s+ (no timeout, wrong model) · Medium
**Files:** `Backend/.env` (`GEMINI_MODEL`), `Backend/ai_assistant/providers.py` (`_call_gemini`, no timeout), `Backend/ai_assistant/brain.py` (`executive_summary`, `ask`).
**Symptom (proof, internet reachable):** `GET /api/ai/insights` → no response in 30s; `POST /api/ai/ask` → no response in 70s (real 1m10s).
**Root cause:** `.env` sets `GEMINI_MODEL=gemini-flash-latest`, the slow "thinking" alias that `providers.py`'s own comment warns against (it recommends `gemini-flash-lite-latest`); and the Gemini call has no timeout, and `brain` does not fall back to `ai_assistant/cached_answers.py` on slowness.
**Fixes:**
1. In `Backend/.env`, change `GEMINI_MODEL=gemini-flash-latest` → `GEMINI_MODEL=gemini-flash-lite-latest`.
2. Add a client timeout in `providers._call_gemini` (google-genai supports per-request options) — cap it (e.g. 15s) and let the existing `except Exception` in `providers.generate` move to the next provider / caller fallback.
3. Ensure `brain.ask` / `executive_summary` return a `cached_answers` result when `providers.generate` reports `ok: False`.
**Verify:** `POST /api/ai/ask {"question":"hi"}` returns within ~15s (a real or cached answer), never hangs.

---

## B5 — `GET /api/sqlserver/batch-materials` (+ `/<guid>`) → 500 · Medium
**File:** `Backend/routes/sqlserver_routes.py:103` (`get_batch_materials`) and `:411` (`get_batch_material_by_guid`).
**Symptom (proof):** `[42S22] Invalid column name 'sp_prot'.` The parallel `/api/kpi` reader (no `sp_prot`) returns 200 over the same 1000 rows, so the data/connection are fine.
**Current code (both queries include this line):**
```sql
                [Material Code],
                [sp_prot],
                [SetPoint Float],
```
**Fix (choose one, consistently):**
- **Simplest:** delete the `[sp_prot],` line from both SELECTs (the field is not surfaced anywhere else / not in the ORM model).
- **Or** add the column to the model so schema and queries agree — in `Backend/models/kpi_material.py` add `sp_prot = db.Column("sp_prot", db.String(255))` and include it in `BatchMaterials_Shadow`.
**Verify:** `GET /api/sqlserver/batch-materials?limit=3` → 200.
*(Environment note: on the freshly-created SQLEXPRESS DB the by-GUID query first tripped `TRY_CONVERT is not recognized`, which is a database-compatibility-level artifact of the test DB, not a code bug; the real defect is `sp_prot`.)*

---

## B6 — `GET /api/test` → 500 (SQLAlchemy 2.0) · Medium
**File:** `Backend/app.py:74`.
**Current code:**
```python
def test_db():
    try:
        db.session.execute('SELECT 1')
```
**Corrected code:**
```python
from sqlalchemy import text   # add near the top of app.py
...
def test_db():
    try:
        db.session.execute(text('SELECT 1'))
```
**Verify:** `GET /api/test` → `{"status":"Database connection successful"}`.

---

## B7 — Hardcoded DB credentials in PLC-map fallback · Medium
**File:** `Backend/routes/plc_routes.py:224` (inside `load_map_from_pg`).
**Current code:**
```python
import psycopg2
conn = psycopg2.connect('postgresql://postgres:Hercules@localhost:5432/Faikeh')
```
**Corrected code:** the literal DSN is the problem — it hardcodes host/port/password/DB and ignores config. Two valid fixes:
- **Preferred — drop the redundant fallback.** The primary path already runs `sql` through `_pg_rows()`, which uses the configured `plc` engine (`_engine_plc()`), so this raw-`psycopg2` block adds nothing but a wrong-credentials call. Remove the whole `except … psycopg2.connect('postgresql://postgres:Hercules@…')` fallback and let the original exception surface (or return the empty-map default).
- **Or, if a fallback is truly wanted,** build the DSN from `config`, never a literal:
  ```python
  from config import DB_USERNAME, DB_PASSWORD, DB_HOST, DB_PORT
  from urllib.parse import quote_plus
  dsn = f"postgresql://{DB_USERNAME}:{quote_plus(DB_PASSWORD)}@{DB_HOST}:{DB_PORT}/Faikeh"
  conn = psycopg2.connect(dsn)
  ```
Remove the literal password either way (secret-in-source). **Verify:** with the `db{n}_map` tables present the mapping loads; the boot log no longer shows `fallback error: ... port 5432 ... password authentication failed`.

---

## B8 — Frontend `npm run check` fails (39 errors; 7 non-existent imports) · Medium
**File:** `frontend-package/client/src/App.tsx:10-16`.
**Symptom (proof):** `npx tsc --noEmit` → 39 errors, starting with 7 × `TS2307: Cannot find module '@/pages/...'`.
**Current code (lines 10-16):**
```tsx
import NotFound from "@/pages/not-found";
import FacilityOverview from "@/pages/FacilityOverview";
import ProcessFlow from "@/pages/ProcessFlow";
import WaterQuality from "@/pages/WaterQuality";
import EnergyMonitoring from "@/pages/EnergyMonitoring";
import Maintenance from "@/pages/Maintenance";
import ChemicalDosing from "@/pages/ChemicalDosing";
```
None of these are used in JSX (the catch-all route uses an inline component), so **delete all 7 lines**. (This is why `vite build` and the dev server still work — esbuild tree-shakes them; only the `tsc` gate fails.)
**Remaining tsc errors to clear so `npm run check` passes** (from the same run):
- `OrderHistory.tsx` — `interface OrderData` (line 20) is missing fields it reads: add `sourceMaterialName?: string; destinationSilo1MaterialName?: string; destinationSilo2MaterialName?: string;` (the backend already returns these keys, so runtime is unaffected — this is types-only).
- `Dashboard.tsx` (763/785/956), `DashboardEditor.tsx` (281), `DashboardWidgets.tsx` (301) — the widget `displayMode` union is missing `"dual"`; add `"dual"` to the shared `Widget`/config type, or narrow the value.
- `ChartComponent.tsx` (65/92) — reading `.type` off a `ChartConfiguration` union; guard the type.
- `AiAssistant.tsx` (918) — `for…of` over a `Map` iterator: set `"target": "es2015"` (or higher) / `"downlevelIteration": true` in `tsconfig.json`, or use `Array.from(map.entries())`.
- `ProfessionalWidgetCanvas.tsx` (225) — assignment to a read-only `ref.current`; use a mutable ref or restructure.
**Verify:** `cd frontend-package && npx tsc --noEmit` → 0 errors; `npm run build` still succeeds.

---

## B9 — Every `APIError` response has an empty `message` · Medium
**File:** `Backend/utils/error_handler.py` — `APIError.__init__` (line 20 calls `super().__init__()` with no args) and `handle_api_error` (uses `str(error)`).
**Symptom (proof):**
```
POST /api/materials {"name":"x"} -> 400 {"error_code":"MISSING_FIELDS","message":""}
python: str(APIError("Intake order 1 not found",404,...)) == ''   while  .message == 'Intake order 1 not found'
```
**Fix (either is enough; do the first):**
`handle_api_error`, current:
```python
'message': str(error),
```
corrected:
```python
'message': getattr(error, 'message', None) or str(error) or 'Internal server error',
```
*(Optionally also add `def __str__(self): return self.message` to `APIError`.)*
**Verify:** `POST /api/materials {"name":"x"}` → `"message":"Missing required fields: code, type, unit"`.

---

## B10 — Boot requires BOTH databases reachable · High (verified)
**Files:** `Backend/models/kpi_material.py:8` (`__bind_key__ = "sqlserver"`) + `Backend/app.py:150` (`db.create_all()` touches every bind).
**Proof (isolated repro — Postgres healthy, SQL Server bind unreachable):**
```
db.create_all() -> OperationalError (pyodbc '08001' TCP Provider: The wait operation timed out)
```
So with the shipped remote SQL Server off-network, the app can't start **even for Postgres-only features**.
**Fix:** don't create the SQL Server table at boot. Options:
- Restrict boot creation to the default bind: replace `db.create_all()` with `db.create_all(bind_key=None)` (Flask-SQLAlchemy 3: creates only unbound/default-bind tables), leaving the read-only SQL Server table alone (it already exists in production).
- Or wrap the SQL-Server-bind creation in its own try/except so an unreachable reporting DB degrades the KPI pages instead of blocking startup.
**Verify:** stop/uncheck SQL Server, boot the app → it starts and Postgres features work; KPI endpoints return a clear error instead of the process dying.

---

## B11 — `api_debug.log` grew to 7.66 GB (no rotation) · Medium
**File:** `Backend/utils/error_handler.py:7-13`.
**Proof:** `Backend/api_debug.log` = 7,655,936,126 bytes (7.66 GB) and growing.
**Current code:**
```python
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api_debug.log'),
        logging.StreamHandler()
    ]
)
```
**Corrected code:**
```python
from logging.handlers import RotatingFileHandler
logging.basicConfig(
    level=logging.WARNING,   # INFO on every request is what filled 7.66 GB
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        RotatingFileHandler('api_debug.log', maxBytes=10_000_000, backupCount=3),
        logging.StreamHandler()
    ]
)
```
Then truncate the existing file (`: > Backend/api_debug.log`). Also add `api_debug.log` to `.gitignore` (currently not ignored). **Verify:** the file stops growing without bound and rotates at ~10 MB.

---

## B12 — `/api/dispatch` calls a hardcoded loopback URL · Low
**File:** `Backend/routes/plant_flow.py:14` (`PLC_BASE_URL = "http://localhost:5000"`), used at lines 248/261/272/283 which `requests.post(...)` then `r.json()`.
**Symptom (proof):** `POST /api/dispatch` → `502 {"error":"PLC call failed: Expecting value: line 1 column 1 (char 0)"}` when the backend is not on `:5000` (here `:5000` is a different service returning non-JSON).
**Fix:** call the PLC-write **functions in-process** instead of HTTP-calling itself. e.g. import `write_intake`, `write_outloading`, `write_bulk`, `write_pit` from `routes.plc_routes` and invoke them, or at minimum derive the base URL from the running server (`request.host_url`) / an env var `PLC_BASE_URL = os.getenv("PLC_BASE_URL", "http://localhost:5000")`.
**Verify (intended deployment):** with the backend on `:5000`, dispatch reaches the PLC-write route; independence from port after the in-process refactor.

---

## B13 — `GET /api/plc/debug/routes` → 500 · Low
**File:** `Backend/routes/plc_routes.py:2690`.
**Proof:** `AttributeError: 'Blueprint' object has no attribute 'url_map'`.
**Current code:**
```python
for rule in plc_bp.url_map.iter_rules():
```
**Corrected code:**
```python
from flask import current_app
...
for rule in current_app.url_map.iter_rules():
```
**Verify:** `GET /api/plc/debug/routes` → 200 with the route list.

---

## B14 — Duplicate `/api/plc/health` route · Low
**File:** `Backend/routes/plc_routes.py` — `@plc_bp.route("/health")` at **:1155** (`def plc_health`) and again at **:2577** (`def health(): return db_health(DEFAULT_DB)`).
**Effect:** Flask keeps the first for dispatch; the second is dead code.
**Fix:** delete the `:2577` `@plc_bp.route("/health")` + `def health()` (keep `plc_health`). **Verify:** `/api/plc/health` still 200; no duplicate rule in `current_app.url_map`.

---

## B15 — `POST /api/ingestion/ingest-now` hangs when PLC is unreachable · Low
**File:** `Backend/routes/data_ingestion.py` — `ingest_now()` calls `fetch_plant_orders_snapshot()` synchronously.
**Symptom (proof):** no response within 20s when the PLC is absent (first snap7 connect blocks for the TCP timeout before the "absent" cooldown applies).
**Fix:** bound the PLC read (snap7 connection timeout) or short-circuit when the PLC is known-absent (`_absent_now`) before attempting a full snapshot; return 202/quick status instead of blocking the request worker. **Verify:** the endpoint returns promptly (success or a "PLC unavailable" note) with no PLC present.

---

## B16 — Dead unregistered blueprint · Low
**File:** `Backend/routes/local_batch_routes.py` (defines `local_batch_bp`) — never imported/registered in `Backend/app.py` (0 references).
**Fix:** register it in `app.py` if its endpoints are wanted, else delete the file. (The `Backend/` tree also holds many `_ro_*.py` / `_watch_*.py` investigation scripts and a `nfm_clone_package/`, `fix_package/` — dev cruft worth pruning.) **Verify:** intended endpoints reachable, or the file removed with no import errors (`python -c "import app"`).

---

## What was verified WORKING (regression baseline)

All returned 2xx with live data unless noted:
- **Infra:** `/api/health`, `/api/plc/info`, `/api/plc/health`, `/api/websocket/status`, `/api/plc/test-simple`, `/api/plc/orders`, `/api/plc/db/1/probe|health|orders`, `/api/plc/db/4/orders`.
- **CRUD + single GET:** materials, production, trucks, drivers (+status/+truck), clients, RFID tags, RFID config — POST/GET/PUT/DELETE.
- **Orders read:** intake1/2, mineral, outload1/2/3, bulk, pt, active, completed, history, stats, test.
- **Truck-entry weigh flow:** create → first → second (net computed); open/today/by-truck; scales.
- **Legacy plant flow:** `/api/weigh/in`, `/api/rfid/log`, `/api/weigh/out`.
- **RFID:** `/api/rfid/config/assign`, `/api/rfid/simulate/seed|ping`, `/api/rfid/available`.
- **Queue:** enqueue (201), list, cancel (200).
- **SQL Server reporting (1000 rows):** `/api/kpi`, `/api/reports`, `/api/reports/product-summary`, `/api/kpi/csv-format-report`, `/api/filter-options`, `/api/kpi/dashboard-analytics`, `/api/kpi_calendar` (+details, +product-summary), `batch-materials/count`, `test-connection`, hourly/weekly counts.
- **Postgres reports + config:** daily/weekly/monthly/detailed/material CRUD, config tabs/columns/values CRUD, bulk daily, exports (daily/weekly/monthly/detailed/material), stats summary.
- **Distribution engine:** rules CRUD + **Run now** wrote a real CSV to disk; report catalog; folder browser.
- **AI live monitor:** `/api/ai/live/state` + `control`; `/api/ai/health`, `ml/info`, `severity/info`, `history`.
- **Validation (all correct):** 400 missing/duplicate/invalid, 404 unknown id, 409 duplicate open weigh order, 400 invalid email/report type.
- **Frontend:** `vite build` succeeds (2995 modules); dev server renders the Fakieh dashboard + batch calendar in-browser; `/api` proxy + assets/logos work against a live backend.

---

## Suggested fix order
1. Small, user-facing: **B6**, **B2**, **B5**, **B9**, **B13**.
2. Predictive AI down: **B3**.
3. Hang prevention: **B4**, **B15**.
4. Boot & config resilience: **B1**, **B10**, **B7**.
5. Hygiene: **B11**, **B12**, **B8**, **B14**, **B16**.

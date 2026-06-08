# Backend performance rollout — change log and reference

This document describes the performance-related updates applied to the Fakieh backend (SQL Server KPI routes, pooled ODBC usage, Postgres reports, connection pooling, websocket connect behavior, paginated small APIs, and background silo sync). It is meant for operators and developers maintaining deployments.

---

## 1. Configuration and environment variables

**File:** `Backend/config.py`

### PostgreSQL (default bind)

| Variable | Default (if unset) | Purpose |
|----------|-------------------|---------|
| `DB_USERNAME` | `postgres` | DB user |
| `DB_PASSWORD` | *(legacy dev default in repo)* | Password; URL-encoded via `quote_plus` in URI |
| `DB_HOST` | `localhost` | Host |
| `DB_PORT` | `5432` | Port |

`SQLALCHEMY_DATABASE_URI` is built from the above. **Production:** set real credentials via environment; do not rely on code defaults.

### SQL Server (ODBC bind `sqlserver`)

| Variable | Purpose |
|----------|---------|
| `SQLSERVER_USER` | SQL login |
| `SQLSERVER_PASSWORD` | Password (embedded in ODBC string, not URL-encoded as URI) |
| `SQLSERVER_SERVER` | Instance / host |
| `SQLSERVER_DATABASE` | Database name |

`SQLALCHEMY_BINDS["sqlserver"]` uses `mssql+pyodbc` with the full ODBC connect string.

### SQLAlchemy engine pool (all engines)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SQLALCHEMY_POOL_PRE_PING` | `true` | Health check before checkout |
| `SQLALCHEMY_POOL_RECYCLE` | `280` | Recycle connections (seconds) |
| `SQLALCHEMY_POOL_SIZE` | `5` | Pool size |
| `SQLALCHEMY_MAX_OVERFLOW` | `10` | Extra connections beyond pool size |

These populate `SQLALCHEMY_ENGINE_OPTIONS` in `config.py`.

### PLC / websocket (related tuning)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PLC_POLL_INTERVAL` | `0.5` | PLC polling interval (see `plc_routes`, `websocket_routes`) |
| `PLC_ORDERS_CACHE_TTL_SEC` | `1.25` | Plant orders HTTP cache TTL |
| `WS_CONNECT_SILO_PERSIST_MIN_SEC` | `20` | Minimum seconds between silo collect+persist on each websocket `connect` |

### KPI (SQL Server BatchMaterials list APIs)

| Variable | Default | Purpose |
|----------|---------|---------|
| `KPI_DEFAULT_LIMIT` | `5000` | Default page size when `limit` omitted |
| `KPI_MAX_LIMIT` | `10000` | Hard clamp for `limit` (absolute cap in code also bounds at 50000) |

### Postgres reports (`/api/reports/*`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `REPORTS_LIST_DEFAULT` | `5000` | Default `limit` for list GETs |
| `REPORTS_LIST_MAX` | `10000` | Max `limit` for list GETs |
| `REPORTS_EXPORT_MAX` | `25000` | Max rows per export request |

### Small list routes

| Variable | Default | Routes |
|----------|---------|--------|
| `MATERIAL_LIST_DEFAULT` / `MATERIAL_LIST_MAX` | `500` / `2000` | `GET /api/materials` |
| `PRODUCTION_LIST_DEFAULT` / `PRODUCTION_LIST_MAX` | `500` / `2000` | Production list GET |
| `TRUCK_LIST_DEFAULT` / `TRUCK_LIST_MAX` | `500` / `2000` | Truck-related list GETs |
| `RFID_LIST_DEFAULT` / `RFID_LIST_MAX` | `500` / `2000` | RFID tags/config list GETs |

### Deployment note

`/.github/workflows/deploy.yml` does **not** inject secrets; configure NSSM / Windows service environment (or `.env` loader if you use one) for production values.

---

## 2. KPI and BatchMaterials routes (`kpi_material_routes.py`)

**Blueprint:** `kpi_material_bp` is registered with **`url_prefix='/api'`** in `app.py`, so KPI paths are:

- `GET /api/kpi`
- `GET /api/reports` (KPI batch report; not the Postgres blueprint under `/api/reports/...`)
- `GET /api/kpi/csv-format-report`
- `GET /api/filter-options`
- `GET /api/kpi/dashboard-analytics`

### Contract summary (docstring + behavior)

- **`limit`:** Clamped to `[1, KPI_MAX_LIMIT]`; default from `KPI_DEFAULT_LIMIT` when omitted or invalid.
- **`includeTotal`:** Default `true`. When `true`, uses Flask-SQLAlchemy `paginate()` (includes `total`, `pages`). When `false`, skips global `COUNT`, fetches `limit + 1` rows, returns `has_more` and optional `nextCursor`.
- **`cursor`:** Opaque URL-safe base64 JSON token from prior response `nextCursor`. When present:
  - **Keyseek** path applies (lexicographic filter after last row).
  - **`page` is not used** for positioning (response may still echo synthetic `page: 1`).
- **Product placeholder filter:** `product_not_selected_clause()` in `utils/kpi_pagination.py` — non-null trimmed product, excludes `lower(trim(product)) = 'not selected'`.

### Endpoints

| Method | Path | Sort order | Keyset cursor kind |
|--------|------|------------|-------------------|
| GET | `/kpi` | `batch_transfer_time` ASC | Transfer time + PK tie-break |
| GET | `/reports` (KPI batch report) | `batch_act_start` ASC | Act start + PK tie-break |
| GET | `/kpi/csv-format-report` | `batch_transfer_time` DESC | DESC semantics (`d: 1` in payload) |

### JSON shape (list endpoints)

Top-level object:

```json
{
  "data": [ /* row objects */ ],
  "page": 1,
  "pages": 10,
  "total": 9500,
  "has_more": true,
  "nextCursor": "..."
}
```

When `includeTotal=false` or keyset mode without full count: `total` and `pages` may be `null`.

Row keys for `/kpi` include human-readable names such as `Batch GUID`, `Batch Transfer Time`, `Material Name`, `OrderId`, etc. (`_row_to_kpi_dict`).

### `/filter-options`

Implemented as **one** SQL round-trip against the `sqlserver` engine (`sqlalchemy.text`), replacing three separate `with_entities(...).all()` calls.

### `/kpi/dashboard-analytics`

Heavy aggregation no longer uses `query.all()`. **`utils/dashboard_kpi_stream.py`** runs the filtered query with `stream_results` and `yield_per`, computing the same dashboard payload in a **single streamed pass** over rows.

---

## 3. KPI pagination helpers (`utils/kpi_pagination.py`)

Responsibilities:

- `clamp_kpi_limit`, `kpi_default_limit`, `kpi_max_limit`
- `parse_include_total`
- `product_not_selected_clause(model_cls)`
- Cursor encode/decode: `_encode_cursor` / `_decode_cursor`, `parse_cursor_token`
- Builders: `build_next_cursor_asc`, `build_next_cursor_act_start_asc`, `build_next_cursor_transfer_desc`
- SQLAlchemy filter fragments: `keyset_filter_transfer_time_asc`, `keyset_filter_act_start_asc`, `keyset_filter_transfer_time_desc` (and related parsing helpers for datetime/GUID/string columns)

**Stability:** Composite uniqueness aligns with model fields: `Batch GUID`, `OrderId`, `Material Name`, `Batch Act Start` (see `models/kpi_material.py`).

---

## 4. Generic SQL Server routes (`routes/sqlserver_routes.py`)

- **Connection:** `db.get_engine(bind="sqlserver")` and `with engine.connect() as connection` — pooled connections instead of raw `pyodbc.connect` per request.
- **`GET /api/sqlserver/batch-materials`:** Uses `ORDER BY` + `OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY` so the `offset` query parameter affects the result set. `limit` is capped (e.g. 1000).
- **GUID lookup routes:** Use `TRY_CONVERT(uniqueidentifier, :param)` where applicable for safe parsing.

---

## 5. Postgres reports (`routes/reports.py`)

### List GET handlers (daily, weekly, monthly, detailed, material)

- Query params: **`limit`** (default `REPORTS_LIST_DEFAULT`, max `REPORTS_LIST_MAX`), **`offset`** (default `0`).
- Response envelope:

```json
{
  "items": [ /* report.to_dict() */ ],
  "total": 12345,
  "limit": 5000,
  "offset": 0,
  "has_more": true
}
```

- **Breaking change vs old behavior:** responses are **no longer a bare JSON array**; clients must read `items` (or use a normalizer on the frontend).

### `GET /api/reports/stats/summary`

- The five table counts are fetched in **one** SQL round-trip via a `text()` query with scalar subqueries.

### `GET /api/reports/export/<report_type>`

- **Bounded export:** `limit` (capped by `REPORTS_EXPORT_MAX`), `offset`, optional date filters per report type.
- Returns JSON:

```json
{
  "items": [ /* ... */ ],
  "limit": 5000,
  "offset": 0,
  "has_more": true
}
```

Avoids unbounded `.all()` on large tables.

---

## 6. Material, production, truck, RFID list routes

### Materials (`material_routes.py`)

`GET /api/materials` returns `create_success_response` with `data`:

```json
{
  "items": [ /* Material.to_dict() */ ],
  "total": 100,
  "limit": 500,
  "offset": 0,
  "has_more": false
}
```

### Production (`production_routes.py`)

Same pattern: paginated list inside success `data` with `items`, `total`, `limit`, `offset`, `has_more`.

### Trucks (`truck_routes.py`)

List endpoints return a JSON object with `items`, `total`, `limit`, `offset`, `has_more` (including filtered driver/truck listings where implemented).

### RFID (`rfid_routes.py`)

Tag and config list GETs use the same pagination envelope and env caps.

---

## 7. WebSocket connect path (`routes/websocket_routes.py`)

On `connect`:

- Still sends initial PLC/plant orders via `fetch_plant_orders_snapshot()`.
- **`collect_all_silos()` + `persist_silos()`** run at most once per **`WS_CONNECT_SILO_PERSIST_MIN_SEC`** globally (thread-safe lock + timestamp), reducing duplicate PLC/DB work when many tabs connect.

---

## 8. Background silo sync (`background_sync.py`, `app.py`)

- **`SiloSyncTask`** accepts optional **`flask_app`**.
- When `start_silo_sync(app)` is called with the Flask app, **`_sync_once`** runs **`persist_silos_from_plc`** inside `app.app_context()` for DB numbers 1–3 — **no HTTP loopback** to `/api/plc/silos/sync`.
- If `flask_app` is not set, behavior falls back to HTTP `POST` to `base_url`.

`Backend/app.py` calls `start_silo_sync(app)` after app setup so in-process sync is used when the app starts the background thread.

---

## 9. Optional SQL Server DDL (`scripts/sqlserver_batchmaterials_indexes.sql`)

Commented template for nonclustered indexes on `dbo.BatchMaterials` (e.g. `Batch Transfer Time`, `Batch Act Start` with INCLUDE columns). **Not executed by Flask.** Review execution plans, then uncomment and run in SSMS during a maintenance window.

---

## 10. Operational checklist

1. Set **`DB_*`** and **`SQLSERVER_*`** in production service environment.
2. Tune **`SQLALCHEMY_POOL_*`** if you see pool exhaustion or long-lived connection drops behind firewalls.
3. If UIs need “download everything,” use **`includeTotal=false`** + **`cursor`** / **`nextCursor`** (or bounded export on Postgres) instead of a single huge `limit`.
4. Capture **actual execution plans** in SSMS for `/kpi`, `/filter-options`, and dashboard date ranges after enabling indexes.
5. External apps (e.g. other frontends under `Khamis/`) that call the same KPI URLs must be updated for new defaults and response fields.

---

## 11. File index (backend)

| Area | Files |
|------|--------|
| Config / pool | `Backend/config.py` |
| KPI routes | `Backend/routes/kpi_material_routes.py` |
| KPI helpers | `Backend/utils/kpi_pagination.py`, `Backend/utils/dashboard_kpi_stream.py` |
| KPI model | `Backend/models/kpi_material.py` |
| SQL Server misc API | `Backend/routes/sqlserver_routes.py` |
| Postgres reports | `Backend/routes/reports.py` |
| Lists | `Backend/routes/material_routes.py`, `production_routes.py`, `truck_routes.py`, `rfid_routes.py` |
| WebSocket | `Backend/routes/websocket_routes.py` |
| Background | `Backend/background_sync.py`, `Backend/app.py` |
| Indexes (manual) | `Backend/scripts/sqlserver_batchmaterials_indexes.sql` |

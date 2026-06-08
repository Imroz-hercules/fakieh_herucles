# Order completion and PLC monitoring

This document describes how the Fakieh backend monitors PLC **status words**, treats an order as **complete**, which **Siemens S7 data blocks (DB)** and **byte offsets** are involved, and which **PostgreSQL** databases are used. It reflects the implementation in `Backend/routes/plc_routes.py`, `Backend/routes/data_ingestion.py`, `Backend/routes/websocket_routes.py`, `Backend/routes/orders_history_routes.py`, `Backend/routes/orders_sink.py`, `Backend/models/orders.py`, and `Backend/config.py` as of the current repository state.

---

## 1. PLC connection (IP, rack, slot)

Communication uses **python-snap7** (`snap7.client.Client`).

| Setting | Source | Default (if env unset) |
|--------|--------|-------------------------|
| **IP** | `PLC_IP` env → else `Backend/config.json` → else code default | `192.168.0.100` |
| **Rack** | `PLC_RACK` env → else config | `0` |
| **Slot** | `PLC_SLOT` env → else config | `3` |

- Merged configuration is loaded in `plc_routes.py` from `DEFAULT_CONFIG` and optional `Backend/config.json`.
- At runtime the resolved values are exposed on **`GET /api/plc/info`** as JSON (`plc.ip`, `plc.rack`, `plc.slot`).

**Connect call (conceptually):** `Client().connect(PLC_IP, PLC_RACK, PLC_SLOT)`.

---

## 2. “PLC DB” vs “Postgres DB” (naming)

- **Siemens DB numbers** (`db_read` / `db_write`): **DB1, DB2, DB3, DB4** — these are **PLC memory blocks**, not PostgreSQL schemas.
- **PostgreSQL**:
  - **`Faikeh`** — main application database (orders, silo cache, etc.). URI: `postgresql+psycopg2://...@.../Faikeh` in `Backend/config.py`.
  - **`plc`** — SQLAlchemy **bind** `SQLALCHEMY_BINDS["plc"]` … `/plc` — used for **tag mapping tables** `db1_map`, `db4_map`, `dbN_map` when mappings are not hardcoded.

---

## 3. How plant orders are read (single snapshot)

The function **`fetch_plant_orders_snapshot()`** (in `plc_routes.py`) runs under a lock and calls **`_execute_plant_orders()`**, which:

1. Reads **DB1** → regular **intake** (lines **1** and **2** only in code; mineral destinations 401–408 are split out as “legacy mineral”).
2. Reads **DB3** → **mineral** intake as **line 3** (`_intake_row(..., 3)`).
3. Merges DB3 mineral with legacy mineral from DB1 → payload key **`mineral`** (each still handled as intake in the DB layer).
4. Reads **DB2** → **outloading** lines **1, 2, 3**.
5. Reads **DB4** → single **`bulk`** object and single **`pit`** object (tags grouped by name prefixes).

After building the payload, **`handle_order_status(...)`** is invoked for:

- each **`intake`** row → `IntakeOrder`, type `"intake"`
- each **`outloading`** row → `OutloadingOrder`, type `"outloading"`
- **`bulk`** (if present) → `BulkLineOrder`, type `"bulk"`
- **`pit`** (if present) → `PTLineOrder`, type `"pit"`
- each **`mineral`** row → `IntakeOrder`, type `"intake"`

So **every** snapshot refresh re-evaluates status words and lifecycle state for all those streams.

---

## 3.1 Performance & consistency fixes (what was fixed and where)

These changes reduce duplicate PLC work, protect in-memory lifecycle state, cut log noise in production, and make order-history queries scalable.

| What we fixed | Where (file) | What changed |
|---------------|--------------|--------------|
| **Duplicate PLC + lifecycle** when HTTP and WebSocket both polled | `Backend/routes/plc_routes.py` | **`_execute_plant_orders()`** holds all PLC read + **`handle_order_status`** logic. **`fetch_plant_orders_snapshot()`** runs it inside **`_ORDERS_SNAPSHOT_LOCK`** and updates **`_LAST_ORDERS_PAYLOAD`** / **`_LAST_ORDERS_TS`**. |
| **HTTP serving cached snapshot** while broadcast is on | `Backend/routes/plc_routes.py` | `GET /api/plc/plant/orders` (`plant_orders`): if `app.config["PLC_BROADCAST_ACTIVE"]` is true and the snapshot is newer than `PLC_ORDERS_CACHE_TTL_SEC` (default **1.25** s), returns a deep copy of the cache (no extra PLC read). Query `?nocache=1` forces a fresh `_execute_plant_orders()` run. |
| **Broadcast / connect / ingestion** all use the same snapshot path | `Backend/routes/websocket_routes.py`, `Backend/routes/data_ingestion.py` | **`fetch_plant_orders_snapshot()`** replaces calling **`plant_orders()`** + **`get_json()`** so the worker and ingestion always refresh the shared snapshot under the same lock as lifecycle state. |
| **Runtime flag for “broadcast owns polling”** | `Backend/routes/websocket_routes.py`, `Backend/config.py` | **`POST .../start-broadcast`** sets **`app.config["PLC_BROADCAST_ACTIVE"] = True`**; **`stop-broadcast`** sets **`False`**. Defaults: **`PLC_POLL_INTERVAL`**, **`PLC_ORDERS_CACHE_TTL_SEC`**, **`PLC_BROADCAST_ACTIVE`** live on the Flask config object (see `config.py`). |
| **Hot-path log spam** | `Backend/routes/plc_routes.py` | Verbose **`print`** in **`handle_order_status`**, lifecycle helpers, and **`_execute_plant_orders`** gated behind **`_vlog()`**; enabled only when **`PLC_VERBOSE_LOGS`** is **`1`**, **`true`**, or **`yes`**. **`[ERROR]`** lines for lifecycle/DB failures remain always printed. |
| **Concurrency on lifecycle buffers** | `Backend/routes/plc_routes.py` | **`_ORDERS_SNAPSHOT_LOCK`** (re-entrant **`RLock`**) serializes **`_execute_plant_orders`** and cache updates so the broadcast thread and HTTP cannot corrupt **`_order_timestamps_buffer`** / **`_order_lifecycle_tracker`** in parallel. |
| **Order history: full-table scans** | `Backend/routes/orders_history_routes.py` | **`/api/orders/active`**, **`/completed`**, **`/history`**: query params **`limit`** (default **100**, max **500**) and **`offset`** (default **0**) applied **per category** (intake, outloading, bulk, pit). Response includes **`pagination`** with **`has_more`** per type. |
| **Order stats: many `.count()` calls** | `Backend/routes/orders_history_routes.py` | **`/api/orders/stats`**: one aggregated query per table (**`COUNT`** + conditional sums for active vs completed) via **`sqlalchemy.func`** / **`case`**. |
| **DB indexes for history filters** | `Backend/models/orders.py` | **`Index`** on **`(is_complete, finished_at)`** and **`created_at`** for **`intake_orders`**, **`outloading_orders`**, **`bulk_line_orders`**, **`pt_line_orders`**. **Note:** existing PostgreSQL DBs do not auto-add indexes from **`db.create_all()`**; run equivalent **`CREATE INDEX`** (or a migration) on deployed databases. |

---

## 4. Status word values (PLC → app)

Central map **`STATUS_MAP`** in `plc_routes.py`:

| Code | Label | Kind |
|-----:|-------|------|
| 0 | No Status | inactive |
| 1 | Idle | idle |
| 2 | Starting | active |
| 6 | Running | active |
| 8 | Stopping | warn |
| 12 | Completed | success |

Intake/outloading rows expose `status_word: { code, label, kind }` from the tag **`L{line}_StatusWord`** (see offsets below for DB2/DB3).

Bulk uses tag **`BulkLine_Status`**; pit uses **`PitLine_Status`** (offsets come from **`db4_map`** in Postgres `plc`, not hardcoded in this repo).

---

## 5. Order “complete” / persistence logic (`handle_order_status`)

This is **separate** from the optional **`persist_orders()`** cycle in `orders_sink.py` (used by the ingestion worker). The **primary** “completed order with lifecycle timestamps” path is:

### 5.1 Timestamp buffer (`_order_timestamps_buffer`)

- **Status 1 (Idle):** first time → record **`created_at`**; always calls **`_store_completed_order_if_ready`** (to flush a cycle that already saw stop/complete).
- **Statuses 2–7:** record **`started_at`** once (treated as running / progress).
- **Status 8 or 12:** record **`finished_at`** and call **`_mark_order_ready_for_storage`** → sets **`_order_lifecycle_tracker[order_key].ready_for_storage = True`**.

`order_key` = `{order_type}_{badge}_{dest1}_{dest2}` (badge is `badge_no` for intake/outloading, **`source_silo`** for bulk, **`pit_no`** for pit).

### 5.2 Persisting a finished order

When status returns to **1** and the tracker has **`ready_for_storage`**, **`_store_complete_order_if_ready`** calls **`_store_complete_order_with_lifecycle`**, which inserts/updates via SQLAlchemy models with lifecycle fields (`created_at`, `started_at`, `finished_at`, `idle_at`, **`is_complete=True`**, etc., depending on model).

**Important:** `handle_order_status` **returns early** if the derived **`badge`** is empty or `"0"` — so bulk/pit need a non-empty identifier field or lifecycle storage is skipped.

### 5.3 Why polling speed matters

Status **8** may only be visible on the PLC for a **short window**. Comments in `websocket_routes.py` recommend **fast polling** (default **`PLC_POLL_INTERVAL`** = **0.5 s** in `Backend/config.py`) so snapshots taken inside `fetch_plant_orders_snapshot()` are likely to observe code **8** or **12** before the PLC returns to **1**.

---

## 6. Two ways data hits PostgreSQL `Faikeh`

| Path | Trigger | Orders persisted? |
|------|---------|-------------------|
| **WebSocket broadcast** | `POST /api/websocket/start-broadcast` → `broadcast_worker` | **`persist_orders()` is commented out**; **`fetch_plant_orders_snapshot()`** still runs → **`handle_order_status`** still runs → **lifecycle completion rows** can be written. Silos: **`persist_silos`**. |
| **Ingestion worker** | `POST /api/ingestion/start` → `ingestion_worker` | Calls **`fetch_plant_orders_snapshot()`** then **`persist_orders()`** (streaming row upsert logic) **and** silo persist. **`handle_order_status`** already ran inside the snapshot. |

So both paths **read the PLC** through the same snapshot function; only ingestion additionally runs **`persist_orders`** for the alternate “open row on idle 1, update through 2–6–8” behavior.

---

## 7. Siemens DB read size

For each PLC DB number `N`, the code loads a map `m = load_map_from_pg(N)`, then reads **`read_db_bytes(N, _needed_bytes(m))`** where **`_needed_bytes`** ≈ `max(32, max_byte + 8)` for large DBs (`max_byte` from mapping). That single buffer is decoded for all tags in that DB.

---

## 8. Tag → byte offsets (hardcoded mappings)

### 8.1 DB3 — Mineral intake (line 3 only in `_execute_plant_orders`)

| Tag name | Type | Byte offset (start) | Notes |
|----------|------|---------------------|--------|
| `L3_BadgeNo` | INT | 0 | |
| `L3_SourceRawMaterialCode` | STRING[16] | 2 | max length 16 |
| `L3_DeclaredQuantity_KG` | REAL | 20 | |
| `L3_DestinationSilo1` | INT | 24 | |
| `L3_DestinationSilo2` | INT | 26 | |
| `L3_StatusWord` | **INT** | **454** | **Primary status for mineral line** |
| Silos 401–408 | string pairs + HL/lock | 28–445 | `silo_meta` / `hl_map` in code |

**`max_byte`** for DB3 mapping: **460**.

### 8.2 DB2 — Outloading lines 1–3 + silos 801–848

**Read-only / live status (high address range):**

| Tag | Type | Byte offset |
|-----|------|-------------|
| `L1_RFID_BadgeReading` | REAL | 2598 |
| `L1_ActiveBadge` | INT | 2602 |
| `L1_ActiveDestination` | INT | 2604 |
| `L1_StatusWord` | **INT** | **2606** |
| `L1_ACTIVE_DEST_SEL` | INT | 2608 |
| `L2_RFID_BadgeReading` | REAL | 2610 |
| `L2_ActiveBadge` | INT | 2614 |
| `L2_ActiveDestination` | INT | 2616 |
| `L2_StatusWord` | **INT** | **2618** |
| `L2_ACTIVE_DEST_SEL` | INT | 2620 |
| `L3_RFID_BadgeReading` | REAL | 2622 |
| `L3_ActiveBadge` | INT | 2626 |
| `L3_ActiveDestination` | INT | 2628 |
| `L3_StatusWord` | **INT** | **2630** |
| `L3_ACTIVE_DEST_SEL` | INT | 2632 |

**Write-side / order fields (lower addresses):** e.g. `L1_BadgeNo` @ 0, `L1_SourceRawMaterialCode` @ 2, … through `L3_DestinationSilo2` @ 88 — see `load_map_from_pg(2)` in `plc_routes.py` for the full list.

**Destination selection (`DEST_SEL`) — write on order create (INT):**

| Line | Tag | Byte offset | Values |
|------|-----|-------------|--------|
| 1 | `L1_DEST_SEL` | 20 | 0 = Bulk, 1 = Packing |
| 2 | `L2_DEST_SEL` | 50 | 0 = Bulk, 1 = Packing |
| 3 | `L3_DEST_SEL` | 80 | 0 = Bulk, 1 = Packing |

Frontend (`Orders.tsx`) sends `dest_sel` in the create-order API body; backend writes the tag above.

**800-series silos:** material `code`/`name` start at base **90** + **(silo_no − 801) × 52** bytes.

**HL/LOCK bits for 801–848:** start byte **2586** with **2 bits per silo** (HL then LOCK), computed in `hl_map`.

**Outloading UI silo picker (Orders page):** destination dropdown lists **high-tier silos 801–824** only. A high silo is hidden when its paired **low-tier** silo (`N + 24`, i.e. 825–848) has `hl_active` (low level active). High silos are **not** hidden by their own `hl_active`.

**`max_byte`** for DB2 mapping: **2640**.

### 8.3 DB1 — Regular intake (lines 1–2)

**Not hardcoded** in the repository. Offsets come from PostgreSQL database **`plc`**, table **`db1_map`** (columns: `tag_name`, `tag_type`, `byte_offset`, `bit_index`, `str_len`, `silo_no`, `category`), loaded by `load_map_from_pg(1)`.

Status tags are expected to follow the naming pattern **`L{line}_StatusWord`** for `_intake_row`.

### 8.4 DB4 — Bulk + pit

**Not hardcoded** here. Same mechanism: table **`db4_map`** on the **`plc`** Postgres bind.

Expected tag names include (from `_execute_plant_orders` / `db_orders`):

- Bulk: `BulkLine_Source_Silo`, `BulkLine_DEST_1`, `BulkLine_DEST_2`, `BulkLine_CC25_Sel`, `BulkLine_Weight_Quantity`, `BulkLine_Scale_Selection`, **`BulkLine_Status`**, plus `ActiveBulk_*`.
- Pit: `PitLine_Pit_Number`, `PitLine_RawMaterialCode`, `PitLine_DEST_1`, `PitLine_DEST_2`, `PitLine_Weight_Quantity`, `PitLine_Scale_Selection`, **`PitLine_Status`**, plus `ActivePit_*`.

---

## 9. Environment variables (quick reference)

| Variable | Role |
|----------|------|
| `PLC_IP`, `PLC_RACK`, `PLC_SLOT` | Override PLC TCP / S7 address |
| `PLC_DB` | Maps to `DEFAULT_DB` in app config (default **1**); not the per-block DB list |
| `PLC_VERBOSE_LOGS` | `1`/`true`/`yes` → verbose `handle_order_status` / lifecycle logs |
| `PLC_POLL_INTERVAL` | WebSocket broadcast interval (default **0.5** s) |
| `PLC_ORDERS_CACHE_TTL_SEC` | HTTP cache TTL for `/api/plc/plant/orders` when broadcast is active |
| `POLL_SEC` | Ingestion worker interval (default **1** s) |
| `ONLY_ON_CHANGES` | Ingestion: skip DB write if snapshot unchanged |
| `DEMO_MODE` | If true, PLC reads return synthetic buffers (no real PLC) |
| `READ_LEN` / `READ_LEN_CAP` | Optional cap on read length |
| `DB_ABSENT_COOLDOWN_SEC` | Cooldown after failed DB read |

Postgres credentials for **`Faikeh`** / **`plc`** binds default in `Backend/config.py` (`DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`); override via env only if your deployment wires that.

---

## 10. How to verify in production

1. **`GET /api/plc/info`** — confirms resolved **IP / rack / slot** and snap7 status.
2. **`GET /api/plc/plant/orders`** (or WebSocket `plc_data`) — live **`status_word.code`** per line/order.
3. **`GET /api/plc/db/<n>/health`** — confirms DB`n` buffer length and connectivity.
4. For **DB1/DB4 offsets**, inspect **`plc`** database tables **`db1_map`** / **`db4_map`** (or use `/api/plc/db/1/lines` and `/api/plc/db/4/orders` with a running app).

---

## 11. File map (implementation)

| Concern | Primary file |
|---------|----------------|
| PLC connect, read/write, maps, **`_execute_plant_orders`**, **`fetch_plant_orders_snapshot`**, HTTP **`plant_orders`**, **`handle_order_status`**, snapshot lock | `Backend/routes/plc_routes.py` |
| WebSocket polling + broadcast, **`PLC_BROADCAST_ACTIVE`** | `Backend/routes/websocket_routes.py` |
| Ingestion polling + **`persist_orders`** | `Backend/routes/data_ingestion.py` |
| Order history list/stats APIs, pagination | `Backend/routes/orders_history_routes.py` |
| SQLAlchemy order models + history indexes | `Backend/models/orders.py` |
| Alternate order row lifecycle (`persist_orders`) | `Backend/routes/orders_sink.py` |
| DB URIs, `plc` bind, **`PLC_POLL_INTERVAL`**, **`PLC_ORDERS_CACHE_TTL_SEC`**, **`PLC_BROADCAST_ACTIVE`** default | `Backend/config.py` |
| JSON defaults merged into PLC settings | `Backend/config.json` |

---

## 12. HTTP vs WebSocket for live orders (after the fixes)

- **WebSocket / broadcast** always calls **`fetch_plant_orders_snapshot()`** → one PLC + lifecycle pass per **`PLC_POLL_INTERVAL`**, cache updated.
- **HTTP `GET /api/plc/plant/orders`** while broadcast is **on** and cache is **fresh** → returns the last snapshot JSON only (no second PLC read).
- **HTTP with `?nocache=1`** or **broadcast off** → always runs a full snapshot (still under the lock when updating cache).

---

*This file is generated from the codebase for operators and integrators. If PLC addressing changes, update `load_map_from_pg` hardcoded branches and/or the `dbN_map` tables in Postgres `plc`, then update this document.*

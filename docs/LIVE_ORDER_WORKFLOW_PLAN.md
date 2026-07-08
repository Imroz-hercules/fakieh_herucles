# Live Order Workflow — Full Implementation Plan

**Status (July 2026):** Planning only. No code changed yet. This document is the authoritative spec for the multi‑order queue + RFID‑matched sequential dispatch feature.

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | DB migration: queue columns on the 4 order tables | Not started |
| 1 | Backend: enqueue endpoint (create `WAITING` rows, RFID lock) | Not started |
| 2 | Backend: dispatcher + RFID matching on line Idle | Not started |
| 3 | Backend: completion path updates row + releases RFID | Not started |
| 4 | Backend: queue read/cancel endpoints | Not started |
| 5 | Frontend: multi‑order create + Waiting Orders list | Not started |
| 6 | Polish, deploy migration, verification | Not started |

---

## 1. Goal (from requirements)

- Users can create **multiple orders at once** in Hercules (today: effectively one active order per PLC line).
- The **PLC processes only one order at a time** (per physical line). All other orders stay **Waiting**.
- When the current order **completes**, Hercules reads the **next RFID from the PLC**, matches it to a **waiting order**, and **auto‑starts** that order.
- Repeat **sequentially** until all waiting orders are done.
- An **RFID that is linked to an order must not be selectable for another order** until its linked order completes.

---

## 2. Current architecture (baseline — what exists today)

There is **no queue** and **no `Waiting` status** in the DB. An order lives in two places only:

1. **PLC line tags** — written at create time in `Backend/routes/plc_routes.py`
   (`create_order_comprehensive` → `_create_intake_order_comprehensive` / `_create_outloading_order_comprehensive` / `_create_bulk_order_comprehensive` / `_create_pit_order_comprehensive` → `write_intake` / `write_outloading` / etc.).
2. **A Postgres row written only AFTER completion**, by the status‑word state machine `handle_order_status` (`plc_routes.py:728`).

Key facts confirmed in code:

- Status values come from the PLC status word, `STATUS_MAP` (`plc_routes.py:550`):
  `0 No Status, 1 Idle, 2 Starting, 6 Running, 8 Stopping, 12 Completed`.
- Order rows are **not** inserted at create time. The create helpers explicitly skip storage
  (e.g. `_create_intake_order_comprehensive`, `plc_routes.py:2551`: *"Don't store in database immediately - let handle_order_status store when status becomes 8"*). Same note in `assign_rfid_and_push` (`plc_routes.py:1592`) and the commented‑out `db.session.add` in `Backend/routes/orders.py:284`.
- Completion path: `handle_order_status` (`plc_routes.py:728`) buffers timestamps and, on status 8/12, calls `_mark_order_ready_for_storage`; on the next Idle (status 1, line 766) it calls `_store_completed_order_if_ready`, which persists the row.
- The lifecycle state today is **in‑memory dicts** (`_order_lifecycle_tracker`, `_order_timestamps_buffer`, `_order_pending_metadata` at `plc_routes.py:799–805`) — **lost on restart**.
- RFID "assign" (`assign_rfid_and_push`, `plc_routes.py:1532`) writes an RFID number into `L{line}_BadgeNo`. Line is resolved by **string‑matching the order_ref** in `_resolve_target_for_order` (`plc_routes.py:1465`). There is **no scan → waiting‑order matching**.
- The PLC reports the physically scanned tag in `L{line}_RFID_BadgeReading` (read in `_intake_row`, `plc_routes.py:564`, stored as `rfid_badge_reading`).
- RFID availability bookkeeping already exists: `RFIDConfig.rfid_used` + `RFIDConfig.rfid_linked_to_order` (`Backend/models/rfid.py:33–34`).

### PLC line topology (one active order per line)

| Order type | PLC DB | Line(s) | Identifier field |
|------------|--------|---------|------------------|
| Intake | DB1 | 1, 2 | `badge_no` |
| Mineral intake | DB3 | 3 | `badge_no` |
| Outloading | DB2 | 1, 2, 3 | `badge_no` |
| Bulk | DB4 | Bulk | `source_silo` |
| PIT | DB4 | PIT | `pit_no` |

The queue must be maintained **per line**, because each line runs one order at a time independently.

---

## 3. Target architecture

```
┌───────────────────────┐   POST /orders/enqueue    ┌──────────────────────────────┐
│  Orders.tsx (create)  │ ─────────────────────────►│  enqueue_order()             │
│  multi-order + RFID    │                            │  → INSERT row (WAITING)      │
└───────────────────────┘                            │  → lock RFID (rfid_used=true)│
┌───────────────────────┐   GET /orders/queue        └──────────────┬───────────────┘
│  Waiting Orders list  │ ◄───────────────────────────────────────  │
└───────────────────────┘                                           ▼
                                            ┌──────────────────────────────────────┐
   PLC poll (~0.5s) → handle_order_status   │  intake/outloading/bulk/pt_orders      │
   line Idle (status 1)                     │  + queue_status, rfid_number, ...      │
        │                                   └──────────────────────────────────────┘
        ▼
   dispatch_next_waiting_order(line):
     read L{line}_RFID_BadgeReading  (scanned tag)
     find WAITING row for line where rfid_number == scanned
     write order tags to PLC  →  set row DISPATCHED
        │
        ▼  PLC runs (status 2..7) → row RUNNING
        ▼  PLC status 8/12 → row COMPLETED, release RFID (rfid_used=false)
        └─ line back to Idle → dispatch next matching WAITING order (repeat)
```

### Queue state machine

```
WAITING ──(dispatcher writes tags on Idle+RFID match)──► DISPATCHED
DISPATCHED ──(PLC status 2..7)──► RUNNING
RUNNING ──(PLC status 8/12, then Idle)──► COMPLETED   (RFID released)
WAITING/DISPATCHED ──(user cancel)──► CANCELLED         (RFID released)
```

Rules:
- At most **one** row per line in `DISPATCHED` or `RUNNING` at any time.
- A line only dispatches when its PLC status is **Idle (1)**.
- Only a `WAITING` row whose `rfid_number` **equals the scanned** `L{line}_RFID_BadgeReading` is dispatched.
- If no waiting order matches the scanned RFID → **leave idle + log** (do not start a random order).

---

## 4. Design decisions (defaults chosen)

1. **Restart safety — DB is source of truth.** The dispatcher reads `WAITING` rows directly from Postgres (not the in‑memory dicts). In‑memory buffers remain only for timestamp capture; the queue survives restarts.
2. **Match strictness — strict.** No RFID match ⇒ line stays idle and an entry is logged. No "start the oldest" fallback. (Configurable later via a flag if operations want it.)
3. **Row created at enqueue time.** This is the deliberate departure from the current "store only on completion" convention. The completion machine is changed to **UPDATE** the existing row instead of INSERT.
4. **Per‑line FIFO tie‑break.** If multiple waiting orders somehow share the same RFID for a line (shouldn't happen because of the RFID lock), pick lowest `queue_position` / oldest `created_at`.
5. **Ordering key.** `queue_position` is assigned per line at enqueue (max+1 for that line/status=WAITING). Used only for display + tie‑break; RFID match is the real selector.

---

## 5. Phase 0 — Database migration

New file: `Backend/migrations/add_order_queue_columns.sql`

```sql
-- Live Order Workflow: queue columns for sequential RFID-matched dispatch.
-- Applied to all four order tables.

-- intake_orders
ALTER TABLE public.intake_orders
  ADD COLUMN IF NOT EXISTS queue_status   VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  ADD COLUMN IF NOT EXISTS queue_position INTEGER,
  ADD COLUMN IF NOT EXISTS rfid_number    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dispatched_at  TIMESTAMP;

-- outloading_orders
ALTER TABLE public.outloading_orders
  ADD COLUMN IF NOT EXISTS queue_status   VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  ADD COLUMN IF NOT EXISTS queue_position INTEGER,
  ADD COLUMN IF NOT EXISTS rfid_number    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dispatched_at  TIMESTAMP;

-- bulk_line_orders
ALTER TABLE public.bulk_line_orders
  ADD COLUMN IF NOT EXISTS queue_status   VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  ADD COLUMN IF NOT EXISTS queue_position INTEGER,
  ADD COLUMN IF NOT EXISTS rfid_number    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dispatched_at  TIMESTAMP;

-- pt_line_orders
ALTER TABLE public.pt_line_orders
  ADD COLUMN IF NOT EXISTS queue_status   VARCHAR(20) NOT NULL DEFAULT 'WAITING',
  ADD COLUMN IF NOT EXISTS queue_position INTEGER,
  ADD COLUMN IF NOT EXISTS rfid_number    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dispatched_at  TIMESTAMP;

-- Fast dispatcher lookup: waiting orders per line, ordered.
CREATE INDEX IF NOT EXISTS ix_intake_queue      ON public.intake_orders      (line, queue_status, queue_position);
CREATE INDEX IF NOT EXISTS ix_outloading_queue  ON public.outloading_orders  (line, queue_status, queue_position);
CREATE INDEX IF NOT EXISTS ix_bulk_queue        ON public.bulk_line_orders   (queue_status, queue_position);
CREATE INDEX IF NOT EXISTS ix_pt_queue          ON public.pt_line_orders     (queue_status, queue_position);
```

> **Backfill note:** existing historical rows (already completed) get `queue_status='WAITING'` by default, which is wrong for history. Add a follow‑up UPDATE to set completed history rows to `COMPLETED`:
> ```sql
> UPDATE public.intake_orders     SET queue_status='COMPLETED' WHERE is_complete = TRUE;
> UPDATE public.outloading_orders SET queue_status='COMPLETED' WHERE is_complete = TRUE;
> UPDATE public.bulk_line_orders  SET queue_status='COMPLETED' WHERE is_complete = TRUE;
> UPDATE public.pt_line_orders    SET queue_status='COMPLETED' WHERE is_complete = TRUE;
> ```

### Model changes — `Backend/models/orders.py`

Add to **each** of `IntakeOrder`, `OutloadingOrder`, `BulkLineOrder`, `PTLineOrder`:

```python
# 🔹 Live queue lifecycle
queue_status   = db.Column(db.String(20), nullable=False, default="WAITING")  # WAITING|DISPATCHED|RUNNING|COMPLETED|CANCELLED
queue_position = db.Column(db.Integer, nullable=True)
rfid_number    = db.Column(db.String(50), nullable=True)
dispatched_at  = db.Column(db.DateTime, nullable=True)
```

Extend each `to_dict()` to expose `queueStatus`, `queuePosition`, `rfidNumber`, `dispatchedAt`.

---

## 6. Phase 1 — Enqueue endpoint (create WAITING rows + RFID lock)

New endpoint in `Backend/routes/plc_routes.py` (keeps PLC + RFID logic co‑located):

```
POST /api/plc/orders/enqueue
```

Body (superset of today's `/orders/create` body + `rfid_number`):
```json
{
  "order_type": "intake",           // intake | outloading | bulk | pit
  "line": 1,                         // required for intake/outloading
  "rfid_number": "1024",            // REQUIRED for intake/outloading/mineral
  "badge_no": "...",
  "material_code": "...",
  "declared_qty_kg": 5000,
  "dest1": 101, "dest2": 0,
  "dest_sel": 0,                     // outloading only
  "truck_id": 12, "client_id": 3
}
```

Logic (`enqueue_order()`):
1. Validate `order_type` (+ `line` for intake/outloading, `rfid_number` for RFID‑matched types).
2. **RFID lock check** (reuse logic from `assign_rfid_and_push`, `plc_routes.py:1562–1569`):
   - `cfg = RFIDConfig.query.filter_by(rfid_number=rfid).first()`; create if missing.
   - If `cfg.rfid_used` and linked to a different order ⇒ **409 "RFID already in use"**.
3. Compute `queue_position` = `max(queue_position)+1` for that line where `queue_status='WAITING'` (or `1`).
4. **INSERT** an order row with `queue_status='WAITING'`, `rfid_number=rfid`, `status_word='WAITING'`, `line`, all order fields, `truck_id`/`client_id`. Do **NOT** write to the PLC here.
5. Mark RFID locked: `cfg.rfid_used = True`, `cfg.rfid_linked_to_order = <order id/ref>`. Commit.
6. Log an `RFIDLog` (`sent_to_plc=False`, note "enqueued").
7. Return the created row (`to_dict()`).

> Note: this bypasses the DEMO_MODE/snap7 guard for enqueue (no PLC needed to enqueue). The PLC write happens later in the dispatcher.

---

## 7. Phase 2 — Dispatcher + RFID matching (the heart)

New function in `Backend/routes/plc_routes.py`:

```python
def dispatch_next_waiting_order(order_type: str, db_no: int, line: int, m) -> bool:
    """
    Called when a PLC line is Idle. Reads the scanned RFID from the PLC and,
    if it matches a WAITING order for this line, writes that order's tags to
    the PLC and flips it to DISPATCHED. Returns True if an order was dispatched.
    """
```

Steps:
1. **Guard**: if any row for this line is `DISPATCHED` or `RUNNING`, return (line still busy from the queue's POV).
2. **Read scanned tag**: `scanned = read L{line}_RFID_BadgeReading` (same decode path as `_intake_row`, `plc_routes.py:564`). Normalize to string (it's a REAL, so cast to int→str).
3. If `scanned` is empty/`0` → return (no truck present yet).
4. **Match**: query the model for `queue_status='WAITING'`, `line=<line>`, `rfid_number=scanned`, ordered by `queue_position, created_at`, `LIMIT 1`.
5. If none → log `"[DISPATCH] line {line}: scanned RFID {scanned} matches no waiting order"` and return (strict mode).
6. **Write tags to PLC**: reuse the exact `kvs` mapping used by `_create_intake_order_comprehensive` (`plc_routes.py:2534`) / `_create_outloading_order_comprehensive` (`plc_routes.py:2597`) / bulk / pit. Factor that mapping into a shared helper `_order_kvs(order_type, line, row)` so create and dispatch stay in sync.
7. On success: set `queue_status='DISPATCHED'`, `dispatched_at=now`, `status_word='Starting'`; commit.
8. Return True.

### Hook point — inside `handle_order_status` (status 1 branch)

`handle_order_status` (`plc_routes.py:728`) already runs per line each poll and already handles the Idle branch (`status_int == 1`, line 766) where it calls `_store_completed_order_if_ready`. Add the dispatch call **after** the completion check so a finishing order is stored/released first, then the next is dispatched:

```python
if status_int == 1:
    ... existing created_at buffer ...
    _store_completed_order_if_ready(order_data, model_class, order_type, badge, now)
    # NEW: pull the next matching waiting order onto this idle line
    dispatch_next_waiting_order(order_type, db_no, line, m)
```

> `handle_order_status` is called from `_execute_plant_orders()` (`plc_routes.py:1272`) which iterates DB1/DB2/DB3/DB4 lines. Ensure `db_no`, `line`, and the loaded map `m` are passed through to the dispatch call (they are already available at each call site around `plc_routes.py:1397–1418`).

### Concurrency / locking

- Wrap the dispatch DB read+update in the existing snapshot lock (used by `fetch_plant_orders_snapshot`) or a dedicated `threading.Lock` so two poll cycles can't dispatch the same row twice.
- Use `SELECT ... FOR UPDATE SKIP LOCKED` (or the ORM equivalent `with_for_update`) on the WAITING lookup for safety if multiple workers run.

---

## 8. Phase 3 — Completion path updates row + releases RFID

Today `_store_completed_order_if_ready` / `_store_complete_order_with_lifecycle` **INSERT** a fresh row. Change to **find the matching open row and UPDATE it**:

1. Find the row: `queue_status IN ('DISPATCHED','RUNNING')`, matching `line` + identifier (`badge_no` / `source_silo` / `pit_no`) + `rfid_number`.
2. Update lifecycle fields as today (`started_at`, `finished_at`, `is_complete=True`) **plus** `queue_status='COMPLETED'`.
3. **Release RFID**: `cfg = RFIDConfig.query.filter_by(rfid_number=row.rfid_number)`, set `rfid_used=False`, `rfid_linked_to_order=None`. Commit.

Also add a transition to `RUNNING`: in the `status_int in [2..7]` branch (`plc_routes.py:775`), set the matching row's `queue_status='RUNNING'` (once).

> Edge case: if no open row is found on completion (e.g. an order started directly on the PLC outside Hercules), fall back to the **current** insert behavior so nothing is lost.

---

## 9. Phase 4 — Queue read / management endpoints

Add to `Backend/routes/plc_routes.py` (or `orders.py`):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/plc/orders/queue?line=&type=` | List `WAITING`/`DISPATCHED`/`RUNNING` orders, ordered by line + `queue_position`. |
| POST | `/api/plc/orders/<type>/<id>/cancel` | Cancel a `WAITING`/`DISPATCHED` order → `CANCELLED`, release RFID. Reject if `RUNNING`. |
| POST | `/api/plc/orders/<type>/<id>/reorder` | Change `queue_position` (optional, manual reprioritize). |
| GET | `/api/rfid/available` | List `RFIDConfig` where `rfid_used=False` (for the create dropdown). |

---

## 10. Phase 5 — Frontend

File: `frontend-package/client/src/pages/water-system/Orders.tsx` (tab‑per‑line today; create = immediate PLC write via `createOrderComprehensive()` → `POST {plcBase}/orders/create`).

Changes:
1. **RFID field on the create form** — dropdown populated from `GET /api/rfid/available` (only unused tags). Required for intake/outloading/mineral.
2. **Enqueue instead of direct write** — create submits to `POST {plcBase}/orders/enqueue`. Success adds the order to the Waiting list; it does **not** hit the PLC immediately. Multiple submits allowed → multiple waiting orders.
3. **Waiting Orders panel** (per line/tab) — polls `GET /api/plc/orders/queue` (reuse the existing 5s snapshot poll cadence). Columns: position, badge, RFID, material, qty, dest, status badge (`WAITING`/`DISPATCHED`/`RUNNING`) using the existing `getStatusColor`/`getStatusIcon` helpers. Cancel button for `WAITING`/`DISPATCHED`.
4. **RFID uniqueness UX** — once a tag is enqueued it disappears from the available dropdown (backend already excludes `rfid_used=True`), reappearing after its order completes/cancels.

Related components to touch: `frontend-package/client/src/pages/water-system/RFID.tsx` and `components/water-system/RfidAssignModal.tsx` (align "available tags" filtering with the new lock rules).

---

## 11. Phase 6 — Deploy & verification

- Run migration `add_order_queue_columns.sql` (+ backfill UPDATE) against Postgres. Follows the same pattern as `Backend/migrations/add_silo_status_quantity_kg.sql`.
- Restart backend; confirm models load new columns.
- **Verification checklist:**
  - [ ] Enqueue 3 intake orders on line 1 with 3 distinct RFIDs → 3 `WAITING` rows, 3 tags now `rfid_used=true`.
  - [ ] Enqueuing a 4th order with an already‑used RFID → 409.
  - [ ] Present RFID #2's truck at the line while idle → order #2 (not #1) dispatches and runs.
  - [ ] Order completes → row `COMPLETED`, RFID #2 released (`rfid_used=false`), reappears in dropdown.
  - [ ] Line returns idle, next matching RFID scanned → next order auto‑dispatches.
  - [ ] Scan an RFID with no waiting order → line stays idle, log entry written.
  - [ ] Restart backend mid‑queue → `WAITING` rows persist and dispatch resumes.

---

## 12. Risk / edge cases

| Risk | Mitigation |
|------|-----------|
| Row created at enqueue breaks the "store on completion" convention used elsewhere | Completion path changed to UPDATE; fallback INSERT kept for orders started outside Hercules. |
| Double‑dispatch on fast polling (0.5s) | Lock + `SELECT ... FOR UPDATE SKIP LOCKED`; DISPATCHED/RUNNING guard at top of dispatcher. |
| `L{line}_RFID_BadgeReading` is a REAL; RFID stored as string | Normalize both sides (cast REAL→int→str) when matching. Confirm PLC actually populates this tag on scan before relying on it. |
| Historical rows mislabeled `WAITING` after migration | Backfill UPDATE sets `is_complete=TRUE` rows to `COMPLETED`. |
| RFID never released if completion missed (status 8 seen only briefly) | Poll is 0.5s; also release on `CANCELLED`; add an admin "force release RFID" action. |
| Bulk/PIT have no line/RFID scan | Treat as single‑line queues; if no physical RFID scan exists for them, dispatch oldest `WAITING` (relaxed mode for bulk/pit only). Confirm with ops. |

---

## 13. Open questions for product/ops

1. Do **bulk** and **PIT** lines have an RFID scan (`RFID_BadgeReading`)? If not, they should use FIFO dispatch instead of RFID matching.
2. Should an operator be able to **manually reorder** the waiting queue, or is it strictly RFID‑driven?
3. On "scanned RFID matches no waiting order" — strict (stay idle, recommended) or should Hercules surface an alert/notification to the operator?
4. Should an RFID be reusable **immediately** after completion, or only after the truck physically leaves?

---

## 14. File change index

| Concern | File | Change |
|---------|------|--------|
| Queue columns | `Backend/migrations/add_order_queue_columns.sql` | new migration |
| Model fields + `to_dict` | `Backend/models/orders.py` | 4 models |
| Enqueue endpoint | `Backend/routes/plc_routes.py` | new `enqueue_order()` |
| Shared tag mapping helper | `Backend/routes/plc_routes.py` | new `_order_kvs()` (refactor from create helpers ~2534/2597) |
| Dispatcher + RFID match | `Backend/routes/plc_routes.py` | new `dispatch_next_waiting_order()` + hook in `handle_order_status` status‑1 branch (line 766) |
| Set RUNNING on 2..7 | `Backend/routes/plc_routes.py` | `handle_order_status` (line 775) |
| Completion UPDATE + RFID release | `Backend/routes/plc_routes.py` | `_store_completed_order_if_ready` / `_store_complete_order_with_lifecycle` |
| Queue/cancel/available endpoints | `Backend/routes/plc_routes.py` / `rfid_routes.py` | new routes |
| Multi-order create + waiting list | `frontend-package/client/src/pages/water-system/Orders.tsx` | enqueue + queue panel |
| Available-RFID filtering | `frontend-package/client/src/pages/water-system/RFID.tsx`, `components/water-system/RfidAssignModal.tsx` | align with lock |

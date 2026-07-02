# Truck Entry & Weighbridge — Full Implementation Plan

**Scope:** Manual truck weighbridge flow (no RFID). Operator selects truck + material (same list as Orders), records two manual weights (entry / exit), NET stored on completion. Truck Management shows OUT pending; Weighbridge Log shows completed trips only.

**Out of scope (for now):** RFID linking, live scale hardware, PLC order dispatch from weighbridge.

---

## 1. Architecture overview

```
┌─────────────────────┐     POST/GET      ┌──────────────────────────┐
│  Truck Weighbridge  │ ◄──────────────► │  /api/truck-entry/orders │
│  (TruckEntry.tsx)   │                   │  (truck_entry_routes.py) │
└─────────────────────┘                   └────────────┬─────────────┘
┌─────────────────────┐                              │
│  Truck Management   │ ◄── GET open + today ─────────┤
│  (TruckManagement)  │                              ▼
└─────────────────────┘                   ┌──────────────────────────┐
┌─────────────────────┐                   │  truck_weigh_orders    │
│  Weighbridge Log    │ ◄── GET today ────│  (PostgreSQL table)    │
│  (Weighbridge.tsx)  │                   └──────────────────────────┘
└─────────────────────┘

Shared: materialCodes.ts (frontend) + material_codes.py (backend mirror)
```

### Page responsibilities

| Route | Component | Role |
|-------|-----------|------|
| `/fakieh/truck-entry` | `TruckEntry.tsx` | Operator UI: create order, first/second weight, open orders list, today table |
| `/fakieh/truck-management` | `TruckManagement.tsx` | Fleet CRUD + **Site status** column (OUT pending / completed) |
| `/fakieh/weighbridge` | `Weighbridge.tsx` | **Read-only** completed trips with material |

### Status machine

```
awaiting_first  →  (POST .../first)  →  awaiting_second  →  (POST .../second)  →  completed
     ↑ create                                                              NET = abs(second - first)
```

Rules:
- One truck may have **at most one** open order (`awaiting_first` or `awaiting_second`) at a time.
- `awaiting_first`: created but first weight not saved yet (optional — see Phase 1 note).
- `awaiting_second`: first weight saved, waiting for exit weight → **OUT pending** in Truck Management.
- `completed`: both weights saved; appears in Weighbridge Log.

**Phase 1 recommendation:** On **Create**, immediately move to weight entry UI with status `awaiting_first`. First save transitions to `awaiting_second`. This matches operator mental model: Create → enter first weight.

Alternative: Create with status `open` and require explicit "Start weighing" — more clicks; not recommended.

---

## 2. Database

### 2.1 New table: `truck_weigh_orders`

**File:** `Backend/migrations/add_truck_weigh_orders.sql`

```sql
CREATE TABLE IF NOT EXISTS truck_weigh_orders (
    id              BIGSERIAL PRIMARY KEY,
    ticket          VARCHAR(32) NOT NULL UNIQUE,
    truck_id        INTEGER NOT NULL,
    material_code   VARCHAR(50) NOT NULL,
    material_name   VARCHAR(200),
    first_weight_kg  DOUBLE PRECISION,
    first_ts        TIMESTAMPTZ,
    second_weight_kg DOUBLE PRECISION,
    second_ts       TIMESTAMPTZ,
    net_kg          DOUBLE PRECISION,
    status          VARCHAR(20) NOT NULL DEFAULT 'awaiting_first',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_truck_weigh_orders_truck_id ON truck_weigh_orders (truck_id);
CREATE INDEX IF NOT EXISTS ix_truck_weigh_orders_status ON truck_weigh_orders (status);
CREATE INDEX IF NOT EXISTS ix_truck_weigh_orders_created_at ON truck_weigh_orders (created_at);
```

**Status values:** `awaiting_first`, `awaiting_second`, `completed`, `cancelled` (optional future).

### 2.2 SQLAlchemy model

**New file:** `Backend/models/truck_weigh_order.py`

Fields mirror table. Methods:
- `to_dict()` — JSON for API (include enriched `truck_plate`, `truck_driver` when joined).
- `compute_net()` — `abs(second - first)` when both set.

**Register in app:** Import model in `Backend/app.py` next to other models so `db.create_all()` picks it up (same pattern as `DistributionRule`).

### 2.3 Legacy tables (no change required)

| Table | Action |
|-------|--------|
| `weights_log` | Keep for backward compatibility; **do not** use for new flow |
| `weigh_visits` | RFID flow — leave untouched |
| `weighbridge_records` | RFID TARE/GROSS — leave untouched |

Optional later: write audit rows to `weights_log` with `order_id` FK when first/second saved.

---

## 3. Shared material codes

Orders uses a hardcoded list in `Orders.tsx` (lines ~186–217). Truck entry must use the **same** codes.

### 3.1 Frontend

**New file:** `frontend-package/client/src/constants/materialCodes.ts`

```ts
export interface MaterialCode {
  code: string;
  name: string;
}

export const MATERIAL_CODES: MaterialCode[] = [ /* move full list from Orders.tsx */ ];

export function getMaterialNameFromCode(code: string | number | null | undefined): string {
  if (!code || code === '') return '-';
  const m = MATERIAL_CODES.find((x) => x.code === String(code));
  return m ? m.name : String(code);
}

export function getSelectableMaterialCodes(): MaterialCode[] {
  return MATERIAL_CODES.filter((m) => m.code !== 'None' && m.code !== '000');
}
```

**Update:** `Orders.tsx` — remove local `materialCodes` array; import from `constants/materialCodes.ts`. Keep `getMaterialNameFromCode` as re-export or import from same module.

### 3.2 Backend

**New file:** `Backend/constants/material_codes.py`

Mirror the same `{code, name}` pairs. Used on create to resolve `material_name` from `material_code` sent by frontend.

```python
MATERIAL_CODES = [
    {"code": "002", "name": "Soya"},
    # ... full list
]

def resolve_material_name(code: str) -> str | None:
    for m in MATERIAL_CODES:
        if m["code"] == str(code).strip():
            return m["name"]
    return None
```

Reject create if `material_code` not in list (400) — prevents typos.

---

## 4. Backend API

**New file:** `Backend/routes/truck_entry_routes.py`  
**Blueprint:** `truck_entry_bp`, prefix `/api/truck-entry`

Register in `Backend/app.py`:
```python
from routes.truck_entry_routes import truck_entry_bp
app.register_blueprint(truck_entry_bp)
```

**Timezone:** Reuse `Asia/Kolkata` from `plant_flow.py` for “today” boundaries.

### 4.1 Endpoints

#### `POST /api/truck-entry/orders`

Create a new weigh order.

**Body:**
```json
{ "truck_id": 5, "material_code": "100" }
```

**Validation:**
- `truck_id` exists in `trucks`
- `material_code` in `MATERIAL_CODES` and not `None`/`000`
- No existing open order for same `truck_id` (status in `awaiting_first`, `awaiting_second`)

**Response (201):**
```json
{
  "id": 1,
  "ticket": "TE-abc12345",
  "truck_id": 5,
  "truck_plate": "ABC-123",
  "material_code": "100",
  "material_name": "Yellow Maize 7.8%",
  "status": "awaiting_first",
  "created_at": "..."
}
```

#### `POST /api/truck-entry/orders/<int:order_id>/first`

**Body:** `{ "weight": 24000 }`

**Rules:**
- Order status must be `awaiting_first`
- `weight` > 0

**Updates:** `first_weight_kg`, `first_ts`, `status` → `awaiting_second`

#### `POST /api/truck-entry/orders/<int:order_id>/second`

**Body:** `{ "weight": 12500 }`

**Rules:**
- Order status must be `awaiting_second`
- `first_weight_kg` must be set

**Updates:** `second_weight_kg`, `second_ts`, `net_kg = abs(second - first)`, `status` → `completed`

**Response:** include `net_kg`, all timestamps.

#### `GET /api/truck-entry/orders/open`

All orders with status `awaiting_first` or `awaiting_second`, ordered by `created_at` desc.

Enrich with truck `license`, driver name (same join logic as `plant_flow.weights_today`).

**Response:**
```json
{
  "orders": [
    {
      "id": 1,
      "ticket": "TE-...",
      "truck_id": 5,
      "truck_plate": "ABC-123",
      "material_code": "100",
      "material_name": "Yellow Maize 7.8%",
      "status": "awaiting_second",
      "first_weight_kg": 24000,
      "first_ts": "...",
      "site_status": "out_pending"
    }
  ]
}
```

`site_status`: `awaiting_first` → `on_site`; `awaiting_second` → `out_pending` (for UI badges).

#### `GET /api/truck-entry/orders/today`

Query param: `date=YYYY-MM-DD` (optional).

Returns **completed** orders for local business day.

**Response:**
```json
{
  "date": "2026-07-02",
  "rows": [
    {
      "id": 1,
      "ticket": "TE-...",
      "truck_id": 5,
      "truck_plate": "ABC-123",
      "truck_driver": "John",
      "material_code": "100",
      "material_name": "Yellow Maize 7.8%",
      "first_weight_kg": 24000,
      "second_weight_kg": 12500,
      "net_kg": 11500,
      "first_ts": "...",
      "second_ts": "...",
      "status": "completed"
    }
  ]
}
```

#### `GET /api/truck-entry/orders/<int:order_id>`

Single order detail (for resuming from open list).

#### `GET /api/truck-entry/status/by-truck` (for Truck Management)

Returns map `truck_id → { status, order_id, first_weight_kg, ... }` for all open orders + optional today completed flag.

Simpler alternative: Truck Management calls `GET /orders/open` and builds map client-side.

### 4.2 Error codes

| HTTP | When |
|------|------|
| 400 | Missing fields, invalid material, weight ≤ 0 |
| 404 | Order / truck not found |
| 409 | Truck already has open order; wrong status for first/second |
| 500 | DB error |

---

## 5. Frontend — Truck Weighbridge (`TruckEntry.tsx`)

**Replace** current Gate IN / Gate OUT cards and `/api/weigh/in|out` calls.

### 5.1 State

```ts
interface TruckWeighOrder {
  id: number;
  ticket: string;
  truck_id: number;
  truck_plate?: string;
  material_code: string;
  material_name?: string;
  status: 'awaiting_first' | 'awaiting_second' | 'completed';
  first_weight_kg?: number | null;
  second_weight_kg?: number | null;
  net_kg?: number | null;
  first_ts?: string | null;
  second_ts?: string | null;
}

// UI state
activeOrder: TruckWeighOrder | null;
openOrders: TruckWeighOrder[];
completedToday: TruckWeighOrder[];
newTruckId: string;
newMaterialCode: string;
firstWeightInput: string;
secondWeightInput: string;
```

Use `API_BASE_URL` from `config/api.ts` (fix hardcoded `localhost:5000`).

### 5.2 Layout (4 panels)

```
┌─────────────────────────────────────────────────────────────────┐
│ KPI cards: Open orders | OUT pending | Completed today | ...    │
├──────────────────────┬──────────────────────────────────────────┤
│ Open orders (sidebar)│ New entry: Truck + Material + [Create]   │
│  • TE-xxx OUT pending│ Active order: plate, material, status    │
│  • click to resume   │ First weight [____] [Save first]         │
│                      │ Second weight [____] [Save second]       │
│                      │ NET: — (when completed)                  │
├──────────────────────┴──────────────────────────────────────────┤
│ Today's trips table: Truck | Material | IN | OUT | NET | times  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 User flows

**Flow A — New trip**
1. Select truck + material → Create → `POST /truck-entry/orders`
2. Set `activeOrder` from response; focus first weight input
3. Enter first weight → `POST .../first` → status `awaiting_second`
4. Later: select from open list or same session → second weight → `POST .../second`
5. Refresh open list + today table; clear `activeOrder` or show success

**Flow B — Resume open order**
1. Click row in open orders sidebar → set `activeOrder`
2. If `awaiting_first`, show first weight form only
3. If `awaiting_second`, show first (read-only) + second weight form

### 5.4 API helpers

**New file (optional):** `frontend-package/client/src/api/truckEntry.ts`

```ts
export async function createTruckWeighOrder(truckId: number, materialCode: string) { ... }
export async function saveFirstWeight(orderId: number, weight: number) { ... }
export async function saveSecondWeight(orderId: number, weight: number) { ... }
export async function fetchOpenOrders() { ... }
export async function fetchCompletedToday(date?: string) { ... }
```

### 5.5 KPIs

- **Open orders:** `openOrders.length`
- **OUT pending:** count where `status === 'awaiting_second'`
- **Completed today:** `completedToday.length`

---

## 6. Frontend — Weighbridge Log (`Weighbridge.tsx`)

**Read-only.** Remove unused `postJSON` if present.

### Changes
- Fetch `GET /api/truck-entry/orders/today` instead of `/api/weights/today`
- Table columns: Truck ID, Plate, Driver, **Material**, IN (kg), OUT (kg), NET (kg), IN time, OUT time
- Remove RFID / order_linked columns (or keep RFID column showing "NO" for consistency — prefer remove)
- Filters: truck id, plate, material
- Refresh button

---

## 7. Frontend — Truck Management (`TruckManagement.tsx`)

### 7.1 Data loading

On mount, in addition to existing fetches:
```ts
const openRes = await axios.get(`${API_BASE}/truck-entry/orders/open`);
// Build Map<truckId, { status, first_weight_kg, ... }>
```

Replace or supplement `fetchWeightsToday` / `weightsByTruck` with open-order map from truck-entry API.

### 7.2 Trucks table — new column: **Site status**

| Condition | Badge |
|-----------|--------|
| Open order `awaiting_second` | Yellow: **OUT pending** |
| Open order `awaiting_first` | Blue: **Awaiting first weight** |
| No open order | Gray: **—** or **Off site** |

Optional: show today's completed NET in view modal from `GET /orders/today` filtered by truck.

### 7.3 Truck detail modal

Replace/supplement "Today's Weight Information" block:
- If OUT pending: IN weight + time, OUT = "Pending"
- If completed today: IN, OUT, NET from truck-entry API

---

## 8. API config (`api.ts`)

Add to `API_ENDPOINTS`:

```ts
TRUCK_ENTRY: {
  ORDERS: '/api/truck-entry/orders',
  OPEN: '/api/truck-entry/orders/open',
  TODAY: '/api/truck-entry/orders/today',
},
```

---

## 9. Implementation phases (recommended order)

### Phase 1 — Foundation (backend + shared constants)
**Estimate: 0.5–1 day**

| # | Task | Files |
|---|------|-------|
| 1.1 | SQL migration `truck_weigh_orders` | `Backend/migrations/add_truck_weigh_orders.sql` |
| 1.2 | Model `TruckWeighOrder` | `Backend/models/truck_weigh_order.py` |
| 1.3 | Material codes mirror | `Backend/constants/material_codes.py` |
| 1.4 | Routes: create, first, second, open, today | `Backend/routes/truck_entry_routes.py` |
| 1.5 | Register blueprint + model import | `Backend/app.py` |
| 1.6 | Run migration on dev DB | manual / deploy script |
| 1.7 | Smoke test with curl/Postman | — |

**Exit criteria:** Can create order, save first, save second, list open and completed via API.

### Phase 2 — Truck Weighbridge UI
**Estimate: 1 day**

| # | Task | Files |
|---|------|-------|
| 2.1 | Extract `materialCodes.ts` | `frontend-package/client/src/constants/materialCodes.ts` |
| 2.2 | Update Orders to import shared list | `Orders.tsx` |
| 2.3 | API client helpers | `api/truckEntry.ts` (optional) |
| 2.4 | Rebuild TruckEntry UI | `TruckEntry.tsx` |
| 2.5 | Fix `API_BASE_URL` usage | `TruckEntry.tsx` |

**Exit criteria:** Full operator flow works in browser without RFID.

### Phase 3 — Weighbridge Log
**Estimate: 0.25 day**

| # | Task | Files |
|---|------|-------|
| 3.1 | Switch data source to `/truck-entry/orders/today` | `Weighbridge.tsx` |
| 3.2 | Add material + IN/OUT/NET columns | `Weighbridge.tsx` |

**Exit criteria:** Completed trips visible with material after second weight saved.

### Phase 4 — Truck Management status
**Estimate: 0.5 day**

| # | Task | Files |
|---|------|-------|
| 4.1 | Fetch open orders | `TruckManagement.tsx` |
| 4.2 | Site status column + badges | `TruckManagement.tsx` |
| 4.3 | Update detail modal weights | `TruckManagement.tsx` |

**Exit criteria:** Truck with open second-pending order shows **OUT pending** in fleet table.

### Phase 5 — Polish & deploy
**Estimate: 0.25 day**

| # | Task |
|---|------|
| 5.1 | Add migration to deploy workflow if needed |
| 5.2 | Manual QA checklist (below) |
| 5.3 | Remove or deprecate old Gate IN/OUT UI paths (keep `/api/weigh/in|out` for backward compat or mark deprecated in comments) |

---

## 10. Testing checklist

### API
- [ ] Create order with valid truck + material → 201
- [ ] Create with invalid material → 400
- [ ] Create second open order for same truck → 409
- [ ] First weight on `awaiting_first` → `awaiting_second`
- [ ] Second weight → `completed`, correct `net_kg`
- [ ] Second before first → 409
- [ ] `GET open` returns pending orders only
- [ ] `GET today` returns completed only for business day

### UI — Truck Weighbridge
- [ ] Material dropdown matches Orders labels (`code - name`)
- [ ] Create → first weight → appears in open list as OUT pending
- [ ] Resume from open list → second weight → disappears from open, appears in today table
- [ ] NET displayed correctly

### UI — Weighbridge Log
- [ ] Shows completed row with material after trip done
- [ ] No create/weigh controls

### UI — Truck Management
- [ ] OUT pending badge when `awaiting_second`
- [ ] Modal shows IN weight and Pending for OUT

---

## 11. File change summary

### New files
| Path | Purpose |
|------|---------|
| `Backend/migrations/add_truck_weigh_orders.sql` | DB table |
| `Backend/models/truck_weigh_order.py` | ORM model |
| `Backend/constants/material_codes.py` | Material lookup |
| `Backend/routes/truck_entry_routes.py` | REST API |
| `frontend-package/client/src/constants/materialCodes.ts` | Shared material list |
| `frontend-package/client/src/api/truckEntry.ts` | API helpers (optional) |

### Modified files
| Path | Change |
|------|--------|
| `Backend/app.py` | Register blueprint + import model |
| `frontend-package/client/src/pages/water-system/TruckEntry.tsx` | Full rebuild |
| `frontend-package/client/src/pages/water-system/Weighbridge.tsx` | Read-only completed from new API |
| `frontend-package/client/src/pages/water-system/TruckManagement.tsx` | Site status + open orders |
| `frontend-package/client/src/pages/water-system/Orders.tsx` | Import shared materialCodes |
| `frontend-package/client/src/config/api.ts` | TRUCK_ENTRY endpoints |

### Unchanged (legacy)
| Path | Note |
|------|------|
| `Backend/routes/plant_flow.py` | `/api/weigh/in|out` kept for compat |
| `Backend/routes/weigh_simple.py` | RFID flow — future |
| `Backend/routes/websocket_routes.py` | Not involved |

---

## 12. Future extensions (not in this plan)

1. **RFID:** Add optional `rfid` on order; auto-fill truck/material from active PLC order.
2. **Live scale:** `GET /api/weighbridge/live` or WebSocket weight stream into first/second inputs.
3. **Cancel order:** `POST .../orders/:id/cancel` for mistakes.
4. **Link to intake/outloading orders:** `order_id` FK when RFID returns.
5. **Single source for materials:** Load from DB or PLC XML instead of duplicated constants.
6. **Reports:** Aggregate `truck_weigh_orders.net_kg` by material/day.

---

## 13. Example API sequence (curl)

```bash
# 1. Create
curl -X POST http://localhost:5000/api/truck-entry/orders \
  -H "Content-Type: application/json" \
  -d '{"truck_id": 1, "material_code": "100"}'

# 2. First weight
curl -X POST http://localhost:5000/api/truck-entry/orders/1/first \
  -H "Content-Type: application/json" \
  -d '{"weight": 24000}'

# 3. Second weight
curl -X POST http://localhost:5000/api/truck-entry/orders/1/second \
  -H "Content-Type: application/json" \
  -d '{"weight": 12500}'

# 4. Lists
curl http://localhost:5000/api/truck-entry/orders/open
curl http://localhost:5000/api/truck-entry/orders/today
```

---

## 14. Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| New table vs extend `weights_log` | New `truck_weigh_orders` | Material + status + ticket in one row; clean API |
| NET formula | `abs(second - first)` | User confirmed; signed NET can come later |
| Material source | Shared constant (Orders list) | Match existing Orders UX exactly |
| RFID | Out of scope | Explicit user requirement |
| One open order per truck | Enforce 409 | Prevents ambiguous IN/OUT pairing |
| Business timezone | `Asia/Kolkata` | Consistent with `plant_flow.py` |

---

*Document version: 1.0 — aligns with codebase as of July 2026.*

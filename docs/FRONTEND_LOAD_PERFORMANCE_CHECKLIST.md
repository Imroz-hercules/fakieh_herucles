# Frontend Load Performance — What Changed & How To Verify

Implementation of `superpowers/plans/2026-08-24-frontend-load-performance.md`,
plus three issues that plan did not cover (see "Gaps" below).

---

## 1. What changed

### Frontend

| # | Change | File |
|---|--------|------|
| 1 | **New `usePolling` hook** — runs immediately, then on an interval, but **skips a tick while the previous run is still in flight**; aborts in-flight work on unmount. | `client/src/hooks/usePolling.ts` (new) |
| 2 | **Live Orders no longer stacks requests.** `setInterval(5s)` firing `fetchOrders`+`fetchQueue`+`checkBroadcastStatus` with no guard → single non-overlapping poll. One-shot loads (bin-materials, rfid config, trucks, clients) moved to their own mount effect. All three polled calls accept an `AbortSignal`. | `pages/water-system/Orders.tsx` |
| 3 | **Silo polling is opt-in.** `SiloProvider` polled `/api/plc/silos` **every 10s for the whole app** — Truck Entry, Dashboard, Reports all paid for a slow PLC call. Provider now fetches once; pages that need live silos call `useSilosPolling()`. An in-flight guard makes overlapping calls a no-op. | `contexts/SiloContext.tsx`, opted in by `Orders.tsx` + `Storage.tsx` only |
| 4 | **SPA redirects.** 7 × `window.location.href/replace` (full document reloads, white flash) → wouter `<Redirect>`. | `App.tsx` |
| 5 | **Route-level code splitting** via `React.lazy` + `<Suspense>`. | `App.tsx` |
| 6 | **Truck Entry cancels in-flight loads on unmount** (`/open` + `/today`); abort is no longer shown as an error. | `pages/water-system/TruckEntry.tsx`, `api/truckEntry.ts` |
| 7 | **Dashboard mount burst deferred.** `fetchTotalOrders` alone is 8 parallel requests; those counters now run on `requestIdleCallback` (after first paint) instead of competing with charts, JS and logos. | `pages/water-system/FakiehDashboard.tsx` |
| 8 | **AI Assistant poll** `setInterval(1200)` → non-overlapping `usePolling(1500)`. | `pages/water-system/AiAssistant.tsx` |
| 9 | **`npm run check` fixed: 39 → 0 errors.** Removed 7 imports of pages that do not exist (`@/pages/not-found`, `FacilityOverview`, `ProcessFlow`, `WaterQuality`, `EnergyMonitoring`, `Maintenance`, `ChemicalDosing`); typed `OrderHistory`'s material-name fields; added `'dual'` to the widget `displayMode` unions; fixed a read-only ref, a `MapIterator` spread, and several narrow types. | multiple |

**Measured build effect:** initial JS bundle **1,306 kB → 307 kB (−76%)**, gzip 370 kB → 103 kB, with per-route chunks (Orders 72 kB, Dashboard 66 kB, TruckEntry 28 kB, …).

### Backend — gaps the plan missed

| # | Gap | Fix |
|---|-----|-----|
| G1 | **Wrong timezone.** `TIMEZONE_NAME = "Asia/Kolkata"` in three modules put the business-day boundary **2.5 h off** for a Saudi plant, so `/orders/today` showed the wrong day. Phase 7 rewrote that exact query without noticing. | Added `BUSINESS_TZ_NAME = "Asia/Riyadh"` to `utils/timezone.py` as the single source of truth; `truck_entry_routes.py`, `plant_flow.py`, `weighbridge.py` now import it. Zero hardcoded refs remain. |
| G2 | **Backend could not boot** (so the plan's Phase 0 "hit the API directly" step was impossible). `db.create_all()` was unguarded, and because `KPIMaterial` is bound to the SQL Server reporting DB it also required **both** databases to be reachable. | `db.create_all(bind_key=None)` (default/Postgres bind only) wrapped in try/except with a clear fatal message instead of a raw traceback. Also fixed `/api/test`, the DB health check Phase 0 relies on (SQLAlchemy 2.0 needs `text()`). |
| G3 | **Always-on broadcast was a hidden fixed cost.** The PLC broadcast worker runs every ~0.5 s and re-read **all** silos (DB1/2/3 + DB5 quantities) and re-wrote every silo row **on every tick** — regardless of connected clients — competing with the request path for the DB pool and the PLC's single connection. | Silo collect/persist throttled to its own interval (`BROADCAST_SILO_SYNC_MIN_SEC`, default 15 s). The fast tick is preserved for status-8 capture. **Verified: 30 ticks → 3 syncs**; at production defaults that is a **~97 % cut** in silo PLC reads and DB upserts. |

### Backend — Task 9 (query)

`/api/truck-entry/orders/today` filtered with `date(timezone(tz, second_ts)) == day`, which wraps the column and is **non-sargable** (no index on `second_ts` can be used). Now resolves the local day to a half-open `[start, end)` range and compares the bare column — index-friendly and timezone-correct.

---

## 2. How to verify

### Automated (already passing)

```bash
cd frontend-package
npx tsc --noEmit      # 0 errors  (was 39)
npm run build         # succeeds; check dist/public/assets has per-route chunks

cd ../Backend
python -c "import app; print(len(list(app.app.url_map.iter_rules())))"   # 201
```

### Manual — Chrome DevTools → Network → Fetch/XHR

Uncheck **Disable cache** for a realistic feel.

1. **Live Orders** (`/fakieh/live_orders`) — sit for 60 s. At most **one** group of `plant/orders` + `orders/queue` + `websocket/status` in flight at a time. No growing "Pending" stack.
2. **Truck Entry** (`/fakieh/truck-entry`) — sit for 60 s. **No `/api/plc/silos` requests at all.** Only truck-entry endpoints, `/trucks/`, and the scale reading if a scale is selected.
3. **Redirect routes** — open `/fakieh/orders`, `/fakieh/rfid`, `/fakieh/truck-management`, `/fakieh/client-information`. Each lands on its target with **no new `index.html` document request** (SPA navigation, no white flash).
4. **Navigate between pages** — each first visit fetches one new JS chunk (`Orders-*.js`, `TruckEntry-*.js`…), not the whole app.
5. **Dashboard** (`/fakieh/fakieh-dashboard`) — the KPI count requests start **after** the shell and charts paint.

### Still to measure (needs a reachable backend)

The plan's Phase 0 / Task 12 baseline table is unfilled: it needs the real backend at
`192.168.0.60:5000`. Record Finish / DCL / slowest-TTFB before and after on
`live_orders`, `truck-entry`, `fakieh-dashboard`.

---

## 3. Not changed (deliberately)

These are documented in `STRESS_TEST_REPORT.md` and are **not** performance issues,
so they were left alone: ML models pickled with scikit-learn 1.5.0 vs 1.9.0 installed
(B3), `[sp_prot]` column mismatch (B5), hardcoded DSN fallback in `plc_routes.py`
(B7 — still logs a scary `FATAL: password authentication failed` on boot),
`api_debug.log` at 7.66 GB with no rotation (B11), the dead `/api/weighbridge/`
blueprint (B9), and the empty `message` on every `APIError` response (B9 in report).

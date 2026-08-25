# Frontend Load Performance Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every Fakieh page from feeling slow by eliminating API request pile-ups, scoping global polling, fixing full-page SPA reloads, and reducing first-load JS/asset contention so navigation and data settle in under a few seconds when the backend is healthy.

**Architecture:** Treat slowness as a **connection-queue + polling** problem first (same origin `localhost:5173` serves Vite assets and proxies `/api`). Phase 1 verifies backend TTFB. Phase 2 makes all polls **non-overlapping** (in-flight guard / AbortController). Phase 3 stops **global** silo polling on pages that do not need it. Phase 4 replaces `window.location` redirects with wouter navigation. Phase 5 adds route-level `React.lazy` code splitting. Phase 6 tunes Vite proxy / assets and documents verification targets. Backend latency work references existing `docs/BACKEND_PERFORMANCE_ROLLOUT.md` and is only extended where truck-entry / plant-orders TTFB remains high.

**Tech Stack:** React 18, Vite 5, wouter 3, TanStack Query 5, axios/fetch, Flask backend (`192.168.0.60:5000` via Vite proxy in dev), Chrome DevTools Network for acceptance.

**Related docs:**
- `docs/FRONTEND_PERFORMANCE_ROLLOUT.md` — KPI/list pagination client patterns (keep compatible)
- `docs/BACKEND_PERFORMANCE_ROLLOUT.md` — pool, PLC cache, paginated APIs
- Evidence: Live Orders Network ~35s Finish; Truck Entry `/today` `/open` `/trucks/` ~6s; logos ~6s while APIs pending

---

## Evidence summary (why this plan exists)

| Symptom | Measured | Root cause |
|---------|----------|------------|
| Every page slow | Logos 5–6s, Finish 13–35s | Slow `/api` fills browser connection slots on `localhost:5173`; assets queue behind them |
| Live Orders never settles | Finish 35s+, Pending XHR | `setInterval(5s)` starts next poll before previous `fetchOrders` / `queue` / `status` finish |
| All pages hit PLC | `/silos` on every route | `SiloProvider` in `App.tsx` polls every 10s globally |
| Some navigations feel like full reload | White flash | `window.location.href` / `replace` in `App.tsx` redirects |
| First visit heavy | ~10 MB / 140+ requests in Vite dev | Eager imports of all pages + Disable cache |

**Success targets (acceptance):**

| Metric | Before (observed) | Target after fix |
|--------|-------------------|------------------|
| Live Orders: concurrent Pending poll pile-up | Yes | None (max 1 in-flight set per poll group) |
| Silo `/api/plc/silos` on Truck Entry / pages that do not use silos | Every 10s | Not polled (fetch on demand or only on Orders/Storage) |
| Redirect routes (`/fakieh/orders` → live_orders, etc.) | Full document reload | SPA navigation only (no new HTML document) |
| Truck Entry initial data (`open` + `today` + `trucks`) | ~6s each when backend slow | UI paints immediately; APIs measured separately; no stacking with silos |
| First paint with cache enabled (dev) | Feels blocked by API | Shell + logos usable while data loads (skeletons OK) |

---

## File map (what will change)

| File | Responsibility in this plan |
|------|-----------------------------|
| `frontend-package/vite.config.ts` | Proxy target correctness; optional proxy timeout / logging notes |
| `frontend-package/client/src/config/api.ts` | Confirm API base URLs; no accidental hard-coded slow hosts in pages |
| `frontend-package/client/src/App.tsx` | Lazy routes; wouter Redirect; SiloProvider placement decision |
| `frontend-package/client/src/contexts/SiloContext.tsx` | On-demand / route-aware fetch; in-flight guard; longer interval |
| `frontend-package/client/src/pages/water-system/Orders.tsx` | Non-overlapping 5s poll; optional wider interval; AbortController |
| `frontend-package/client/src/pages/water-system/TruckEntry.tsx` | Keep parallel open/today/trucks; skeletons; do not add extra polls |
| `frontend-package/client/src/api/truckEntry.ts` | Optional AbortSignal support on GETs |
| `frontend-package/client/src/pages/water-system/FakiehDashboard.tsx` | Review burst of 8 parallel order-count fetches on mount |
| `frontend-package/client/src/pages/water-system/AiAssistant.tsx` | Non-overlapping 1.2s poll (page-only) |
| `frontend-package/client/src/hooks/usePolling.ts` (create) | Shared “poll only when idle” helper |
| `Backend/routes/truck_entry_routes.py` | If TTFB still high after frontend fixes: index / simplify `/orders/today` |
| `Backend/config.py` / deploy env | Confirm `PLC_ORDERS_CACHE_TTL_SEC`, pool size, correct `DB_HOST` |
| `docs/FRONTEND_LOAD_PERFORMANCE_CHECKLIST.md` (create, optional) | Operator verify steps |

---

## Phase 0 — Baseline & backend health (do before coding)

### Task 0: Capture baseline and verify API host

**Files:**
- Read: `frontend-package/vite.config.ts` (proxy `target`)
- Read: `frontend-package/client/src/config/api.ts`
- Read: `docs/BACKEND_PERFORMANCE_ROLLOUT.md`

- [ ] **Step 1: Record Chrome Network baseline** on `/fakieh/live_orders` and `/fakieh/truck-entry` (Disable cache ON once for worst case, once OFF for realistic):
  - Finish, DOMContentLoaded, count of Pending XHR
  - Top 5 slowest URLs + Waiting (TTFB) ms
- [ ] **Step 2: Hit backend directly** (bypass Vite), from the same PC:

```text
http://192.168.0.60:5000/api/plc/plant/orders
http://192.168.0.60:5000/api/plc/silos
http://192.168.0.60:5000/api/truck-entry/orders/open
http://192.168.0.60:5000/api/truck-entry/orders/today
http://192.168.0.60:5000/api/trucks/
http://192.168.0.60:5000/api/websocket/status
```

  If these are already 2–7s, **backend/network is primary**; still do Phase 1–2 (stop pile-up) but schedule Phase 6 backend work in parallel.
- [ ] **Step 3: Confirm proxy target matches the live backend** in `vite.config.ts` (`server.proxy['/api'].target`). Fix env/docs if team uses `192.168.199.160` in production vs `192.168.0.60` in Vite.
- [ ] **Step 4: Note OneDrive path** (`OneDrive\Desktop\...`). If disk I/O is slow, prefer cloning/working outside OneDrive for Vite; document as environmental risk, not app bug.

**Commit:** none (measurement only). Write numbers into this plan’s “Baseline notes” section at the bottom when done.

---

## Phase 1 — Shared safe polling helper

### Task 1: Add `usePolling` (non-overlapping interval)

**Files:**
- Create: `frontend-package/client/src/hooks/usePolling.ts`
- Test: manual — open Network; confirm no stacked identical requests

- [ ] **Step 1: Create the hook**

```ts
// frontend-package/client/src/hooks/usePolling.ts
import { useEffect, useRef } from "react";

/**
 * Calls `fn` immediately, then every `intervalMs`, but never overlaps:
 * if the previous run is still in flight, the tick is skipped.
 */
export function usePolling(
  fn: (signal: AbortSignal) => void | Promise<void>,
  intervalMs: number,
  enabled = true
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let controller: AbortController | null = null;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      controller?.abort();
      controller = new AbortController();
      try {
        await fnRef.current(controller.signal);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        // swallow or let caller handle inside fn
      } finally {
        inFlight = false;
      }
    };

    void tick();
    timer = setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      controller?.abort();
    };
  }, [intervalMs, enabled]);
}
```

- [ ] **Step 2: Export from a convenient path** (no barrel required unless project already uses one).
- [ ] **Step 3: Commit**

```text
feat(frontend): add non-overlapping usePolling hook
```

---

## Phase 2 — Stop Live Orders request pile-up

### Task 2: Refactor Orders.tsx polling to use `usePolling`

**Files:**
- Modify: `frontend-package/client/src/pages/water-system/Orders.tsx` (~lines 564–716)
- Use: `frontend-package/client/src/hooks/usePolling.ts`

**Current behavior (bug):**

```ts
const interval = setInterval(() => {
  fetchOrders()
  fetchQueue()
  checkBroadcastStatus()
}, 5000)
```

If each call takes 2–4s, intervals stack → Pending XHR → assets starve.

- [ ] **Step 1: Replace mount `useEffect` interval** with one polled job that runs the three calls **sequentially or `Promise.all` once**, guarded by `usePolling`:

```ts
// One-time loads stay in a separate useEffect (no interval):
useEffect(() => {
  fetchBinMaterials()
  fetchRfidConfigs()
  fetchTrucks()
  fetchClients()
}, [])

usePolling(async (signal) => {
  // Prefer Promise.all but abort-aware; skip if signal.aborted
  await Promise.all([
    fetchOrders(),      // later: pass signal into axios if wired
    fetchQueue(),
    checkBroadcastStatus(),
  ])
}, 8000) // widen from 5s → 8s initially; tune after TTFB known
```

- [ ] **Step 2: Wire AbortSignal into axios** where easy:

```ts
await axios.get(url, { signal })
```

Update `fetchOrders`, `fetchQueue`, `checkBroadcastStatus` to accept optional `AbortSignal` (or close over signal from `usePolling` callback only).

- [ ] **Step 3: Keep one-shot loads off the interval** (`bin-materials`, `rfid/config`, `trucks`, `clients`) — already correct; do not re-add them to the poll.
- [ ] **Step 4: Manual test** on `/fakieh/live_orders`:
  - Filter Fetch/XHR
  - Confirm at most one group of `orders` / `queue` / `status` in flight
  - No multi-second Pending stack after 30s on page
- [ ] **Step 5: Commit**

```text
fix(orders): prevent overlapping live PLC polls
```

---

## Phase 3 — Scope SiloContext (biggest cross-page win)

### Task 3: Stop polling silos on every route

**Files:**
- Modify: `frontend-package/client/src/contexts/SiloContext.tsx`
- Modify: `frontend-package/client/src/App.tsx` (only if provider moves)
- Consumers: `Orders.tsx`, `Storage.tsx` (confirmed users of `useSilos` / `fetchSilos`)

**Current behavior:**

```ts
useEffect(() => {
  fetchSilos();
  const interval = setInterval(fetchSilos, 10000);
  return () => clearInterval(interval);
}, []);
```

Runs under `SiloProvider` wrapping **entire** app → Truck Entry, Dashboard, etc. all pay for `/api/plc/silos`.

**Preferred approach (minimal churn):** keep provider global, but **do not auto-poll**. Fetch on first `useSilos()` consumer mount via a small subscription counter, or expose `enablePolling` flag.

- [ ] **Step 1: Add in-flight guard inside `fetchSilos`** so overlapping calls no-op:

```ts
const inFlightRef = useRef(false);

const fetchSilos = async () => {
  if (inFlightRef.current) return;
  inFlightRef.current = true;
  try {
    // existing axios.get(`${PLC_BASE_URL}/silos`)
  } finally {
    inFlightRef.current = false;
  }
};
```

- [ ] **Step 2: Remove unconditional 10s interval** from provider mount.
- [ ] **Step 3: Add consumer-driven polling** — e.g. `useSilosPolling(intervalMs = 15000)` used only in:
  - `Orders.tsx`
  - `Storage.tsx`
  - Any other page that must show live silo locks/qty

```ts
// In SiloContext.tsx
export function useSilosPolling(intervalMs = 15000, enabled = true) {
  const { fetchSilos } = useSilos();
  usePolling(async () => {
    await fetchSilos();
  }, intervalMs, enabled);
}
```

- [ ] **Step 4: Call `useSilosPolling()`** at top of `Orders` and `Storage` only.
- [ ] **Step 5: Verify Truck Entry Network** — no `/api/plc/silos` while sitting on `/fakieh/truck-entry`.
- [ ] **Step 6: Commit**

```text
fix(silos): poll PLC silos only on pages that need them
```

---

## Phase 4 — SPA redirects (no full reload)

### Task 4: Replace `window.location` with wouter navigation

**Files:**
- Modify: `frontend-package/client/src/App.tsx` (routes ~54–92)
- Check nav links in `navConfig.ts` / `WaterTopNav.tsx` / `Sidebar.tsx` for hard `href` to old paths

**Current anti-pattern:**

```tsx
<Route path="/fakieh/orders" component={() => {
  window.location.replace('/fakieh/live_orders');
  return null;
}} />
```

- [ ] **Step 1: Use wouter `Redirect`** (v3 supports redirect component / `useLocation`):

```tsx
import { Switch, Route, Redirect } from "wouter";

<Route path="/fakieh/orders">
  <Redirect to="/fakieh/live_orders" />
</Route>
<Route path="/fakieh/rfid">
  <Redirect to="/fakieh/management/rfid" />
</Route>
<Route path="/fakieh/management">
  <Redirect to="/fakieh/management/trucks" />
</Route>
<Route path="/fakieh/truck-management">
  <Redirect to="/fakieh/management/trucks" />
</Route>
<Route path="/fakieh/client-information">
  <Redirect to="/fakieh/management/clients" />
</Route>
<Route path="/">
  <Redirect to="/fakieh/fakieh-dashboard" />
</Route>
{/* fallback */}
<Route>
  <Redirect to="/fakieh/fakieh-dashboard" />
</Route>
```

Confirm wouter API for this project version (`^3.3.5`): if `Redirect` is not exported, use:

```tsx
function RedirectTo({ href }: { href: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(href);
  }, [href, setLocation]);
  return null;
}
```

- [ ] **Step 2: Manual test** — click old bookmarks / nav entries; Network must **not** show a new document navigation to `index.html` (only XHR as needed).
- [ ] **Step 3: Commit**

```text
fix(router): use SPA redirects instead of window.location
```

---

## Phase 5 — Route-level code splitting

### Task 5: Lazy-load page components in `App.tsx`

**Files:**
- Modify: `frontend-package/client/src/App.tsx`
- Optional: thin loading fallback component

- [ ] **Step 1: Convert eager page imports to `React.lazy`**

```tsx
import { lazy, Suspense } from "react";

const FakiehDashboard = lazy(() => import("./pages/water-system/FakiehDashboard"));
const Orders = lazy(() =>
  import("./pages/water-system/Orders").then((m) => ({ default: m.Orders }))
);
const TruckEntry = lazy(() => import("./pages/water-system/TruckEntry"));
// ... same for Material, Storage, Production, Weighbridge, Management, etc.
```

Keep small providers/layout eager (`ThemeProvider`, `AppLayout` / `WaterSystemLayout` as needed).

- [ ] **Step 2: Wrap router outlet in Suspense**

```tsx
<Suspense fallback={<div className="p-6 text-sm opacity-70">Loading page…</div>}>
  <Router />
</Suspense>
```

- [ ] **Step 3: Build check**

```bash
cd frontend-package
npm run build
```

Confirm multiple chunks in `dist/public/assets/` (not one giant page bundle owning every screen).

- [ ] **Step 4: Commit**

```text
perf(frontend): lazy-load water-system routes
```

---

## Phase 6 — Page-specific API cleanup

### Task 6: Truck Entry — resilient loads (no new global polls)

**Files:**
- Modify: `frontend-package/client/src/pages/water-system/TruckEntry.tsx` (~185–219)
- Modify: `frontend-package/client/src/api/truckEntry.ts` (optional `signal`)

- [ ] **Step 1: Keep `Promise.all([fetchOpenOrders, fetchCompletedToday])`** — already good.
- [ ] **Step 2: Ensure loading UI does not block entire layout** — show form shell + skeleton tables while `loading` is true.
- [ ] **Step 3: Pass AbortSignal on unmount** so navigating away cancels `/open` and `/today`.
- [ ] **Step 4: If backend TTFB for `/orders/today` remains >1s**, open Phase 7 backend task (indexes / date filter).
- [ ] **Step 5: Commit**

```text
perf(truck-entry): cancel in-flight loads on unmount
```

### Task 7: FakiehDashboard — reduce mount burst

**Files:**
- Modify: `frontend-package/client/src/pages/water-system/FakiehDashboard.tsx` (~702–732)

**Issue:** On mount, `fetchTotalOrders` fires **8 parallel** list/PLC requests. Combined with SiloContext (before Phase 3) this floods the proxy.

- [ ] **Step 1: Prefer a single backend aggregate endpoint if one exists**; else stagger or cache counts for 60s.
- [ ] **Step 2: Keep the existing 60s interval for hourly/weekly only** (already reasonable).
- [ ] **Step 3: Do not start count fetches until after first paint (`requestIdleCallback` or short `setTimeout(0)`).
- [ ] **Step 4: Commit**

```text
perf(dashboard): reduce parallel count fetches on mount
```

### Task 8: AiAssistant — non-overlapping live poll

**Files:**
- Modify: `frontend-package/client/src/pages/water-system/AiAssistant.tsx` (~809)

- [ ] **Step 1: Replace `setInterval(poll, 1200)` with `usePolling(poll, 2000)`** (page-local only; OK to stay aggressive if non-overlapping).
- [ ] **Step 2: Commit**

```text
fix(ai): prevent overlapping live-state polls
```

---

## Phase 7 — Backend TTFB (only if Phase 0 showed slow direct API)

### Task 9: Truck entry `/orders/today` and `/orders/open`

**Files:**
- Modify: `Backend/routes/truck_entry_routes.py` (~225–274)
- Possibly: Alembic/SQL migration for indexes on `truck_weigh_orders(status)`, `(status, second_ts)`

- [ ] **Step 1: Explain plan with `EXPLAIN ANALYZE`** on the completed-today filter (`timezone` + `date(second_ts)` can prevent index use).
- [ ] **Step 2: Prefer range filter on `second_ts` in UTC/local bounds instead of wrapping column in `func.date(...)` when possible.
- [ ] **Step 3: Ensure `_enrich_truck_maps` does **one** truck/driver query (already pattern) — avoid N+1.
- [ ] **Step 4: Re-measure direct URL TTFB; target **<300ms** for open, **<500ms** for today on typical data volume.
- [ ] **Step 5: Commit**

```text
perf(api): speed truck-entry open/today queries
```

### Task 10: PLC plant orders + silos cache

**Files:**
- Read/adjust: `Backend/config.py` (`PLC_ORDERS_CACHE_TTL_SEC`, pool)
- Align with `docs/BACKEND_PERFORMANCE_ROLLOUT.md`

- [ ] **Step 1: Confirm cache is active in the environment that Vite proxies to.**
- [ ] **Step 2: If `/silos` is still multi-second, profile PLC/DB path; do not compensate by polling faster from the client.
- [ ] **Step 3: Commit only if code/config changes.**

---

## Phase 8 — Dev experience & verification

### Task 11: Document how to measure (operator checklist)

**Files:**
- Create: `docs/FRONTEND_LOAD_PERFORMANCE_CHECKLIST.md`
- Update: `docs/README.md` (one-line link)

- [ ] **Step 1: Write checklist** covering:
  1. Uncheck Disable cache for “normal” feel
  2. Network → Fetch/XHR → watch Pending
  3. Direct backend URLs vs proxied `/api`
  4. Live Orders: max one poll group in flight
  5. Truck Entry: no `/silos` requests
  6. Redirect routes: no full document reload
- [ ] **Step 2: Commit**

```text
docs: add frontend load performance verification checklist
```

### Task 12: Final acceptance pass

- [ ] **Step 1: Cold reload** `/fakieh/fakieh-dashboard` (cache off once) — note Finish / DCL.
- [ ] **Step 2: Navigate Dashboard → Material → Truck Entry → Live Orders** via SPA — no full white reload.
- [ ] **Step 3: Sit on Live Orders 60s** — Pending pile-up absent; UI still updates.
- [ ] **Step 4: Sit on Truck Entry 60s** — only truck-entry + trucks (+ scale live if selected); no silos poll.
- [ ] **Step 5: Optional production-like:** `npm run build && npm run preview` — fewer module requests than Vite dev.
- [ ] **Step 6: Record “After” numbers in Baseline notes below.

---

## Out of scope (intentionally later)

- Full rewrite of `Orders.tsx` (2k+ lines) into smaller modules
- Replacing axios with TanStack Query everywhere (optional follow-up; Query already in app)
- Moving project off OneDrive (ops recommendation only)
- WebSocket push instead of HTTP poll for plant orders (larger backend change; note as future)

---

## Suggested implementation order (one PR series)

1. Task 0 (baseline)  
2. Task 1 (`usePolling`)  
3. Task 2 (Orders) + Task 3 (Silos) ← **highest user-visible win**  
4. Task 4 (Redirects)  
5. Task 5 (Lazy routes)  
6. Tasks 6–8 (page polish)  
7. Tasks 9–10 (backend if still needed)  
8. Tasks 11–12 (docs + acceptance)

Do **not** start with lazy loading alone — it will not fix Pending API queues.

---

## Baseline notes (fill during Task 0 / Task 12)

| Page | Date | Finish | DCL | Slowest API (TTFB) | Pending pile-up? | Notes |
|------|------|--------|-----|--------------------|------------------|-------|
| live_orders | | | | | | |
| truck-entry | | | | | | |
| fakieh-dashboard | | | | | | |
| After fix: live_orders | | | | | | |
| After fix: truck-entry | | | | | | |

---

## Risk & rollback

| Change | Risk | Rollback |
|--------|------|----------|
| Wider poll / non-overlap | UI updates slightly less often | Restore 5s interval; keep in-flight guard |
| Silo poll only on Orders/Storage | Stale silo lists if another page assumed fresh data | Re-enable light poll or fetch-on-focus |
| SPA Redirect | Deep links must still land correctly | Keep Redirect targets identical to old `replace` URLs |
| Lazy routes | Brief Suspense flash | Prefetch on nav hover later |

---

## Quick command reference

```bash
# Frontend
cd fakieh_27aug/frontend-package
npm run start-frontend    # Vite :5173
npm run build
npm run preview

# Backend (example — use your real start command)
cd fakieh_27aug/Backend
# ensure service on 192.168.0.60:5000 matches vite proxy
```

Chrome: **F12 → Network → Fetch/XHR → Timing (Waiting / TTFB)**.

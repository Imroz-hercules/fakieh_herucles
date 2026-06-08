# Frontend performance rollout — change log and reference

This document describes client-side updates that align the water-system UI with the backend performance rollout: KPI pagination (`includeTotal`, `cursor` / `nextCursor`), Postgres reports list shape, and paginated list APIs for materials, production, trucks, and RFID.

---

## 1. Shared KPI pagination helper

**File:** `frontend-package/client/src/utils/kpiFetchAll.ts`

### `fetchAllKpiPages(urlWithPath, baseParams, config?)`

- **`urlWithPath`:** Base URL including path, e.g. `http://localhost:5000/api/kpi` (no trailing `?`).
- **`baseParams`:** `URLSearchParams` with filters already set (`startDate`, `endDate`, `batch`, `product`, `material`, `reportType`, etc.). The helper **overwrites** pagination-related keys.
- **Behavior:**
  - Sets `limit` to **`10000`** per request (backend still clamps to `KPI_MAX_LIMIT`).
  - Sets **`includeTotal=false`** to avoid expensive `COUNT(*)` on each page.
  - Uses **`cursor`** from the previous response’s **`nextCursor`** when available; otherwise increments **`page`**.
  - Stops when **`has_more`** is false, when a page returns **no rows**, or after **`MAX_PAGES` (1000)** guard iterations.
- **Returns:** `Promise<unknown[]>` — concatenation of all `data` arrays from each response.

**Backend response shape expected:**

```json
{
  "data": [ /* rows */ ],
  "has_more": true,
  "nextCursor": "..."
}
```

### When to use

- **Full exports / “load all for charts or CSV”** on:
  - `GET /api/kpi`
  - `GET /api/reports` (KPI batch report)
  - `GET /api/kpi/csv-format-report`
- **Paged table views** that need **`total`** / page numbers should call the API directly with **`includeTotal=true`** and normal `page` / `limit` (see Batch Raw Data).

---

## 2. Batch raw data page

**File:** `frontend-package/client/src/pages/water-system/BatchRawDataPage.tsx`

Typical patterns after the rollout:

- **Filter options:** Uses the batch KPI **`filter-options`** endpoint (see `src/config/api.ts` for `BATCH_FILTER_OPTIONS` or equivalent constant).
- **Table grid:** Uses **`includeTotal=true`** (or default) so **`total`** / **`pages`** remain available for UI pagination.
- **CSV export:** Uses **`fetchAllKpiPages`** against the csv-format-report path so large date ranges are retrieved in chunks without a single 300k-row request.

---

## 3. Batch historical reports

**File:** `frontend-package/client/src/pages/water-system/BatchHistoricalReports.tsx`

- KPI summary and KPI `/reports` loads that previously used a very large **`limit`** now use **`fetchAllKpiPages`** so the backend can stream pages with **`has_more`** / **`nextCursor`** (or page fallback when cursor is absent).

---

## 4. Postgres reports page

**File:** `frontend-package/client/src/pages/water-system/Reports.tsx`

### `normalizeReportListBody(body: unknown): unknown[]`

- List endpoints under **`/api/reports/*`** (daily, weekly, monthly, detailed, material) now return:

```json
{
  "items": [ /* ... */ ],
  "total": 0,
  "limit": 5000,
  "offset": 0,
  "has_more": false
}
```

- **`normalizeReportListBody`** accepts either the **new** shape (`items` array) or a **legacy** bare array for safer migration.

All fetches that populate report tables should flow through this normalizer so both shapes work during rollout.

---

## 5. Materials and production pages

**Files:**

- `frontend-package/client/src/pages/water-system/Material.tsx`
- `frontend-package/client/src/pages/water-system/Production.tsx`

**Materials `GET /api/materials`:** Success payload from `create_success_response` nests pagination under **`data`**:

```json
{
  "success": true,
  "data": {
    "items": [ /* ... */ ],
    "total": 100,
    "limit": 500,
    "offset": 0,
    "has_more": false
  },
  "message": "..."
}
```

The client resolves the list with:

```ts
const list = Array.isArray(inner) ? inner : inner?.items ?? []
```

so both a legacy bare array and the new `{ items }` object work.

**Production:** Same idea — read **`data.items`** when `data` is an object.

**Optional query params** (for large catalogs): `?limit=...&offset=...` — defaults are server-side if omitted.

---

## 6. Trucks and RFID

**Files (representative):**

- `frontend-package/client/src/pages/water-system/TruckEntry.tsx`
- `frontend-package/client/src/pages/water-system/TruckManagement.tsx`
- `frontend-package/client/src/pages/water-system/RFID.tsx`

List responses use the envelope:

```json
{
  "items": [ /* ... */ ],
  "total": 50,
  "limit": 500,
  "offset": 0,
  "has_more": false
}
```

UI code should use **`response.items`** (and **`total`** where shown), not assume the HTTP body is a raw array.

---

## 7. Dashboard and other consumers

**File:** `frontend-package/client/src/pages/water-system/FakiehDashboard.tsx`

Updated where it consumed list APIs that changed shape (materials/production/trucks/etc.), so cards and tables still resolve counts and rows from **`items`** / nested **`data`**.

---

## 8. API configuration

**File:** `frontend-package/client/src/config/api.ts`

- Endpoint constants for batch KPI, filter options, csv report, etc., should remain the single source of truth for paths used by **`BatchRawDataPage`**, **`BatchHistoricalReports`**, and **`fetchAllKpiPages`**.

If you add new callers, prefer:

- **Large reads:** `fetchAllKpiPages` + `includeTotal=false`.
- **Interactive grids:** explicit `limit` + `includeTotal=true` + `page`.

---

## 9. External / secondary frontends

If another repository (for example under **`Khamis/`**) calls the same backend KPI or Postgres report URLs, update those clients similarly:

- Do not assume **300000** default row fetches.
- Parse **`items`** for Postgres **`/api/reports/*`** lists.
- For KPI, support **`has_more`** + **`nextCursor`** or pass explicit **`limit`** with **`includeTotal=true`**.

---

## 10. File index (frontend)

| Concern | File |
|---------|------|
| KPI multi-page fetch | `frontend-package/client/src/utils/kpiFetchAll.ts` |
| Batch raw data | `frontend-package/client/src/pages/water-system/BatchRawDataPage.tsx` |
| Batch historical KPI | `frontend-package/client/src/pages/water-system/BatchHistoricalReports.tsx` |
| Postgres reports list shape | `frontend-package/client/src/pages/water-system/Reports.tsx` |
| Materials / production | `Material.tsx`, `Production.tsx` |
| Trucks / RFID | `TruckEntry.tsx`, `TruckManagement.tsx`, `RFID.tsx` |
| Dashboard | `FakiehDashboard.tsx` |
| API base paths | `frontend-package/client/src/config/api.ts` |

---

## 11. Quick test checklist

1. Open **Batch Raw Data**: filters load; table paginates; CSV export completes for a wide date range without timeout.
2. Open **Batch Historical Reports**: charts/tables populate after chunked KPI fetches.
3. Open **Reports**: each tab loads rows; no “array methods on undefined” errors.
4. **Materials / Production / Trucks / RFID**: lists and KPI cards show non-zero counts when data exists.
5. In browser devtools **Network**, confirm KPI bulk loads use **`includeTotal=false`** and optional **`cursor`** on subsequent requests where `fetchAllKpiPages` is used.

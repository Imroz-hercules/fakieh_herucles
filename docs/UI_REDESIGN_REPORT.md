# Fakieh Water System — UI Redesign Report

**Project:** `frontend-package/client`  
**Scope:** Water-system shell, navigation, Distribution page, Settings page, logos, and light/dark theme fixes  
**Reference design:** Hercules SFMS-style layout (dark navy sidebar + page header, light content area, clean cards)

---

## 1. Executive Summary

The Fakieh water-system frontend was updated from a dark “cyber/industrial” chrome (cyan gradients, matrix effects, dark cards everywhere) toward a cleaner **SFMS-inspired design system**:

| Area | Before | After |
|------|--------|-------|
| **Sidebar** | Dark slate, cyan accents, auto-expanded groups | Flat navy `#0f172a`, blue pill active states, collapsible groups |
| **Page header (sidebar mode)** | White bar (initial attempt) → inconsistent | Dark navy `#0f172a` matching sidebar |
| **Content area** | Often forced dark via `app-chrome-dark` | Light gray `#f3f4f6` in light mode |
| **Distribution page** | Old dark card styling | Reference-style stats bar, search/filters, rule cards |
| **Navigation** | Admin in sidebar list + hamburger in topbar | Settings at sidebar bottom; hamburger in sidebar |
| **Logos** | White box around dark Hercules PNG | White-on-transparent `Hercules_New_white.png` on dark chrome |
| **Topbar mode** | Tabs crowded / clipped | Single-row layout, compact text tabs, no scrollbar |

Two layout modes remain supported via **Settings → Navigation layout**:

- **Sidebar mode** (default): left sidebar + dark page header + light content  
- **Topbar mode**: horizontal top navigation (legacy cyber style preserved for top bar chrome)

---

## 2. Design Goals

1. Match the Hercules SFMS reference: dark sidebar, readable light content, professional cards.
2. Fix **light mode** bugs where sidebar/content stayed dark or text turned black incorrectly.
3. Improve **Distribution** page UX to match the reference product.
4. Clean up **header/branding**: Hercules logo on dark background without a white wrapper box.
5. Ensure **all topbar tabs** are visible on one line without horizontal scroll (where possible).
6. Align **Settings (Admin)** page width/padding with Distribution page.

---

## 3. Application Shell — `WaterSystemLayout.tsx`

### Sidebar mode layout

```
┌─────────────┬──────────────────────────────────────────────────┐
│  Sidebar    │  Page header (#0f172a)                          │
│  (#0f172a)  │  Title + subtitle │ Fakieh/ASM logos │ tools    │
│             ├──────────────────────────────────────────────────┤
│  Nav items  │  Main content (gray-100 / #f3f4f6 light mode)    │
│             │                                                  │
│  Settings   │                                                  │
└─────────────┴──────────────────────────────────────────────────┘
```

### Key changes

- **`showPageTitle` prop** (default `true`): page title/subtitle render in the dark page header instead of inside page content.
- **Page header** uses `water-page-header app-chrome-dark` with `bg-[#0f172a]`, `min-h-[120px]`.
- **Main content** in sidebar mode: `bg-gray-100` (light) / `dark:bg-slate-950` (dark). Removed `app-chrome-dark` from `<main>` so light mode content is actually light.
- **Topbar mode** unchanged in spirit: `WaterTopNav` + matrix/grid decorative background on main.

### Header utilities (sidebar mode)

- Theme toggle (sun/moon)
- Notifications bell
- Settings gear → `/fakieh/admin`
- Profile avatar (gradient circle)

---

## 4. Sidebar — `Sidebar.tsx`

### Visual design

- Background: **`#0f172a`** (flat navy, matches reference)
- Width: **`w-64`** expanded, **`w-[68px]`** collapsed
- Border: `border-slate-800`
- Active nav item: **blue pill** via `sidebar-nav-item--active` class

### Navigation behavior

- **Collapsible groups** (`Orders`, `Trucks`, `Fakieh Reporting`) start **collapsed** (`useState(false)`).
- Groups **auto-open only** when the current route is a child of that group (`useEffect` on `groupActive`).
- Nav spacing: `flex flex-col gap-5` with each entry wrapped in `div.w-full` for even vertical gaps (fixed broken `space-y` from mixed inline/block siblings).

### Typography & sizing

- Nav text: **`text-base`**
- Icons: **`h-5 w-5`**
- Item padding: `px-3.5 py-3.5`, `rounded-xl`

### Header row (menu + logo)

- **Hamburger menu** moved **into sidebar**, left of Hercules logo (was previously in page topbar).
- `onToggle` prop restored for collapse/expand.
- Header row height: **`min-h-[120px]`** (aligned with page header).
- Menu button: `sidebar-menu-toggle` class for light-mode CSS overrides.

### Logo

- Asset: **`Hercules_New_white.png`** (white logo on transparent background)
- **No `bg-white` wrapper** — logo sits directly on dark sidebar
- Sizing: `h-16` / `md:h-20` when expanded; `h-10 w-10` when collapsed
- `object-contain object-left` so full composite displays correctly

### Bottom section

- **Settings** link only (`/fakieh/admin`) — **Admin removed** from main sidebar nav list
- Profile entry removed from sidebar

---

## 5. Top Navigation Bar — `WaterTopNav.tsx`

Used when **Navigation layout → Use top navigation bar** is enabled in Settings.

### Layout (single row)

```
[Hercules logo] | [nav tabs …] | [Fakieh + ASM logos] | [theme] [settings] [profile]
```

### Logo

- Asset: **`Hercules_New_white.png`**
- Original large sizes restored: `h-14` → `xl:h-28`
- **No `max-w` compression** — width follows natural aspect ratio from height
- `object-contain object-left` + `overflow-visible` on wrapper to prevent cropping
- Header `xl:min-h-[132px]` restored for large logo row

### Navigation tabs

- **Compact text-only tabs** (icons removed from topbar tab buttons to save horizontal space)
- **`shortLabel` support** from `navConfig.ts`:
  - `Fakieh Reporting` → **Reporting**
  - `Weighbridge Log` → **Weighbridge**
- Full labels still used in sidebar and dropdown submenus
- Tab styling: `text-xs` / `sm:text-sm`, `shrink-0`, `flex-nowrap`
- **No horizontal scrollbar** on nav
- Dropdown groups use portal-rendered menus (`createPortal`) for correct z-index

### Topbar chrome

- Always dark: `app-chrome-dark`, `bg-slate-950/95`
- Light-mode overrides in `index.css` keep topbar dark even when app theme is light

---

## 6. Partner Logos — `PartnerLogosStrip.tsx`

Shared component for Fakieh + ASM logos in header.

### Variants

| Variant | Where | Visibility |
|---------|-------|------------|
| `sidebar` | Page header (sidebar mode) | Always visible |
| `topnav` | Top navigation bar | `hidden xl:flex` (1280px+) |

### Sizing

**Sidebar header:**
- Fakieh: `h-[4.5rem]`, white background chip
- ASM: `h-[4.5rem]`, white background chip

**Topbar (original large sizes):**
- Fakieh: `h-[5.25rem]` → `2xl:h-28`
- ASM: `h-[5.25rem]` → `2xl:h-28`, wider max-width for banner shape

---

## 7. Hercules Logo Assets

| File | Purpose |
|------|---------|
| `Hercules_New.png` | Original dark-green logo (for light backgrounds / email) |
| `Hercules_New_white.png` | **Created** — color-inverted white version for dark chrome (sidebar + topbar) |
| `Hercules_white.png` | **Created then abandoned** — cropped left-only version; caused text clipping |

### Display fix

- Removed white `bg-white` wrapper spans around logo `<img>` tags
- Use full composite `Hercules_New_white.png` with height-only sizing (no width caps that squash the image)
- `object-left` ensures Hercules + Saudi Tech composite aligns from the left edge

---

## 8. Navigation Configuration — `navConfig.ts`

### Sidebar entries (`sidebarNavEntries`)

1. Fakieh Reporting (group)  
2. Storage  
3. Orders (group)  
4. RFID  
5. Weighbridge Log  
6. Trucks (group)  
7. Distribution  

**Removed from sidebar list:** Admin (access via Settings at bottom)

### Topbar entries (`topNavItems`)

Same routes as sidebar, structured as links + dropdown groups. Admin omitted (gear icon in chrome).

### New type fields

```typescript
shortLabel?: string  // on TopNavLinkItem and TopNavGroupItem
```

---

## 9. Distribution Page — `Distribution.tsx` + `DistributionRuleCard.tsx`

### Page shell

- Uses `WaterSystemLayout` with title **Distribution** / subtitle in header
- Full-bleed page background: `-m-6 min-h-full` with `#f3f4f6` (light) / `#0a0f1a` (dark)
- Padding: `px-6 py-6 md:px-8 md:py-8 lg:px-10`
- Removed duplicate centered “Fakieh distribution” heading from content

### UI components

1. **“+ New Rule” button** — top-right, accent color
2. **Stats bar** — Total / Active / Paused counts with colored dots
3. **Search input** — filter rules by name
4. **Status filter tabs** — All / Active / Paused
5. **Rule cards** (`DistributionRuleCard.tsx`):
   - Left accent bar (green = active, gray = paused)
   - OK / Failed badge from last run
   - Schedule, delivery method, sources, formats
   - Ghost actions: Run now, Edit, Delete
   - Framer Motion enter/exit animations
6. **Rule editor drawer** — `DistributionRuleEditor.tsx` (existing; not fully restyled)

### Theme tokens (`usePageTheme`)

Centralized light/dark colors for surfaces, borders, accent, inputs — avoids fighting global `app-chrome-dark` rules.

---

## 10. Settings / Admin Page — `Admin.tsx`

### Layout alignment with Distribution

- Replaced `max-w-7xl mx-auto` + double padding with Distribution-style shell:
  ```tsx
  className="-m-6 min-h-full space-y-6 px-6 py-6 md:px-8 md:py-8 lg:px-10"
  style={{ background: pageBg }}  // #f3f4f6 light / #0a0f1a dark
  ```
- Content now fills the same width as Distribution (no narrow centered column with large side gaps)

### Sections (unchanged functionally)

- Navigation layout toggle (sidebar ↔ topbar)
- Logo upload
- PLC/SCADA connection settings
- Email configuration (SMTP / Hercules Cloud)
- Link to Distribution rules

---

## 11. CSS Fixes — `index.css`

Global light-mode rules (`:root.light`) were breaking dark chrome areas. Added targeted overrides:

### Sidebar

- `.sidebar-shell`, `.sidebar-nav-item`, `.sidebar-nav-group-trigger`
- `.sidebar-nav-item--active` — blue pill, white text in light mode
- `.sidebar-menu-toggle` — excluded from global `button { color: #000 }` rule
- `button[data-sidebar-group-trigger]` — group trigger colors in light mode

### Page header

- `.water-page-header` — keeps navy background and white title text in light mode
- Overrides for `:root.light .text-white` conflicts inside `app-chrome-dark`

### Topbar

- `header.water-top-nav` — dark chrome preserved in light mode
- `button[data-topnav-item]`, `data-topnav-tool` — tab and utility button colors

### Global button rule exclusion

```css
:root.light button:not(.sidebar-nav-group-trigger):not(.sidebar-menu-toggle):not(...)
```

Prevents sidebar group labels turning black in light mode.

---

## 12. Files Modified

### Components (`frontend-package/client/src/components/water-system/`)

| File | Changes |
|------|---------|
| `WaterSystemLayout.tsx` | Shell layout, dark page header, main bg fix, `showPageTitle` |
| `Sidebar.tsx` | Navy design, nav spacing, menu in sidebar, logo, Settings bottom |
| `WaterTopNav.tsx` | Single-row topbar, compact tabs, logo display, short labels |
| `PartnerLogosStrip.tsx` | Logo sizes, sidebar vs topnav visibility |
| `navConfig.ts` | Sidebar entries (no Admin), `shortLabel` for topbar |

### Pages (`frontend-package/client/src/pages/water-system/`)

| File | Changes |
|------|---------|
| `Distribution.tsx` | Full reference-style redesign |
| `DistributionRuleCard.tsx` | New card component design |
| `Admin.tsx` | Full-bleed layout matching Distribution |

### Styles & assets

| File | Changes |
|------|---------|
| `index.css` | Sidebar, page header, topbar light-mode overrides |
| `assets/Hercules_New_white.png` | **New** — white logo for dark backgrounds |
| `assets/Hercules_white.png` | **New** (unused) — cropped experiment |

---

## 13. What Was NOT Changed (Out of Scope)

These pages still use the **older dark card styling** inside the new shell:

- Fakieh Dashboard (`FakiehDashboard.tsx`)
- Orders, RFID, Storage, Trucks, Weighbridge, Batch pages, etc.
- `DistributionRuleEditor.tsx` — drawer editor not fully restyled to match reference

**Topbar mode** main content area still uses the legacy cyber/grid background when enabled.

---

## 14. Known Trade-offs

1. **Topbar tabs vs logos:** Large Hercules + Fakieh/ASM logos compete for horizontal space. Tabs use compact text and `shortLabel` to fit without scrollbar. Partner logos in topbar only appear at `xl` (1280px+).

2. **Light mode + dark chrome:** Sidebar and page header stay **dark navy** even in light mode (by design, matching SFMS reference). Only the **content area** goes light.

3. **Hercules composite logo:** `Hercules_New_white.png` includes both Hercules and Saudi Tech in one wide image. Height-only sizing is required; width caps caused cropping/display bugs.

4. **Two-row topbar experiment:** Briefly used a two-row topbar (logos row + tabs row); reverted per user request to keep single-row layout.

---

## 15. Testing Checklist

### Sidebar mode + light theme

- [ ] Sidebar background is navy `#0f172a`, text readable
- [ ] Active nav item shows blue pill
- [ ] Collapsible groups start closed; open when child route active
- [ ] Orders/Trucks group labels not black in light mode
- [ ] Hamburger toggles sidebar collapse
- [ ] Hercules logo visible without white box
- [ ] Page header dark; content area light gray
- [ ] Fakieh + ASM logos visible in page header
- [ ] Settings at sidebar bottom opens Admin

### Sidebar mode + dark theme

- [ ] Content area dark; cards readable
- [ ] Distribution page stats, search, filters, cards work

### Topbar mode

- [ ] All tabs visible on one line (Reporting, Storage, Orders, RFID, Weighbridge, Trucks, Distribution)
- [ ] No horizontal scrollbar on nav
- [ ] Hercules logo full size, not cropped
- [ ] Fakieh/ASM logos appear on xl+ screens
- [ ] Dropdown menus (Reporting, Orders, Trucks) open correctly

### Settings page

- [ ] Full-width layout matches Distribution (no large empty side gaps)
- [ ] Navigation layout toggle switches sidebar ↔ topbar

### Distribution page

- [ ] Create / edit / delete / run rule
- [ ] Search and status filters work
- [ ] Cards show OK/Failed badges

---

## 16. How to Toggle Layout Modes

1. Open **Settings** (sidebar bottom or gear icon in header)
2. **Navigation layout** → toggle **Use top navigation bar**
3. Choice persists in browser via `NavLayoutContext`

---

## 17. Summary of User-Requested Iterations

| Request | Resolution |
|---------|------------|
| Light mode sidebar content stayed dark | Removed `app-chrome-dark` from `<main>` |
| Sidebar groups always expanded | `useState(false)` + open only when active child |
| Uneven nav gaps | `flex flex-col gap-5` + wrapper divs |
| Group text black in light mode | `sidebar-nav-*` CSS classes + button rule exclusions |
| SFMS-style Distribution page | Redesigned `Distribution.tsx` + `DistributionRuleCard.tsx` |
| Page title in header | `showPageTitle` in `WaterSystemLayout` |
| Hamburger in sidebar | Moved from page header to `Sidebar.tsx` |
| Hercules logo white box | `Hercules_New_white.png`, no `bg-white` wrapper |
| Settings page side gaps | Same full-bleed shell as Distribution |
| Topbar tabs hidden/clipped | Compact tabs, `shortLabel`, single row, no scrollbar |
| Don't shrink logos | Restored original logo sizes; fixed display with `object-left` + no max-width squeeze |

---

*Report generated from the UI redesign work on the Fakieh water-system frontend. For deployment, ensure `Hercules_New_white.png` is included in the Vite build assets.*

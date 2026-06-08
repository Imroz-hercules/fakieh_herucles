# Distribution module — full reference

This document explains how **report distribution** (scheduled and manual delivery) is built in Hercules: the **rules** UI, **email setup** (Hercules Cloud Email vs custom SMTP), backend APIs, scheduler, and the execution engine.

---

## 1. Concepts at a glance

| Concept | What it is |
|--------|------------|
| **Distribution rule** | A saved row in `distribution_rules`: which report(s), how often, email and/or disk, format, optional AI content. |
| **Email configuration** | Global setting (`config/smtp_config.json` + optional DB key) that chooses **Resend (Hercules Cloud)** or **your SMTP server**. Used by all distribution sends and the test email. |
| **Scheduler** | APScheduler jobs (`distribution_<rule_id>`) that call the same code path as **Run now**. |
| **Execution engine** | `execute_distribution_rule(rule_id)` in `distribution_engine.py`: load templates, query historian, render files, send email / save to disk, log result. |

---

## 2. User-facing pages (two routes)

### 2.1 Distribution rules — `/distribution`

- **Route:** `path="distribution"` under the main app layout in `Frontend/src/Routes/AppRoutes.jsx`.
- **Access:** `ProtectedRoute` with roles **Admin** and **Manager** only.
- **Nav:** `Frontend/src/Data/Navbar.js` — item **Distribution** → `/distribution`.

**Purpose:** Create and manage **rules** (not global SMTP). Users pick reports, schedule, recipients, disk path, format, and email content mode.

| File | Responsibility |
|------|----------------|
| `Frontend/src/Pages/Distribution/DistributionPage.jsx` | Lists rules (`distributionApi.listRules()` → `res.data.data`), search/filter (all / active / paused), open editor, delete, toggle enabled, **Run now**. |
| `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` | Full rule form: name, multi-report select, delivery, format, content mode, recipients, save path (with server folder browser), schedule, enable toggle, save, **Run now**. |
| `Frontend/src/Pages/Distribution/DistributionRuleCard.jsx` | Card layout, quick actions (run, edit). |
| `Frontend/src/API/distributionApi.js` | REST wrapper: `listRules`, `createRule`, `updateRule`, `deleteRule`, `runRule`. |

**Theme:** `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` is imported on the distribution page for consistent styling.

### 2.2 Email configuration — `/settings/distribution`

- **Route:** Nested under **Settings** — `path="distribution"` inside `path="settings"` in `AppRoutes.jsx`.
- **Component:** `Frontend/src/Pages/Settings/ReportDistribution/ReportDistribution.jsx` renders only **`SmtpSection`**.

**Purpose:** Configure **how** the app sends mail (cloud vs SMTP). This is separate from **who** receives each rule (recipients are on each rule on `/distribution`).

#### Email setup page — file names (frontend)

| File path | Role |
|-----------|------|
| `Frontend/src/Pages/Settings/ReportDistribution/ReportDistribution.jsx` | Settings page shell for email; renders `SmtpSection` only. |
| `Frontend/src/Pages/Settings/ReportDistribution/SmtpSection.jsx` | **Email Configuration** UI: Hercules Cloud vs Custom SMTP, sender display, test recipient, Send Test, Save Configuration. |
| `Frontend/src/Pages/Settings/ReportDistribution/RecipientInput.jsx` | Tag-style multi-email input (used on **distribution rules** for per-rule recipients, not for the global SMTP default field layout). |

**Routing / nav (where the page is wired):**

| File path | Role |
|-----------|------|
| `Frontend/src/Routes/AppRoutes.jsx` | Nested route: `settings` → `path="distribution"` → `<ReportDistribution />`. |
| `Frontend/src/Pages/Settings/SettingsHome.jsx` | Settings sidebar links (includes entry to Report Distribution if present in that file’s menu config). |

**i18n (strings for Email Configuration):**

| File path | Role |
|-----------|------|
| `Frontend/src/i18n/en.json` | Keys under `smtp.*` (e.g. `smtp.title`, `smtp.herculesCloud`, `smtp.herculesCloudInfo`). |
| `Frontend/src/i18n/ar.json` | Same `smtp.*` keys (Arabic). |
| `Frontend/src/i18n/hi.json` | Same `smtp.*` keys (Hindi). |
| `Frontend/src/i18n/ur.json` | Same `smtp.*` keys (Urdu). |

**Email setup — backend file names**

| File path | Role |
|-----------|------|
| `backend/smtp_config.py` | Read/write `smtp_config.json`, `get_smtp_config`, `set_smtp_config`, `send_email_resend`, `test_smtp_connection`, `RESEND_FROM`, Resend API key resolution. |
| `backend/app.py` | Routes: `GET/POST /api/settings/smtp-config`, `POST /api/settings/smtp-test` (`get_smtp_config_route`, `set_smtp_config_route`, `smtp_test_route`). |

**Runtime config file (not in repo as committed secrets; created at runtime):**

| Path | Role |
|------|------|
| `config/smtp_config.json` (under `get_config_dir()` from `backend/config_paths.py`) | Persisted `send_method`, SMTP fields, default recipient, etc. |

---

## 3. Email setup page in detail (`SmtpSection.jsx`)

The UI title uses i18n **`smtp.title`** → **"Email Configuration"** (`Frontend/src/i18n/en.json`; same keys exist in `ar.json`, `hi.json`, `ur.json`).

### 3.1 Delivery method (two large cards)

| UI label (English) | Internal `send_method` | Meaning |
|--------------------|-------------------------|---------|
| **Hercules Cloud Email** | `resend` | Uses the **Resend** API with the product cloud sender. Subtitle: *Zero config — works out of the box* (`smtp.herculesCloudDesc`). |
| **Custom SMTP** | `smtp` | Uses **your** SMTP server, credentials, From, TLS. Subtitle: *Use your own mail server* (`smtp.customSmtpDesc`). |

The selected card shows a checkmark (`FaCheck`).

### 3.2 Hercules Cloud Email mode (`send_method === 'resend'`)

1. **Sender block** — Label **`smtp.senderAddress`**. Value comes from GET **`/api/settings/smtp-config`**: the server adds **`resend_from`** from `smtp_config.RESEND_FROM`, i.e. **`Hercules Reports <reports@herculesv2.app>`** (`backend/smtp_config.py`). The UI displays that string in a read-only panel (mono font for the address line).
2. **Info paragraph** — **`smtp.herculesCloudInfo`**: explains reports are sent from the Hercules cloud email service; users add recipients on **distribution rules** only.
3. **Test recipient** + **Send Test** — Input bound to `testEmail`; **`POST /api/settings/smtp-test`** with `{ to_email }`. If the test field is empty, **`handleTest`** uses **`testEmail.trim() || recipient`** (`SmtpSection.jsx`).
4. **Save Configuration** — **`POST /api/settings/smtp-config`** including `send_method: 'resend'`.

**Backend send path:** `distribution_engine._send_email` → `get_smtp_config()` → if `send_method` is **`resend`**, **`send_email_resend`** (`smtp_config.py`). That function sets **`from`** to **`RESEND_FROM`** for every send — users do not change the cloud From address in the UI.

**API key:** `get_resend_api_key()` reads **`system_settings.RESEND_API_KEY`** if present; otherwise migrates/uses an obfuscated fallback in code (`smtp_config.py`). Do not document raw keys in this file.

### 3.3 Custom SMTP mode (`send_method === 'smtp'`)

Shows: short description, **SMTP Server**, **Port**, **Username**, **Password** (show/hide), **From Address**, **Default Recipient**, **Use TLS / SSL** toggle, test row, **Save**.

**Test:** same **`/api/settings/smtp-test`** endpoint; **`test_smtp_connection`** in `smtp_config.py` builds a simple **`EmailMessage`** and uses **`SMTP_SSL`** on port **465** or **`SMTP`** + **`starttls`** on other ports.

**Save:** **`POST /api/settings/smtp-config`**. If password is still **`********`**, `app.py` **`set_smtp_config_route`** merges the previous password from disk.

### 3.4 REST routes for email settings (`backend/app.py`)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/settings/smtp-config` | Returns file-based config; masks `password` as `********`; injects **`resend_from`**. `@login_required`. |
| POST | `/api/settings/smtp-config` | Persists with `smtp_config.set_smtp_config`. |
| POST | `/api/settings/smtp-test` | Runs `test_smtp_connection(to_email)`. |

---

## 4. Distribution rules — features (`distribution_bp.py` + editor)

### 4.1 Rule fields (validation in `_validate_rule`)

| Feature | Details |
|---------|---------|
| **Name** | Rule label. |
| **Reports** | **`report_ids`** array (preferred); legacy **`report_id`** duplicated as first id. At least one report required. |
| **Delivery** | `email`, `disk`, or `both`. Email/both need valid **recipients**; disk/both need **save_path**. |
| **Format** | `pdf`, `html`, `xlsx`. |
| **Content mode** | `report_only`, `report_with_ai`, `ai_only`, `cfo_briefing` (API); UI exposes at least report-only, report+AI, AI-only (AI-only may be disabled until Hercules AI setup is complete). **`ai_only` / `cfo_briefing` + disk** is rejected (email-only modes). |
| **Recipients** | List of emails (regex validated). |
| **Schedule** | `daily` / `weekly` / `monthly` + `schedule_time` `HH:MM` + day-of-week or day-of-month as required. |
| **Enabled** | Drives scheduler registration. |

### 4.2 Folder browser

`DistributionRuleEditor.jsx` calls **`GET /api/distribution/browse-folders`** with optional **`path`** query — implemented in **`distribution_bp.browse_folders`** (Windows drive roots when empty; blocks some system paths).

### 4.3 API summary (`distributionApi.js` + extra)

| Method | Path |
|--------|------|
| GET/POST | `/api/distribution/rules` |
| PUT/DELETE | `/api/distribution/rules/<id>` |
| POST | `/api/distribution/rules/<id>/run` |
| GET | `/api/distribution/browse-folders` |
| GET | `/api/distribution/rules/<id>/log` *(execution history — not yet in `distributionApi.js`)* |

List response shape: **`{ status, data: [...] }`** — frontend uses **`res.data.data`**.

---

## 5. Persistence: `smtp_config.json`

- Path: **`config/smtp_config.json`** (via `config_paths.get_config_dir()` in `backend/config_paths.py`).
- Keys: `send_method`, `smtp_server`, `smtp_port`, `username`, `password`, `tls`, `from_address`, `recipient`.
- **`get_smtp_config()`** uses a short TTL in-memory cache (`smtp_config.py`).

---

## 6. Scheduler (`backend/scheduler.py`)

- **`start_scheduler()`** — `BackgroundScheduler`, then **`rebuild_scheduler_jobs()`**.
- Started from **`desktop_entry.py`** `main()` (production) and **`app.py`** under `if __name__ == '__main__'` for dev CLI.
- Jobs: id **`distribution_<rule_id>`**, trigger from **`schedule_type`** + time (+ day for weekly/monthly).
- Each job calls **`execute_distribution_rule(rule_id)`**.

---

## 7. Engine (`backend/distribution_engine.py`) — execution summary

**`execute_distribution_rule(rule_id)`:**

1. Load rule; resolve **`report_ids`**.
2. **`_time_range_for_schedule`**: daily → 24h rolling; weekly → 7d; monthly → 30d.
3. For each template: historian **`_fetch_tag_data_multi_agg`**, render **XLSX** / **HTML** / **PDF**.
4. Optional **AI** summary/charts per **`content_mode`**.
5. **Email:** **`_send_email`** (Resend vs SMTP per §3). **Disk:** **`_save_to_disk`**.
6. Update **`distribution_rules.last_run_*`**; insert **`report_execution_log`**.

---

## 8. Database

- **`distribution_rules`** — rule definitions (+ **`content_mode`**, **`include_ai_summary`**, **`report_ids`**).
- **`report_builder_templates`** — **`layout_config`** for rendering.
- **`report_execution_log`** — audit rows after each run.
- **`system_settings`** — optional **`RESEND_API_KEY`**.

---

## 9. End-to-end flows

**Scheduled email:** Scheduler → `execute_distribution_rule` → `_send_email` → Resend or SMTP per saved config.

**Manual “Run now”:** UI → **`POST /api/distribution/rules/<id>/run`** → same `execute_distribution_rule`.

**“Send Test” on Email Configuration:** UI → **`/api/settings/smtp-test`** → **`test_smtp_connection`** → test message via Resend or SMTP.

---

## 10. File checklist (distribution + email)

**Distribution rules UI**

- `Frontend/src/Pages/Distribution/DistributionPage.jsx`
- `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx`
- `Frontend/src/Pages/Distribution/DistributionRuleCard.jsx`
- `Frontend/src/API/distributionApi.js`
- `Frontend/src/Routes/AppRoutes.jsx`
- `Frontend/src/Data/Navbar.js`
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` (imported by distribution pages)
- `Frontend/src/i18n/en.json` — `distribution.*`
- `Frontend/src/i18n/ar.json`, `hi.json`, `ur.json` — same keys

**Email setup page (Settings → Report Distribution)**

- `Frontend/src/Pages/Settings/ReportDistribution/ReportDistribution.jsx`
- `Frontend/src/Pages/Settings/ReportDistribution/SmtpSection.jsx`
- `Frontend/src/Pages/Settings/ReportDistribution/RecipientInput.jsx`
- `Frontend/src/i18n/en.json` — `smtp.*` (+ `ar.json`, `hi.json`, `ur.json`)

**Backend**

- `backend/distribution_bp.py`
- `backend/distribution_engine.py`
- `backend/scheduler.py`
- `backend/smtp_config.py`
- `backend/config_paths.py` (config directory for `smtp_config.json`)
- `backend/app.py`
- `backend/desktop_entry.py`

**Related**

- `backend/segment_engine.py`
- `backend/ai_chart_generator.py`
- `backend/ai_prompts.py`
- `backend/migrations/*.sql` (distribution-related migrations in `MIGRATION_ORDER`)
- `Frontend/src/Pages/Settings/ExportImport/ExportImport.jsx` (distribution rule export/import)

---

*Internal engineering reference. User-facing strings: `Frontend/src/i18n/en.json` (`smtp.*`, `distribution.*`).*

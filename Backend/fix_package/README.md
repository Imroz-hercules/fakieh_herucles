# Fakieh / Hercules / SIMATIC — Fix Package (REVIEW FIRST, DO NOT EXECUTE YET)

**Status:** Generated for operator review. **Nothing has been executed.** No object on any server
has been created, altered, dropped, enabled, disabled, or written. Execute only after you approve,
and only in the documented order, on the documented server.

## What this fixes
- **Package A (immediate hotfix + backfill)** — corrects the 3 confirmed bugs in the reporting-box
  pipeline and recovers the **26 missing completed Server1 batches** (materials only; real headers are
  unrecoverable). Runs on **`DESKTOP-N8PGI9S\FAKIEH_REPORTING` / `ASMBatchReports`** (SQL 2022).
- **Package B (final durable source-side capture)** — design + scripts to build a durable, idempotent,
  set-based snapshot of live `Batch` + `ParValueOnline` on **OS1 and OS2**, then repoint reporting at
  those durable copies. **Design only — separately approved before any execution.**

## Run order (each file is idempotent and re-runnable)
| # | File | Server | Writes? | Gate |
|---|------|--------|---------|------|
| 1 | `00_Preflight.sql` | Reporting | Creates 1 backup table only | `@BackupConfirmed=1` after you take a real DB backup |
| 2 | `10_PackageA_Hercules_Hotfix.sql` | Reporting | `ALTER` 3 procs | Preflight passed; jobs idle |
| 3 | `20_PackageA_Backfill.sql` | Reporting | Inserts into BatchCopy/BatchMaterials | `@Execute=1` (defaults to **dry-run/rollback**) |
| 4 | `30_PackageA_Validation.sql` | Reporting | Read-only | — |
| 5 | `40_PackageB_Final_Durable_Capture_Design.sql` | OS1, OS2, Reporting | DDL/procs/jobs | **Separately approved**; Section 0 speed-bump; Section 1a schema-assert must pass before 1b; run section-by-section |
| 5b | `41_PackageB_Trigger_Alternative_DESIGN.sql` | — | **None (design-only)** | Reference only; top `THROW` makes it a no-op |
| 6 | `50_PackageB_Shadow_Validation.sql` | Reporting | Shadow table only | After capture has run a while |
| 7 | `90_Rollback.sql` | Reporting (+OS) | `ALTER` procs back / restore saved job states | Emergency / revert |

> Package A (00–30) is the executable, guarded hotfix+backfill. Package B (40) is
> executable but section-gated and separately approved; the trigger alternative is
> isolated in 41 as design-only (no DDL). Each Package-A write step is reversible by `90_Rollback.sql`.

### Revision note (review round 2)
Applied 10 corrections: valid capture SQL (no `MERGE INSERT…SELECT`); removed unproven `PlanEnd`;
live schema/type assertion before any capture DDL; preflight hard-fails unless all 6 proc bodies are
captured non-null; live-body guards before each `ALTER`; backfill blocks commit if the missing set ≠
expected 26 (override flag); job matching by `LIKE` not exact Unicode names; job states saved/restored
via `dbo._FixBackup_JobState`; durable staging keyed on `SourceServer` + full PV source PK; executable
Package B separated from design-only trigger notes.

## Non-negotiable rules honored
No blind rollback · no data deletion · unique indexes kept · `ROW_NUMBER() rn=1` kept · material
filters kept · Source-Server-aware matching (no GUID-only) · no `POBJID+28000` · no remote writes from
SIMATIC triggers · vendor `tr_*Merger` untouched · no insert-only trigger capture · no cutover before
shadow validation passes.

## Two operator prerequisites for Package B (documented, not auto-done)
1. **OS1 SQL Server Agent is STOPPED (Manual).** It must be set to **Automatic** and **started** for the
   local capture job to run. `40_…` does not change service state — that is an explicit OT action.
2. **OS2 has no local capture DB** and its Agent state must be verified/started. `40_…` creates the DB
   and job but you must confirm Agent is running on OS2.

## Key design decisions (rationale in `40_…` header)
- **Default capture = local SQL Agent snapshot job every 1 minute**, set-based idempotent `MERGE`,
  keyed on the **full source PK**. Trigger capture is provided **only** as a discouraged alternative.
- **New dedicated DB `HerculesCapture` on both OS1 and OS2** (symmetry; leaves the existing empty OS1
  `ASMBatchReports` scaffolding untouched). Reuse-`ASMBatchReports` variant is noted as acceptable.
- Reporting repoints `StagePV`/`Upsert` to read the **durable OS copies** for historical headers,
  preserving `Batch.OGUID = ParValueOnline.ROOTGUID`, Source-Server tagging, `rn=1`, and the unique
  indexes / MERGE keys.

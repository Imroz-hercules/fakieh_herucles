# Fakieh — NFM-clone durable capture (REVIEW-ONLY, EXECUTE NOTHING)

Cloned from NFM, **bound to Fakieh's real discovered schema**, with the requested guardrails.
**Nothing here has been executed.** Run only after review + the marked approvals.

## Pre-build gate (passed, read-only)
Vendor `tr_BatchMerger` and `tr_BatchChangesMerger` are `INSTEAD OF INSERT` that **MERGE into their
base tables** (`SIMATIC_BATCH.Batch` / `.BatchChanges`). Therefore an `AFTER INSERT, UPDATE` capture
trigger on those base tables **will fire**. Capture design is valid. (Bodies: `../_ro_vendor_trigs.txt`.)

## Run order
| # | File | Server | Approval |
|---|------|--------|----------|
| 10 | `10_OS2_ASMBatchReports_DDL.sql` | **OS2** (FAKIEH_SERVER2) | DBA |
| 20 | `20_Idempotency_Indexes_and_Log.sql` | **OS1 + OS2** | DBA |
| 30 | `30_Capture_Triggers.sql` | **OS1 + OS2**, in `SimaticBatch` | **OT / Siemens approval REQUIRED** |
| 40 | `40_Grants.sql` | **OS1 + OS2**, in `ASMBatchReports` | DBA (target-DB grant, not a SIMATIC change) |
| 50 | `50_Central_Proc_and_Job.sql` | **CENTRAL** (FAKIEH_REPORTING) | DBA |
| 90 | `90_Rollback.sql` | as noted per section | DBA / OT |
| 95 | `95_Shadow_Validation_ReadOnly.sql` | CENTRAL + OS (read-only) | — |

## Guardrails applied
1. **No `+15000`/`+28000` offsets** anywhere (Fakieh has no Siemens ID reset — preserve exact source IDs).
2. Every trigger binds to **`SIMATIC_BATCH.*` real columns from discovery**, not NFM literals.
3. **Safe trigger pattern (all):** `SET NOCOUNT ON; SET XACT_ABORT OFF;` body in `TRY/CATCH` that
   **logs and NEVER rolls back** — a capture failure can never block/roll back a SIMATIC write. All
   set-based from `inserted`/`deleted`; **no cursors**, multi-row safe.
4. OS2 targets are an **exact mirror of OS1's column lists** (generated from OS1 `sys.columns`).
5. **Idempotency:** `BatchCopy` UNIQUE(`OGUID`); `OrderDetails` UNIQUE(`ROOTGUID,OrderId`);
   `ParValueOnline_copy` **left NON-unique** (accumulates PV versions; the proc dedups via `rn=1`).
6. **BatchCopy 56-col mapping reconciled** — see the mapping table in `30_Capture_Triggers.sql`.
7. Central proc restored, reads `[FAKIEH_SERVER1]/[FAKIEH_SERVER2]` durable copies, `COLLATE
   DATABASE_DEFAULT` on cross-server string joins, per-server `BatchTransferTime` watermark, `'Server1'/
   'Server2'` literals (per-server copies have no SourceServer column).
8. Pull login (`LinkUser` on OS1, `fakieh_login` on OS2) granted SELECT on the 3 copy tables (`40`).
9. Packaged with rollback + read-only shadow validation. Every `SimaticBatch`-DB object is marked
   **OT/Siemens approval required**.

## ⚠ Reconciliation items to confirm against NFM source BEFORE execution
- **R1 — 7 BatchCopy columns have no Fakieh source** (`CreatedTSHostId, Deleted, DeletedTSHostId,
  Withdrawn, Export, ModifiedBits, CurrentBatchDataId`): set **NULL** here. Confirm NFM does the same
  (they are not consumed by the report). 
- **R2 — `Fat_Totalizer` filter:** the exact predicate is in NFM's proc, which I do not have. `50` keeps
  Fakieh's proven material filter and marks the Fat_Totalizer exclusion as a **TODO placeholder**.
- **R3 — OrderDetails capture:** `Order→OrderDetails` mapping is **unresolved** from discovery
  (`SIMATIC_BATCH.Order` has no `OrderId`/`OrderCategory` columns; OrderDetails is an Order⋈OrderCategory
  projection). The Order trigger is included as a **commented stub**; needs NFM's `CopyOrder` source and
  confirmation that `tr_Order` writes its base table (the pre-build gate only covered Batch/BatchChanges).
  *OrderId for the report already comes from `Batch.OrderId`, so this is non-blocking for batch reporting.*

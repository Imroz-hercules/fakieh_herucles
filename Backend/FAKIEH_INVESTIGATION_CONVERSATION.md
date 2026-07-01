# Fakieh / Hercules / SIMATIC Batch — Investigation Conversation (Transcript)

> Faithful transcript of the read-only production investigation session.
> Date: 2026-06-20. Operator login: `DESKTOP-N8PGI9S\Hercu` (sysadmin, Windows auth).
> Constraint honored throughout: **investigation only — nothing in SQL Server was added or modified.**
> Companion deliverable: [FAKIEH_PROD_STATE_INVESTIGATION.md](FAKIEH_PROD_STATE_INVESTIGATION.md).

---

## USER (task prompt loaded: `Prompt-Codex-Prod-after-investigation.md`)

**ROLE** — Production SQL investigation agent for the Fakieh / Hercules / SIMATIC Batch issue. Self-contained prompt; do not require external `.md` files.

**IMPORTANT — this run is investigation only.** Do not fix, deploy, ALTER procedures, create/drop/disable/enable triggers or jobs, or INSERT/UPDATE/DELETE/MERGE/TRUNCATE.
**Allowed:** SELECT, catalog/metadata reads, msdb job metadata/history SELECTs, `OBJECT_DEFINITION` reads, read-only linked-server `OPENQUERY`, optional `EXEC master.dbo.xp_fixeddrives` for disk sizing.

**GOAL** — Prove the exact current production state before any fix is designed.

**Main theory to prove or disprove:** Fakieh originally used durable local copy tables on the OS/SIMATIC servers, similar to NFM:
- `[FAKIEH_SERVER1].ASMBatchReports.dbo.BatchCopy` / `ParValueOnline_copy`
- `[FAKIEH_SERVER2].ASMBatchReports.dbo.BatchCopy` / `ParValueOnline_copy`

The 2026-06-17 rework appears to have moved the pipeline away from those local copy tables toward live SimaticBatch reads at pull time — which would explain missing future batches when SIMATIC purges headers.

**Known servers:**
- Reporting: `DESKTOP-N8PGI9S\FAKIEH_REPORTING`, DB `ASMBatchReports`
- `FAKIEH_SERVER1` / `OS1_SQL` = `OS1\INFSERVER`, 192.168.1.50
- `FAKIEH_SERVER2` = `OS2\INFSERVER`, 192.168.0.51

The prompt then enumerated what to collect (topology, current pipeline, data state, OS1/OS2 local DB state, SIMATIC state, trigger history, NFM comparison, capacity/safety, implementation prerequisites), 19 mandatory questions, and a required final-report format.

**Follow-up:** "generate this conversation as it is exactly into a md findings document." (this file)

---

## ASSISTANT — Approach

Recognized this as an OT-production-safety-critical, read-only forensic task (reinforced by persistent memory: *"DO NOT ADD OR MODIFY ANYTHING IN THE SQL SERVER"*). Found substantial prior read-only investigation already on disk and chose to consolidate that evidence, close the remaining gaps with **one** focused read-only pass (deliberately **not** parallelized, to keep OT load minimal), then synthesize the report.

**Connection method (established, read-only):** `pyodbc` → `DESKTOP-N8PGI9S\FAKIEH_REPORTING` with `Trusted_Connection=yes`, `autocommit=True`, `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED`; `datetimeoffset` (ODBC type −155) handled via an output converter; OS1/OS2 reached strictly through read-only `OPENQUERY` on linked servers.

### Evidence reviewed (prior phases, Backend/)
- `_ro_phase1_out.txt` — reporting schema/indexes/watermarks/backups (run as datareader; re-run later as sysadmin).
- `_ro_p2_out.txt` — SIMATIC tables/keys/triggers/live state on OS1 & OS2.
- `_ro_p3_out.txt` — OS DB inventory; OS1 copy-table schema; OS2 absence.
- `_ro_p4_out.txt` — OS1 job/schedule/file sizes.
- `_ro_full_out.txt` — full proc bodies, data state, 26-GUID missing list, rework default-trace timeline.

### Gaps identified and closed this session
- `_ro_p5_out.txt` — OS1 `RetrieveAndStoreAllBatchData_S1` **body** (recovered via `sys.sql_modules`), OS1 job **real** run-state + Agent status, source PKs for `ParValueOnline`/`Order`, full DDL metadata of OS1 copy tables, DB file sizes, refreshed missing/dup counts.
- `_ro_p6_out.txt` — free disk via `sys.dm_os_volume_stats` (because `xp_fixeddrives` cannot be introspected through `OPENQUERY`).

All runs returned exit 0; no object was altered.

---

## Key evidence captured (verbatim highlights)

### Topology & linked servers
```
Reporting : DESKTOP-N8PGI9S\FAKIEH_REPORTING  16.0.1180.1 (SQL2022)  login DESKTOP-N8PGI9S\Hercu (sysadmin)
OS1       : OS1\INFSERVER  192.168.1.50  14.0.1000.169 (SQL2017 Standard)
OS2       : OS2\INFSERVER  192.168.0.51  14.0.1000.169 (SQL2017 Standard)

Linked server     data source              provider   remote login   role
FAKIEH_SERVER1    192.168.1.50\INFSERVER    SQLNCLI11  LinkUser       NOT sysadmin
FAKIEH_SERVER2    192.168.0.51,1433         SQLNCLI11  fakieh_login   sysadmin
OS1_SQL           192.168.1.50,1433         SQLNCLI    sa             sysadmin
```

### Databases per server
```
Reporting : ASMBatchReports (+ system)
OS1       : ASMBatchReports, SimaticBatch, ReportServer* (+ system)
OS2       : SimaticBatch, ReportServer* (+ system)   <-- NO ASMBatchReports, NO HerculesCapture
```

### OS1 local copy DB — scaffolded but empty
```
ASMBatchReports objects (OS1), all created 2025-08-11, never modified:
  proc RetrieveAndStoreAllBatchData_S1
  BatchCopy=0 rows, ParValueOnline_copy=0 rows, OrderDetails=0 rows,
  BatchMaterials=0 rows, DataSyncTracker=1 row (LastTimeStamp NULL)

OS1 SQL Agent (INFSERVER): STOPPED (startup_type=Manual)
Job RetrieveAndStoreAllBatchData_S1: enabled, Every_10_Minutes,
  last_run_date=0, last_run_outcome=5, history rows=0  -> NEVER RAN

Body search across all SimaticBatch modules for BatchCopy/ParValueOnline_copy/
  ASMBatchReports/HerculesCapture/CopyBatch/CopyParValue = 0 rows on both OS servers.
```
`RetrieveAndStoreAllBatchData_S1` *consumes* the local copies (`BC.OGUID = PV.ROOTGUID` → local `BatchMaterials`); **nothing populates** `BatchCopy`/`ParValueOnline_copy`.

### Reporting-box current pipeline (the live system)
```
Jobs (enabled, every 10 min, owner Hercu, 0 failures since 2026-06-01):
  Collect Server1 -> BatchMaterials :  EXEC usp_Collect_From_Server1
  Collect Server2 -- Batch          :  EXEC usp_Collect_From_Server2

usp_Collect_From_Server1 = StagePV_FromServer1 -> Upsert_BatchCopy_FromPV -> Merge_BatchMaterials_FromLocal
usp_Collect_From_Server2 = StagePV_FromServer2 -> Upsert_BatchCopy_FromPV -> Merge_BatchMaterials_FromLocal
```

### The three regressions (proc bodies + default trace; all 2026-06-17, via SSMS as Hercu)
1. **`usp_Upsert_BatchCopy_FromPV`** — `LEFT JOIN Batch b ON b.OGUID=a.ROOTGUID`; INSERT writes `ROOTGUID = S.BatchROOTGUID` (= live `b.ROOTGUID`). Header purged → `b` NULL → `ROOTGUID` NULL, but `BatchCopy.ROOTGUID` is `NOT NULL` → headerless batch excluded. `OGUID` has `ISNULL(b.OGUID,a.ROOTGUID)` fallback; `ROOTGUID` has none. `Name`→`'Auto from PV'`, `FormulaCategoryName`→NULL.
2. **`usp_StagePV_FromServer2`** — copy-paste bug: reads `FROM [FAKIEH_SERVER1]…ParValueOnline` and tags `'Server1'`.
3. **`usp_Merge_BatchMaterials_FromLocal`** — `INNER JOIN` + `WHERE FormulaCategoryName IS NOT NULL AND ISNULL(Name,'')<>'Auto from PV'` drops exactly the rows bug #1 creates.

Default-trace window 2026-06-16 15:24 → 2026-06-17 16:54: repeated `ALTER` of the 4 procs, backup-table creation, `IX_*`/`UX_*` index creation, and the rename of `RetrieveAndStoreAllBatchData` → `_OLD` (whose body still reads OS1-local copies — proof of the *intended* old design).

### SIMATIC source state & keys
```
Batch PK          : (ROOTGUID,ROOTOBJID,ROOTOTID,OGUID,OBJID,OTID)      OS1 live=1 row, OS2 live=0
ParValueOnline PK : (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID)  append-style
Order PK          : 6-col OGUID pattern                                 OS1=3, OS2=4
BatchArchive      : 0 rows on BOTH servers  -> NO header retention
Join              : Batch.OGUID = ParValueOnline.ROOTGUID  (verified: 1 batch <-> 3608 PV rows on OS1)
ParValueOnline (OS1 live): 3608 rows / 27 params / max ActivationCounter=6 over ~100 min, 1 ROOTGUID
48 vendor INSTEAD OF triggers (tr_*Merger) on SimaticBatch; none custom, none disabled, none in 06-16..18 window.
```

### Data-quality / impact
```
Reporting dups in BatchMaterials      : 0
Watermarks: Server1 & BatchCopy = 2026-06-19 16:34 ; Server2 FROZEN at 2026-06-16 11:45
PV_copy by source: Server1 335,065 rows/96 roots (flowing) ; Server2 45 rows/1 root (dead) ; legacy 22,793/483
ROOTGUIDs on >1 server                : 0   -> GUID-only matching safe; no POBJID+28000 offset needed
Missing completed qualifying batches  : 26 (all Server1), 812 qualifying material rows waiting in PV_copy
```

### Missing GUID list (26)
```
E9B1C8C4-B797-42DA-8B87-00E29BE19E77   2026-06-17 13:13 -> 14:40   3696/34
C9EA50A4-77DE-496C-8B61-BB4CA00D920E   2026-06-17 13:13 -> 15:06   3797/31
825D1A9E-186E-4A7A-993C-88CF8D431E1C   2026-06-17 14:46 -> 15:45   3771/31
0C27FCC7-11D6-4E49-950F-DE29E2A96475   2026-06-17 15:28 -> 16:12   3695/26
61EE3DC3-DC48-4D5D-9204-ACAD3C37F8E4   2026-06-18 08:27 -> 08:52   3691/32
230E2754-7562-4F51-8DC5-A744F2820E03   2026-06-18 08:27 -> 09:15   3667/34
3EA335E0-092E-449C-AA6B-234B85D79F85   2026-06-18 09:24 -> 10:07   3594/36
11FFDE0E-E521-4C28-A06D-C5CDDBA7FBB8   2026-06-18 09:24 -> 10:13   3586/25
61C62215-C161-41E4-8A41-6DB0D1FDDC0E   2026-06-18 10:04 -> 10:45   3686/32
169B7C35-6BC8-411C-BE5E-D2D657D2E593   2026-06-18 10:04 -> 11:34   3708/33
D327186B-6D08-4A14-BC54-A48AC3CC166E   2026-06-18 12:03 -> 12:52   3680/37
721CFFEF-6654-428B-98BB-BE0219B558FC   2026-06-18 12:04 -> 13:26   3700/32
DA7EC133-825D-4F7B-836C-780D6614D0FB   2026-06-18 13:13 -> 13:42   3702/31
DDDB4502-6BF0-491C-A48B-EF6CC2819CC6   2026-06-18 15:10 -> 16:26   3616/32
924C1176-37FA-4873-A7AD-16882C0FCD12   2026-06-19 06:09 -> 06:39   3908/37
674691B9-1C4E-4A44-87D3-703F398D6EDA   2026-06-19 06:38 -> 07:51   3614/34
482BA306-230E-478B-9829-59A0BF398330   2026-06-19 07:53 -> 08:55   3592/28
8A784E4D-B38B-4B59-9C93-FA961E715868   2026-06-19 09:04 -> 11:08   3612/29
6FA52756-8EEE-41C5-B3ED-644F855C1C29   2026-06-19 10:43 -> 11:20   3594/27
FF3E6C59-AD25-4AEE-956B-24E7D67D2934   2026-06-19 11:40 -> 12:05   3618/28
DFD3060E-B22E-4761-99C1-949618F6FD8B   2026-06-19 11:41 -> 12:44   3592/30
B7E12D85-3607-47F5-9991-1EDE92D4594A   2026-06-19 11:41 -> 13:10   3578/29
73069163-2006-4207-BB50-4EC4F16514A9   2026-06-19 12:09 -> 13:40   3594/31
61A74053-64A3-422F-A5F7-39F843F770F6   2026-06-19 12:09 -> 13:58   3610/34
F238A5E1-14F9-4ED4-A30B-B2C894D98FF2   2026-06-19 14:53 -> 15:23   3602/32
504BD727-893D-41B5-AC4C-9767D586CF28   2026-06-19 14:53 -> 15:49   3602/27
```

### Capacity
```
Volume          Total     Free
Reporting C:    499.4 GB  398.8 GB
OS1 C:           99.5 GB   44.8 GB
OS2 C:           99.5 GB   56.8 GB
DB files: reporting ASMBatchReports 200MB data/328MB log; PV_copy ~99MB/715,806 rows.
OS1 SimaticBatch ~384MB; OS2 SimaticBatch ~256MB.  -> ample everywhere.
xp_fixeddrives blocked via OPENQUERY (err 11519, extended-proc metadata); used dm_os_volume_stats instead.
```

---

## ASSISTANT — Final findings

### Headline — the main theory is *refined*, not confirmed
The "durable OS-local copy-table architecture" **was scaffolded but never operational** — it is **not** a working system the rework removed:
- OS1 has the copy DB + consumer proc + 10-min job, but every copy table is **0 rows, never modified since 2025-08-11**, watermark NULL.
- **Nothing populates** the copy tables (no trigger/module/job references them), and **OS1 SQL Agent is STOPPED**, so the job **never ran**.
- **OS2 has no `ASMBatchReports` DB at all.**

The missing piece is NFM's **durable source-side capture**, which Fakieh **never had**. The fix is a **build**, not a **restore**.

### The live pipeline + root cause
Two reporting-box jobs (10-min) read **live** `SimaticBatch.Batch`/`ParValueOnline` and write reporting-box-local copies. Live `Batch` holds only the current batch (evicted when the next starts — not time-based), `BatchArchive` is **empty**, and the pipeline reads the header at pull time → a batch finishing inside the 10-min window loses its header, then the 3 bugs drop it.

### Hard numbers
- **26** completed qualifying Server1 batches missing (812 material rows captured in `ParValueOnline_copy`, never merged).
- Duplicates: **0**.
- Source keys: `Batch.OGUID`; `ParValueOnline` 8-col PK incl. `ActivationCounter`,`EventID`; join `Batch.OGUID = ParValueOnline.ROOTGUID`.
- **No `POBJID+28000` offset** needed (GUIDs globally unique; 0 ROOTGUIDs on >1 server).
- Disk ample (399/45/57 GB free); SIMATIC DBs tiny.
- **Unrecoverable:** the 26 batches' *headers* (product/formula-category/qty/order) — purged from live `Batch`, `BatchArchive` empty. Their *material rows survive* in `ParValueOnline_copy`.

### Recommended path (design only — no script generated, per instruction)
1. **Build durable source-side capture** on **both** OS1 and OS2: snapshot live `Batch` + `ParValueOnline` on a ≤1–2 min cadence into per-OS copy tables via `MERGE` on the full PKs (freeze the header before SIMATIC evicts it). Requires SQL Agent running on the OS servers (OS1's is stopped) or capture driven from the reporting box.
2. **Repoint the merge** at the durable copies (proven `BC.OGUID = PV.ROOTGUID` path), keeping `Source Server` tagging, `rn=1` dedup, and the unique indexes (the good parts of the rework).
3. **Fix the 3 bugs**: ROOTGUID fallback so headerless batches still insert; correct `usp_StagePV_FromServer2` to `FAKIEH_SERVER2`/`'Server2'`; relax the merge filter so `Auto from PV`/NULL-category rows are retained (or backfill headers later).
4. **Back-load the 26 batches' materials** from `ParValueOnline_copy` (headers stay `Auto from PV`).
5. **Add PK/unique** to the OS1 copy heaps if they are revived.

### Open item (out of scope; does not affect the fix)
Pre-2025-08 Server1 history exists in `BatchMaterials` despite the OS copies being empty — likely an earlier mechanism or backfill; not traced.

---

## Deliverables produced this session
- `docs/FAKIEH_PROD_STATE_INVESTIGATION.md` — full structured report (19 mandatory answers, topology, inventories, data quality, evidence appendix).
- `docs/FAKIEH_INVESTIGATION_CONVERSATION.md` — this transcript.
- `Backend/_ro_p5.py` + `_ro_p5_out.txt`, `Backend/_ro_p6.py` + `_ro_p6_out.txt` — the gap-closure read-only scripts/outputs (join the prior `_ro_*` evidence).

*No SQL Server object was created, altered, or dropped. No data was written. All access was SELECT / catalog / `OBJECT_DEFINITION` / `sys.sql_modules` / msdb-history / read-only `OPENQUERY` / `dm_os_volume_stats`.*

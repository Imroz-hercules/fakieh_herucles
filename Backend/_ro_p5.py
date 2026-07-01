"""
READ-ONLY Phase 5 — close the remaining gaps for the production-state report.
HARD RULE: DO NOT ADD OR MODIFY ANYTHING IN SQL SERVER.
Only SELECT / catalog reads / sys.sql_modules / msdb history SELECT / xp_fixeddrives (disk sizing).
autocommit=True, READ UNCOMMITTED, NOLOCK, TOP-limited. No DDL/DML/EXEC-of-app-procs ever.
Writes _ro_p5_out.txt (UTF-8).

Gaps closed:
  A. OS1 RetrieveAndStoreAllBatchData_S1 body via ASMBatchReports.sys.sql_modules (OBJECT_DEFINITION
     returned NULL earlier because it ran in remote 'master' context).
  B. OS1 local-copy job REAL run-state (sysjobservers last_run, sysjobactivity, schedule attach) + Agent status.
  C. OS1 & OS2 source PK/unique keys for ParValueOnline + Order (Batch already captured in p2).
  D. OS1 local-copy tables FULL DDL metadata (type/len/prec/scale/collation/nullable/identity/default/computed)
     + every index/constraint on BatchCopy/ParValueOnline_copy/OrderDetails/BatchMaterials/DataSyncTracker.
  E. Disk capacity: xp_fixeddrives on reporting + OS1 + OS2; SimaticBatch/ASMBatchReports DB file sizes;
     reporting ParValueOnline_copy size.
  F. OS1 ParValueOnline live volume by day (capture-cadence sizing) + is it UPDATE-in-place (online values)?
  G. Reporting: refresh current missing-batch count + dup=0 re-check (time has advanced to 2026-06-20).
"""
import struct
import pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_p5_out.txt",
           "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d%+03d:%02d" % (t[0], t[1], t[2], t[3], t[4], t[5], t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def run(cur, label, sql, cap=300, cw=220):
    """Local (reporting box) SELECT."""
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                w(" | ".join(cols))
                rows = cur.fetchall()
                for r in rows[:cap]:
                    w(" | ".join("" if v is None else str(v)[:cw] for v in r))
                w(f"({len(rows)} rows)")
            else:
                w("(no resultset)")
            if not cur.nextset():
                break
    except Exception as e:
        w(f"ERROR: {str(e)[:400]}")


def oq(cur, label, ls, remote_sql, cap=200, cw=220, body=False):
    """Remote read-only SELECT via OPENQUERY (single quotes doubled once)."""
    esc = remote_sql.replace("'", "''")
    sql = f"SELECT * FROM OPENQUERY([{ls}], '{esc}')"
    w(f"\n----- [{ls}] {label} -----")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        if body:
            for r in cur.fetchall():
                for v in r:
                    w("" if v is None else str(v))
            return
        if cols:
            w(" | ".join(cols))
            rows = cur.fetchall()
            for r in rows[:cap]:
                w(" | ".join("" if v is None else str(v)[:cw] for v in r))
            w(f"({len(rows)} rows)")
        else:
            w("(no resultset)")
    except Exception as e:
        w(f"ERROR: {str(e)[:400]}")


# DDL-metadata query template (runs cross-db via 3-part names; {OBJ} is a dbo.table name)
DDL_COLS = (
    "SELECT c.column_id, c.name col, ty.name dtype, c.max_length, c.precision, c.scale, "
    "c.collation_name, c.is_nullable, c.is_identity, c.is_computed, "
    "ISNULL(dc.definition,'') default_def "
    "FROM ASMBatchReports.sys.columns c "
    "JOIN ASMBatchReports.sys.types ty ON ty.user_type_id=c.user_type_id "
    "LEFT JOIN ASMBatchReports.sys.default_constraints dc ON dc.object_id=c.default_object_id "
    "WHERE c.object_id=OBJECT_ID('ASMBatchReports.dbo.{OBJ}') ORDER BY c.column_id"
)


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 120
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"PHASE 5 GAP CLOSURE @ local {datetime.now().isoformat()} (Windows-auth sysadmin, READ-ONLY)")
    run(cur, "0.identity", "SELECT @@SERVERNAME s, SUSER_SNAME() lg, "
        "IS_SRVROLEMEMBER('sysadmin') sa, CONVERT(varchar(40),SYSDATETIMEOFFSET()) now")

    # ================= A. OS1 old local-copy populator proc body =================
    w("\n############## A. OS1 RetrieveAndStoreAllBatchData_S1 BODY ##############")
    oq(cur, "OS1 proc body via sys.sql_modules", "OS1_SQL",
       "SELECT sm.definition FROM ASMBatchReports.sys.sql_modules sm "
       "JOIN ASMBatchReports.sys.objects o ON o.object_id=sm.object_id "
       "WHERE o.name='RetrieveAndStoreAllBatchData_S1'", body=True)
    # any OTHER programmable object in OS1.ASMBatchReports (views/fn/other procs)
    oq(cur, "OS1 ASMBatchReports all programmable objects", "OS1_SQL",
       "SELECT o.type_desc, o.name, CONVERT(varchar(20),o.create_date,120) cre, "
       "CONVERT(varchar(20),o.modify_date,120) mod, "
       "CASE WHEN sm.definition IS NULL THEN 'NULL' ELSE CAST(LEN(sm.definition) AS varchar(12)) END deflen "
       "FROM ASMBatchReports.sys.objects o "
       "LEFT JOIN ASMBatchReports.sys.sql_modules sm ON sm.object_id=o.object_id "
       "WHERE o.type IN ('P','V','FN','IF','TF','TR') ORDER BY o.type_desc, o.name", cap=60)

    # ================= B. OS1 local-copy job REAL run-state + Agent =================
    w("\n############## B. OS1 LOCAL JOB REAL STATE ##############")
    oq(cur, "OS1 SQL Agent service status", "OS1_SQL",
       "SELECT servicename, status_desc, startup_type_desc, "
       "CONVERT(varchar(30),last_startup_time,120) last_start "
       "FROM sys.dm_server_services")
    oq(cur, "OS1 job last-run (sysjobservers) + enabled", "OS1_SQL",
       "SELECT j.name, j.enabled, js.last_run_date, js.last_run_time, js.last_run_outcome, js.last_run_duration "
       "FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobservers js ON js.job_id=j.job_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1'")
    oq(cur, "OS1 job activity (last start/stop, next run)", "OS1_SQL",
       "SELECT TOP 5 CONVERT(varchar(30),ja.start_execution_date,120) started, "
       "CONVERT(varchar(30),ja.stop_execution_date,120) stopped, "
       "CONVERT(varchar(30),ja.next_scheduled_run_date,120) next_run "
       "FROM msdb.dbo.sysjobactivity ja JOIN msdb.dbo.sysjobs j ON j.job_id=ja.job_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1' ORDER BY ja.session_id DESC")
    oq(cur, "OS1 job schedule attach + next_run", "OS1_SQL",
       "SELECT j.name, sch.name sched, sch.enabled sched_enabled, sch.freq_subday_interval mins, "
       "js.next_run_date, js.next_run_time "
       "FROM msdb.dbo.sysjobs j "
       "JOIN msdb.dbo.sysjobschedules js ON js.job_id=j.job_id "
       "JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1'")
    oq(cur, "OS1 recent job history rows (count check)", "OS1_SQL",
       "SELECT COUNT(*) hist_rows, MAX(h.run_date) max_run_date "
       "FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1'")

    # ================= C. Source PKs/unique keys: ParValueOnline + Order =================
    w("\n############## C. SIMATIC SOURCE KEYS (ParValueOnline / Order) ##############")
    for osn, ls in (("OS1", "OS1_SQL"), ("OS2", "FAKIEH_SERVER2")):
        oq(cur, f"{osn} SimaticBatch PK/unique on ParValueOnline/ParValue/Order", ls,
           "SELECT t.name tbl, i.name idx, i.is_primary_key, i.is_unique, i.type_desc, c.name col, ic.key_ordinal "
           "FROM SimaticBatch.sys.indexes i "
           "JOIN SimaticBatch.sys.tables t ON t.object_id=i.object_id "
           "JOIN SimaticBatch.sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id "
           "JOIN SimaticBatch.sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id "
           "WHERE t.name IN ('ParValueOnline','ParValue','Order') AND (i.is_primary_key=1 OR i.is_unique=1) "
           "ORDER BY t.name, i.is_primary_key DESC, i.name, ic.key_ordinal", cap=80)
        oq(cur, f"{osn} ParValueOnline column schema (key cols)", ls,
           "SELECT ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
           "FROM SimaticBatch.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ParValueOnline' "
           "ORDER BY ORDINAL_POSITION", cap=60)

    # ================= D. OS1 local-copy tables FULL DDL metadata =================
    w("\n############## D. OS1 LOCAL-COPY FULL DDL METADATA ##############")
    for obj in ("BatchCopy", "ParValueOnline_copy", "OrderDetails", "BatchMaterials", "DataSyncTracker"):
        oq(cur, f"OS1 {obj} columns (full DDL)", "OS1_SQL", DDL_COLS.format(OBJ=obj), cap=120, cw=120)
    oq(cur, "OS1 ALL indexes/constraints on local-copy tables", "OS1_SQL",
       "SELECT t.name tbl, i.name idx, i.is_primary_key, i.is_unique, i.type_desc, "
       "i.has_filter, c.name col, ic.key_ordinal, ic.is_included_column "
       "FROM ASMBatchReports.sys.indexes i "
       "JOIN ASMBatchReports.sys.tables t ON t.object_id=i.object_id "
       "LEFT JOIN ASMBatchReports.sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id "
       "LEFT JOIN ASMBatchReports.sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id "
       "WHERE t.name IN ('BatchCopy','ParValueOnline_copy','OrderDetails','BatchMaterials','DataSyncTracker') "
       "AND i.index_id>0 ORDER BY t.name, i.is_primary_key DESC, i.name, ic.key_ordinal", cap=120)
    oq(cur, "OS1 DataSyncTracker content (already partly seen)", "OS1_SQL",
       "SELECT [Source Server], CONVERT(varchar(33),LastTimeStamp,126) LastTimeStamp "
       "FROM ASMBatchReports.dbo.DataSyncTracker WITH (NOLOCK)")

    # ================= E. Disk capacity / file sizes =================
    w("\n############## E. DISK CAPACITY + DB FILE SIZES ##############")
    run(cur, "Reporting xp_fixeddrives (MB free)", "EXEC master.dbo.xp_fixeddrives")
    run(cur, "Reporting DB file sizes (MB)",
        "SELECT DB_NAME(database_id) db, name, type_desc, size*8/1024 size_mb "
        "FROM sys.master_files WHERE database_id=DB_ID('ASMBatchReports')")
    run(cur, "Reporting ParValueOnline_copy + BatchMaterials space (MB)",
        "SELECT t.name tbl, SUM(a.total_pages)*8/1024 total_mb, SUM(a.used_pages)*8/1024 used_mb, "
        "SUM(p.rows) rows_ FROM sys.tables t "
        "JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) "
        "JOIN sys.allocation_units a ON a.container_id=p.partition_id "
        "WHERE t.name IN ('ParValueOnline_copy','BatchMaterials','BatchCopy') GROUP BY t.name")
    oq(cur, "OS1 xp_fixeddrives (MB free)", "OS1_SQL", "EXEC master.dbo.xp_fixeddrives")
    oq(cur, "OS1 all DB file sizes (MB)", "OS1_SQL",
       "SELECT DB_NAME(database_id) db, name, type_desc, size*8/1024 size_mb "
       "FROM sys.master_files WHERE database_id>4 ORDER BY db, type_desc")
    oq(cur, "OS2 xp_fixeddrives (MB free)", "FAKIEH_SERVER2", "EXEC master.dbo.xp_fixeddrives")
    oq(cur, "OS2 SimaticBatch file sizes (MB)", "FAKIEH_SERVER2",
       "SELECT DB_NAME(database_id) db, name, type_desc, size*8/1024 size_mb "
       "FROM sys.master_files WHERE database_id=DB_ID('SimaticBatch')")

    # ================= F. OS1 ParValueOnline live volume + update-in-place test =================
    w("\n############## F. OS1 PARVALUEONLINE VOLUME + UPDATE-IN-PLACE ##############")
    oq(cur, "OS1 ParValueOnline rows by day (volume/cadence)", "OS1_SQL",
       "SELECT CONVERT(varchar(10),[TimeStamp],120) d, COUNT(*) rows_, COUNT(DISTINCT ROOTGUID) roots "
       "FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline WITH (NOLOCK) "
       "GROUP BY CONVERT(varchar(10),[TimeStamp],120) ORDER BY d DESC", cap=20)
    # online table => is (ROOTGUID,POBJID,POTID) unique (1 current row per param) or appended?
    oq(cur, "OS1 ParValueOnline uniqueness of (ROOTGUID,POBJID,POTID)", "OS1_SQL",
       "SELECT COUNT(*) total_rows, COUNT(DISTINCT CONVERT(varchar(40),ROOTGUID)+'|'+CAST(POBJID AS varchar)+'|'"
       "+CAST(POTID AS varchar)) distinct_keys, "
       "MAX(ActivationCounter) max_actcount FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline WITH (NOLOCK)")
    oq(cur, "OS1 ParValueOnline TS span for the single live batch", "OS1_SQL",
       "SELECT COUNT(*) rows_, CONVERT(varchar(33),MIN([TimeStamp]),126) min_ts, "
       "CONVERT(varchar(33),MAX([TimeStamp]),126) max_ts, COUNT(DISTINCT POBJID) distinct_params "
       "FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline WITH (NOLOCK)")

    # ================= G. Reporting: refresh missing-count + dup check (now 2026-06-20) =================
    w("\n############## G. REPORTING CURRENT STATE REFRESH ##############")
    run(cur, "Reporting DataSyncTracker (current watermarks)",
        "SELECT [Source Server], CONVERT(varchar(33),LastTimeStamp,126) LastTimeStamp FROM dbo.DataSyncTracker")
    run(cur, "Reporting current dup groups in BatchMaterials",
        "SELECT COUNT(*) dup_groups, ISNULL(SUM(extra),0) extra_rows FROM ("
        "SELECT COUNT(*)-1 extra FROM dbo.BatchMaterials WITH (NOLOCK) "
        "GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],sp_prot HAVING COUNT(*)>1) z")
    run(cur, "Reporting missing completed-qualifying summary (refreshed)", """
        DECLARE @ReworkStart datetime2(0)='2026-06-17T00:00:00'; DECLARE @AgeMin int=120;
        ;WITH PvBatch AS (
          SELECT pv.ROOTGUID, pv.SourceServer, MIN(pv.[TimeStamp]) first_pv, MAX(pv.[TimeStamp]) last_pv,
                 COUNT_BIG(*) pv_rows,
                 SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
          FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
          WHERE pv.[TimeStamp]>=@ReworkStart AND pv.ROOTGUID IS NOT NULL
          GROUP BY pv.ROOTGUID, pv.SourceServer)
        SELECT COUNT(*) missing_batches,
               CONVERT(varchar(30),MIN(first_pv),126) oldest_first_pv,
               CONVERT(varchar(30),MAX(last_pv),126) newest_last_pv, SUM(qual) qual_rows_waiting
        FROM PvBatch p WHERE p.qual>0 AND p.last_pv < DATEADD(MINUTE,-@AgeMin,SYSDATETIME())
          AND NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WITH (NOLOCK)
                          WHERE bm.[Batch GUID]=p.ROOTGUID
                            AND (p.SourceServer IS NULL OR bm.[Source Server]=p.SourceServer))""")

    cn.close()
    w("\nDONE PHASE5")
    OUT.close()


if __name__ == "__main__":
    main()

"""
READ-ONLY full investigation capture via Windows-auth sysadmin connection.
HARD RULE: DO NOT ADD OR MODIFY ANYTHING IN SQL SERVER.
Only SELECT / catalog reads / OBJECT_DEFINITION / msdb history reads / OPENQUERY SELECT.
autocommit=True, READ UNCOMMITTED, NO DDL/DML/EXEC-of-app-procs ever.
Writes full output to _ro_full_out.txt (UTF-8).
"""
import struct
import pyodbc
from datetime import datetime

DRIVER = "{ODBC Driver 17 for SQL Server}"
SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={DRIVER};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")

OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_full_out.txt",
           "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return ("%04d-%02d-%02d %02d:%02d:%02d.%03d%+03d:%02d" %
            (t[0], t[1], t[2], t[3], t[4], t[5], t[6] // 10000, t[7], t[8]))


def w(s=""):
    OUT.write(str(s) + "\n")


def run(cur, label, sql, cap=500, cw=200):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        first = True
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
            first = False
    except Exception as e:
        w(f"ERROR: {e}")


def dump_body(cur, label, sql):
    """Print full untruncated single-value definition bodies."""
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        rows = cur.fetchall()
        for r in rows:
            for v in r:
                w("" if v is None else str(v))
        w(f"({len(rows)} rows)")
    except Exception as e:
        w(f"ERROR: {e}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 150
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"FULL CAPTURE @ local {datetime.now().isoformat()} (Windows-auth sysadmin, READ-ONLY)")

    run(cur, "0.identity", """
        SELECT @@SERVERNAME server, SERVERPROPERTY('MachineName') machine,
               SERVERPROPERTY('ProductVersion') ver, SUSER_SNAME() login_name,
               IS_SRVROLEMEMBER('sysadmin') is_sa, CONVERT(varchar(40),SYSDATETIMEOFFSET()) now""")

    # ================= A. ETL LOGIC: SQL Agent jobs/steps =================
    run(cur, "A1.jobs", """
        SELECT j.job_id, j.name, j.enabled, SUSER_SNAME(j.owner_sid) owner, j.date_created, j.date_modified
        FROM msdb.dbo.sysjobs j ORDER BY j.name""")
    run(cur, "A2.job_schedules", """
        SELECT j.name job, sch.name sched, sch.freq_type, sch.freq_subday_type,
               sch.freq_subday_interval, sch.active_start_time, sch.enabled
        FROM msdb.dbo.sysjobschedules js JOIN msdb.dbo.sysjobs j ON j.job_id=js.job_id
        JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id ORDER BY j.name""")
    # full step commands (the actual ETL T-SQL) - untruncated
    cur.execute("""SELECT j.name job, s.step_id, s.step_name, s.subsystem, s.database_name, s.command
                   FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id=s.job_id
                   ORDER BY j.name, s.step_id""")
    steps = cur.fetchall()
    w("\n===== A3.job_steps_FULL =====")
    for r in steps:
        w(f"\n--- JOB: {r[0]} | step {r[1]} '{r[2]}' | subsystem={r[3]} | db={r[4]} ---")
        w(r[5] if r[5] is not None else "(null command)")
    w(f"({len(steps)} steps)")

    run(cur, "A4.job_history_recent", """
        SELECT TOP (150) j.name job, h.step_id, h.step_name, h.run_status,
               h.run_date, h.run_time, h.run_duration, LEFT(h.message,500) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        WHERE h.run_date >= 20260601 ORDER BY h.run_date DESC, h.run_time DESC""", cap=150, cw=500)
    run(cur, "A5.job_history_failures", """
        SELECT TOP (100) j.name job, h.step_id, h.step_name, h.run_date, h.run_time, LEFT(h.message,800) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        WHERE h.run_status=0 AND h.step_id>0 ORDER BY h.run_date DESC, h.run_time DESC""", cap=100, cw=800)
    run(cur, "A6.active_jobs_now", """
        SELECT ja.job_id, j.name job, ja.start_execution_date, ja.stop_execution_date
        FROM msdb.dbo.sysjobactivity ja JOIN msdb.dbo.sysjobs j ON j.job_id=ja.job_id
        WHERE ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL""")

    # ================= B. PROCEDURE / OBJECT inventory (all user DBs) =================
    run(cur, "B1.ASMBatchReports_all_programmable", """
        SELECT o.name, o.type_desc, o.create_date, o.modify_date,
               CASE WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN 'NULL' ELSE 'OK' END def_state,
               LEN(OBJECT_DEFINITION(o.object_id)) def_len
        FROM sys.objects o WHERE o.type IN ('P','V','TR','FN','IF','TF','PC')
        ORDER BY o.type_desc, o.name""", cap=200)
    # any object whose body references the pipeline tables/servers
    dump_body(cur, "B2.OS2_BatchCopy_Compat_def",
              "SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.OS2_BatchCopy_Compat'))")
    dump_body(cur, "B3.any_proc_referencing_pipeline (full bodies)", """
        SELECT OBJECT_DEFINITION(o.object_id)
        FROM sys.objects o
        WHERE o.type IN ('P','V','TR','FN','IF','TF','PC')
          AND OBJECT_DEFINITION(o.object_id) IS NOT NULL
          AND (OBJECT_DEFINITION(o.object_id) LIKE '%BatchCopy%'
               OR OBJECT_DEFINITION(o.object_id) LIKE '%BatchMaterials%'
               OR OBJECT_DEFINITION(o.object_id) LIKE '%ParValueOnline%'
               OR OBJECT_DEFINITION(o.object_id) LIKE '%FAKIEH_SERVER%')""")
    # triggers on the pipeline tables?
    run(cur, "B4.triggers_in_ASMBatchReports", """
        SELECT t.name parent, tr.name trig, tr.is_disabled, tr.is_instead_of_trigger, tr.create_date, tr.modify_date
        FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id ORDER BY t.name, tr.name""")

    # ================= C. DATA EVIDENCE (datetimeoffset now fixed) =================
    run(cur, "C1.BatchCopy_header_completeness_by_server", """
        SELECT SourceServer, COUNT(*) rows_,
               SUM(CASE WHEN ProductName IS NULL THEN 1 ELSE 0 END) null_product,
               SUM(CASE WHEN FormulaCategoryName IS NULL THEN 1 ELSE 0 END) null_fcat,
               SUM(CASE WHEN Name IS NULL THEN 1 ELSE 0 END) null_name,
               SUM(CASE WHEN ISNULL(Name,'')='Auto from PV' THEN 1 ELSE 0 END) name_autopv,
               SUM(CASE WHEN OrderId IS NULL THEN 1 ELSE 0 END) null_order,
               SUM(CASE WHEN Quantity IS NULL THEN 1 ELSE 0 END) null_qty,
               SUM(CASE WHEN OGUID=ROOTGUID THEN 1 ELSE 0 END) oguid_eq_root,
               CONVERT(varchar(30),MIN(ActStart),126) min_start,
               CONVERT(varchar(30),MAX(ActStart),126) max_start
        FROM dbo.BatchCopy WITH (NOLOCK) GROUP BY SourceServer""")
    run(cur, "C2.BatchMaterials_by_server", """
        SELECT [Source Server], COUNT(*) rows_, COUNT(DISTINCT [Batch GUID]) batches,
               SUM(CASE WHEN ROOTGUID IS NULL THEN 1 ELSE 0 END) null_root,
               SUM(CASE WHEN ISNULL([Batch Name],'')='Auto from PV' THEN 1 ELSE 0 END) name_autopv,
               SUM(CASE WHEN FormulaCategoryName IS NULL THEN 1 ELSE 0 END) null_fcat,
               CONVERT(varchar(30),MIN([Batch Act Start]),126) min_start,
               CONVERT(varchar(30),MAX([Batch Act Start]),126) max_start
        FROM dbo.BatchMaterials WITH (NOLOCK) GROUP BY [Source Server]""")
    run(cur, "C3.BM_multi_server_batches", """
        SELECT COUNT(*) multi_server_batches FROM (
          SELECT [Batch GUID] FROM dbo.BatchMaterials WITH (NOLOCK)
          GROUP BY [Batch GUID] HAVING COUNT(DISTINCT [Source Server])>1) z""")
    run(cur, "C4.BM_source_split_by_month", """
        SELECT [Source Server], FORMAT([Batch Transfer Time],'yyyy-MM') ym,
               COUNT(DISTINCT [Batch GUID]) batches, COUNT(*) rows_
        FROM dbo.BatchMaterials WITH (NOLOCK)
        GROUP BY [Source Server], FORMAT([Batch Transfer Time],'yyyy-MM')
        ORDER BY ym, [Source Server]""", cap=100)
    run(cur, "C5.PV_copy_by_server", """
        SELECT SourceServer, COUNT(*) rows_, COUNT(DISTINCT ROOTGUID) distinct_root,
               CONVERT(varchar(30),MIN([TimeStamp]),126) min_ts,
               CONVERT(varchar(30),MAX([TimeStamp]),126) max_ts
        FROM dbo.ParValueOnline_copy WITH (NOLOCK) GROUP BY SourceServer""")

    # missing-completed-qualifying batches (the real KPI)
    run(cur, "C6.missing_summary", """
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
    run(cur, "C7.missing_guid_list", """
        DECLARE @ReworkStart datetime2(0)='2026-06-17T00:00:00'; DECLARE @AgeMin int=120;
        ;WITH PvBatch AS (
          SELECT pv.ROOTGUID, pv.SourceServer, MIN(pv.[TimeStamp]) first_pv, MAX(pv.[TimeStamp]) last_pv,
                 COUNT_BIG(*) pv_rows,
                 SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
          FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
          WHERE pv.[TimeStamp]>=@ReworkStart AND pv.ROOTGUID IS NOT NULL
          GROUP BY pv.ROOTGUID, pv.SourceServer)
        SELECT TOP (60) CAST(p.ROOTGUID AS varchar(40)) rootguid, p.SourceServer,
               CONVERT(varchar(30),p.first_pv,126) first_pv, CONVERT(varchar(30),p.last_pv,126) last_pv,
               p.pv_rows, p.qual
        FROM PvBatch p WHERE p.qual>0 AND p.last_pv < DATEADD(MINUTE,-@AgeMin,SYSDATETIME())
          AND NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WITH (NOLOCK)
                          WHERE bm.[Batch GUID]=p.ROOTGUID
                            AND (p.SourceServer IS NULL OR bm.[Source Server]=p.SourceServer))
        ORDER BY p.last_pv""", cap=60)
    # Is GUID-only matching safe? do any ROOTGUIDs appear under >1 source server in PV?
    run(cur, "C8.PV_rootguid_multi_server", """
        SELECT COUNT(*) roots_on_multiple_servers FROM (
          SELECT ROOTGUID FROM dbo.ParValueOnline_copy WITH (NOLOCK)
          WHERE ROOTGUID IS NOT NULL GROUP BY ROOTGUID HAVING COUNT(DISTINCT SourceServer)>1) z""")

    # ================= D. BACKUP TABLE PROFILES (rework forensics) =================
    run(cur, "D1.BatchCopy_AutoPV_Backup_20260605", """
        SELECT COUNT(*) rows_total, COUNT(DISTINCT OGUID) distinct_oguid,
               SUM(CASE WHEN ROOTGUID=OGUID THEN 1 ELSE 0 END) rootguid_eq_oguid,
               SUM(CASE WHEN ISNULL([Name],'')='Auto from PV' THEN 1 ELSE 0 END) name_autopv,
               SUM(CASE WHEN FormulaCategoryName IS NULL THEN 1 ELSE 0 END) null_fcat,
               SUM(CASE WHEN ProductName IS NULL THEN 1 ELSE 0 END) null_product
        FROM dbo.BatchCopy_AutoPV_Backup_20260605 WITH (NOLOCK)""")
    run(cur, "D2.BatchMaterials_BeforeCleanup_20260617", """
        SELECT COUNT(*) rows_total, COUNT(DISTINCT [Batch GUID]) distinct_batches
        FROM dbo.BatchMaterials_BeforeCleanup_20260617 WITH (NOLOCK)""")
    run(cur, "D3.BeforeCleanup_dups", """
        SELECT TOP (30) [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot],COUNT(*) dup
        FROM dbo.BatchMaterials_BeforeCleanup_20260617 WITH (NOLOCK)
        GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot]
        HAVING COUNT(*)>1 ORDER BY dup DESC""", cap=30)
    run(cur, "D4.BeforeCleanup_dup_summary", """
        SELECT COUNT(*) dup_groups, SUM(extra) extra_rows FROM (
          SELECT COUNT(*)-1 extra FROM dbo.BatchMaterials_BeforeCleanup_20260617 WITH (NOLOCK)
          GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot]
          HAVING COUNT(*)>1) z""")
    run(cur, "D5.Phase1_Backup_profile", """
        SELECT COUNT(*) rows_total, COUNT(DISTINCT [Batch GUID]) distinct_batches,
               COUNT(DISTINCT CASE WHEN FormulaCategoryName IS NULL THEN [Batch GUID] END) b_null_fcat,
               COUNT(DISTINCT CASE WHEN ISNULL([Batch Name],'')='Auto from PV' THEN [Batch GUID] END) b_autopv
        FROM dbo.BatchMaterials_Phase1_Backup_20260617 WITH (NOLOCK)""")
    # columns of BeforeCleanup vs current (did rework add/rename columns?)
    run(cur, "D6.BeforeCleanup_columns", """
        SELECT c.name col, ty.name dtype FROM sys.columns c
        JOIN sys.types ty ON ty.user_type_id=c.user_type_id
        WHERE c.object_id=OBJECT_ID('dbo.BatchMaterials_BeforeCleanup_20260617') ORDER BY c.column_id""", cap=60)

    # ================= E. default trace rework timeline =================
    run(cur, "E1.default_trace", """
        DECLARE @tp nvarchar(260);
        SELECT @tp=CONVERT(nvarchar(260),value) FROM sys.fn_trace_getinfo(DEFAULT) WHERE property=2;
        SELECT TOP (200) CONVERT(varchar(30),t.StartTime,126) StartTime, te.name event_name,
               t.DatabaseName, t.ObjectName, t.LoginName, t.ApplicationName, t.HostName,
               LEFT(CAST(t.TextData AS nvarchar(max)),250) TextData
        FROM sys.fn_trace_gettable(@tp,DEFAULT) t
        LEFT JOIN sys.trace_events te ON te.trace_event_id=t.EventClass
        WHERE t.StartTime>='2026-06-15T00:00:00'
          AND (t.DatabaseName='ASMBatchReports' OR t.DatabaseName='msdb')
          AND (t.ObjectName LIKE '%Batch%' OR t.ObjectName LIKE '%ParValue%'
               OR t.ObjectName LIKE '%usp_%' OR CAST(t.TextData AS nvarchar(max)) LIKE '%BatchCopy%'
               OR CAST(t.TextData AS nvarchar(max)) LIKE '%Collect%')
        ORDER BY t.StartTime""", cap=200, cw=250)

    cn.close()
    w("\nDONE FULL")
    OUT.close()


if __name__ == "__main__":
    main()

"""
READ-ONLY Phase 1 investigation capture for Hercules/Fakieh/SIMATIC issue.
HARD RULE: DO NOT ADD OR MODIFY ANYTHING IN SQL SERVER.
Only SELECT / catalog-view reads / OBJECT_DEFINITION / msdb history reads.
autocommit=True, READ UNCOMMITTED, per-statement timeout. No DDL/DML ever.
Writes full output to _ro_phase1_out.txt (UTF-8).
"""
import sys
import pyodbc
from datetime import datetime

SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
USER, PWD = "fakieh_app_user", "Hercules"
CONN = ("DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SERVER};DATABASE=ASMBatchReports;UID={USER};PWD={PWD};"
        "TrustServerCertificate=yes;Connection Timeout=10;")

OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_phase1_out.txt",
           "w", encoding="utf-8")


def w(s=""):
    OUT.write(str(s) + "\n")
    print(s)


def run(cur, label, sql, cap=500, colwidth=None):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                w(" | ".join(cols))
                rows = cur.fetchall()
                for r in rows[:cap]:
                    vals = []
                    for v in r:
                        if v is None:
                            vals.append("")
                        else:
                            s = str(v)
                            if colwidth:
                                s = s[:colwidth]
                            vals.append(s)
                    w(" | ".join(vals))
                w(f"({len(rows)} rows)")
            else:
                w("(no resultset)")
            if not cur.nextset():
                break
    except Exception as e:
        w(f"ERROR: {e}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 120
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"PHASE 1 CAPTURE @ local {datetime.now().isoformat()}")
    w("server=DESKTOP-N8PGI9S\\FAKIEH_REPORTING db=ASMBatchReports login=fakieh_app_user")

    # ---- 1. identity / role membership ----
    run(cur, "1.identity", """
        SELECT @@SERVERNAME server_name, SERVERPROPERTY('MachineName') machine,
               SERVERPROPERTY('InstanceName') instance, SERVERPROPERTY('Edition') edition,
               SERVERPROPERTY('ProductVersion') ver, SERVERPROPERTY('Collation') coll,
               DB_NAME() cur_db, SUSER_SNAME() login_name,
               IS_SRVROLEMEMBER('sysadmin') is_sa, SYSDATETIMEOFFSET() captured_at""")
    run(cur, "1.db_roles (does app user own ASMBatchReports?)", """
        SELECT IS_ROLEMEMBER('db_owner') is_db_owner,
               IS_ROLEMEMBER('db_datareader') is_datareader,
               IS_ROLEMEMBER('db_ddladmin') is_ddladmin,
               HAS_PERMS_BY_NAME(NULL,NULL,'VIEW DEFINITION') view_def_db""")

    # ---- 2. linked servers / mappings ----
    run(cur, "2.linked_servers", """
        SELECT s.name linked_server, s.product, s.provider, s.data_source,
               s.is_linked, s.is_data_access_enabled, s.is_rpc_out_enabled
        FROM sys.servers s WHERE s.is_linked=1 ORDER BY s.name""")
    run(cur, "2.linked_logins", """
        SELECT s.name linked_server, ll.remote_name, ll.uses_self_credential
        FROM sys.linked_logins ll JOIN sys.servers s ON s.server_id=ll.server_id
        WHERE s.is_linked=1 ORDER BY s.name, ll.remote_name""")

    # ---- 3. tables / columns / indexes ----
    run(cur, "3.all_user_tables_rowcounts", """
        SELECT s.name [schema], t.name [table], SUM(p.rows) approx_rows,
               t.create_date, t.modify_date
        FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
        JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
        GROUP BY s.name,t.name,t.create_date,t.modify_date ORDER BY t.name""")
    run(cur, "3.columns_core_tables", """
        SELECT t.name [table], c.column_id, c.name col, ty.name dtype,
               c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
               c.is_computed, dc.definition default_def
        FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id
        JOIN sys.types ty ON ty.user_type_id=c.user_type_id
        LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=c.object_id
             AND dc.parent_column_id=c.column_id
        WHERE t.name IN ('BatchCopy','BatchMaterials','ParValueOnline_copy','DataSyncTracker')
        ORDER BY t.name,c.column_id""", cap=400)
    run(cur, "3.indexes_core_tables", """
        SELECT t.name [table], i.name index_name, i.is_primary_key, i.is_unique,
               i.has_filter, i.filter_definition, c.name col,
               ic.key_ordinal, ic.is_included_column
        FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id
        JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
        JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
        WHERE t.name IN ('BatchCopy','BatchMaterials','ParValueOnline_copy','DataSyncTracker')
        ORDER BY t.name,i.name,ic.key_ordinal,ic.index_column_id""", cap=400)

    # ---- 4. programmable object inventory (names+dates regardless of body visibility) ----
    run(cur, "4.object_inventory", """
        SELECT o.name object_name, o.type_desc, o.create_date, o.modify_date,
               CASE WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN 'NULL/HIDDEN'
                    ELSE CAST(LEN(OBJECT_DEFINITION(o.object_id)) AS varchar(12)) END def_len
        FROM sys.objects o
        WHERE o.type IN ('P','V','TR','FN','IF','TF')
        ORDER BY o.type_desc,o.name""", cap=400)

    # ---- 5. SQL Agent jobs/steps/schedules/history/active ----
    run(cur, "5.jobs", """
        SELECT j.name job_name, j.enabled, SUSER_SNAME(j.owner_sid) owner_name,
               j.date_created, j.date_modified
        FROM msdb.dbo.sysjobs j ORDER BY j.name""")
    run(cur, "5.job_steps", """
        SELECT j.name job_name, s.step_id, s.step_name, s.subsystem, s.database_name, s.command
        FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id=s.job_id
        ORDER BY j.name,s.step_id""", cap=100, colwidth=4000)
    run(cur, "5.job_schedules", """
        SELECT j.name job_name, sch.name sched, sch.freq_type, sch.freq_subday_type,
               sch.freq_subday_interval, sch.active_start_date, sch.active_start_time
        FROM msdb.dbo.sysjobschedules js JOIN msdb.dbo.sysjobs j ON j.job_id=js.job_id
        JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id
        ORDER BY j.name,sch.name""")
    run(cur, "5.job_history_recent_all", """
        SELECT TOP (120) j.name job_name, h.step_id, h.step_name, h.run_status,
               h.run_date, h.run_time, h.run_duration, LEFT(h.message,400) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        WHERE h.run_date >= 20260601
        ORDER BY h.run_date DESC, h.run_time DESC""", cap=120, colwidth=400)
    run(cur, "5.job_history_failures_only", """
        SELECT TOP (80) j.name job_name, h.step_id, h.step_name, h.run_date, h.run_time,
               LEFT(h.message,600) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        WHERE h.run_status=0
        ORDER BY h.run_date DESC, h.run_time DESC""", cap=80, colwidth=600)
    run(cur, "5.active_jobs_now", """
        SELECT ja.job_id, j.name job_name, ja.start_execution_date, ja.stop_execution_date
        FROM msdb.dbo.sysjobactivity ja JOIN msdb.dbo.sysjobs j ON j.job_id=ja.job_id
        WHERE ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL
        ORDER BY ja.start_execution_date DESC""")

    # ---- 6. watermark ----
    run(cur, "6.DataSyncTracker", "SELECT * FROM dbo.DataSyncTracker WITH (NOLOCK)")

    # ---- 7. default trace rework timeline ----
    run(cur, "7.default_trace_rework", """
        DECLARE @tp nvarchar(260);
        SELECT @tp=CONVERT(nvarchar(260),value) FROM sys.fn_trace_getinfo(DEFAULT) WHERE property=2;
        IF @tp IS NOT NULL
          SELECT TOP (300) t.StartTime, te.name event_name, t.DatabaseName, t.ObjectName,
                 t.LoginName, t.ApplicationName, t.HostName, LEFT(CAST(t.TextData AS nvarchar(max)),300) TextData
          FROM sys.fn_trace_gettable(@tp,DEFAULT) t
          LEFT JOIN sys.trace_events te ON te.trace_event_id=t.EventClass
          WHERE t.DatabaseName='ASMBatchReports' AND t.StartTime>='2026-06-15T00:00:00'
            AND (t.ObjectName LIKE '%BatchCopy%' OR t.ObjectName LIKE '%BatchMaterials%'
                 OR t.ObjectName LIKE '%usp_%' OR CAST(t.TextData AS nvarchar(max)) LIKE '%usp_%')
          ORDER BY t.StartTime;
        ELSE SELECT 'default trace not available' note""", cap=300, colwidth=300)

    # ---- 8. backup/snapshot objects from rework ----
    run(cur, "8.backup_snapshot_tables", """
        SELECT s.name [schema], t.name [table], t.create_date, t.modify_date, SUM(p.rows) approx_rows
        FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
        JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
        WHERE t.name LIKE '%Backup%' OR t.name LIKE '%Phase1%' OR t.name LIKE '%BeforeCleanup%'
              OR t.name LIKE '%AutoPV%' OR t.name LIKE '%_OLD%' OR t.name LIKE '%bak%'
        GROUP BY s.name,t.name,t.create_date,t.modify_date ORDER BY t.create_date,t.name""")

    # ---- 9. duplicate checks ----
    run(cur, "9.dups_current_BatchMaterials", """
        SELECT TOP (40) [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot],COUNT(*) dup_rows
        FROM dbo.BatchMaterials WITH (NOLOCK)
        GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot]
        HAVING COUNT(*)>1 ORDER BY dup_rows DESC""", cap=40)
    run(cur, "9.dup_summary_current_BM", """
        SELECT COUNT(*) dup_groups, SUM(extra) extra_rows FROM (
          SELECT COUNT(*)-1 extra FROM dbo.BatchMaterials WITH (NOLOCK)
          GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot]
          HAVING COUNT(*)>1) z""")

    # ---- 10. missing batch + parity ----
    run(cur, "10.missing_completed_qualifying_summary", """
        DECLARE @ReworkStart datetime2(0)='2026-06-17T00:00:00';
        DECLARE @AgeMin int=120;
        ;WITH PvBatch AS (
          SELECT pv.ROOTGUID, pv.SourceServer,
                 MIN(pv.[TimeStamp]) first_pv, MAX(pv.[TimeStamp]) last_pv,
                 COUNT_BIG(*) pv_rows,
                 SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
          FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
          WHERE pv.[TimeStamp]>=@ReworkStart AND pv.ROOTGUID IS NOT NULL
          GROUP BY pv.ROOTGUID, pv.SourceServer)
        SELECT COUNT(*) missing_batches, MIN(first_pv) oldest_first_pv, MAX(last_pv) newest_last_pv,
               SUM(qual) qual_rows_waiting
        FROM PvBatch p
        WHERE p.qual>0 AND p.last_pv < DATEADD(MINUTE,-@AgeMin,SYSDATETIME())
          AND NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WITH (NOLOCK)
                          WHERE bm.[Batch GUID]=p.ROOTGUID
                            AND (p.SourceServer IS NULL OR bm.[Source Server]=p.SourceServer))""")
    run(cur, "10.missing_guid_list", """
        DECLARE @ReworkStart datetime2(0)='2026-06-17T00:00:00';
        DECLARE @AgeMin int=120;
        ;WITH PvBatch AS (
          SELECT pv.ROOTGUID, pv.SourceServer,
                 MIN(pv.[TimeStamp]) first_pv, MAX(pv.[TimeStamp]) last_pv,
                 COUNT_BIG(*) pv_rows,
                 SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
          FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
          WHERE pv.[TimeStamp]>=@ReworkStart AND pv.ROOTGUID IS NOT NULL
          GROUP BY pv.ROOTGUID, pv.SourceServer)
        SELECT TOP (100) p.ROOTGUID, p.SourceServer, p.first_pv, p.last_pv, p.pv_rows, p.qual
        FROM PvBatch p
        WHERE p.qual>0 AND p.last_pv < DATEADD(MINUTE,-@AgeMin,SYSDATETIME())
          AND NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WITH (NOLOCK)
                          WHERE bm.[Batch GUID]=p.ROOTGUID
                            AND (p.SourceServer IS NULL OR bm.[Source Server]=p.SourceServer))
        ORDER BY p.last_pv""", cap=100)
    run(cur, "10.daily_parity", """
        DECLARE @ReworkStart datetime2(0)='2026-06-17T00:00:00';
        DECLARE @AgeMin int=120;
        ;WITH SimaticCaptured AS (
          SELECT CAST(first_pv AS date) d, COUNT(*) captured FROM (
            SELECT ROOTGUID, MIN([TimeStamp]) first_pv, MAX([TimeStamp]) last_pv,
                   SUM(CASE WHEN av_float>0 AND sp_float>0 AND sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
            FROM dbo.ParValueOnline_copy WITH (NOLOCK)
            WHERE [TimeStamp]>=@ReworkStart AND ROOTGUID IS NOT NULL GROUP BY ROOTGUID) q
          WHERE q.qual>0 AND q.last_pv<DATEADD(MINUTE,-@AgeMin,SYSDATETIME())
          GROUP BY CAST(first_pv AS date)),
        Herc AS (
          SELECT CAST([Batch Act Start] AS date) d, COUNT(DISTINCT [Batch GUID]) reported
          FROM dbo.BatchMaterials WITH (NOLOCK)
          WHERE [Batch Act Start]>=@ReworkStart AND [Batch GUID] IS NOT NULL
          GROUP BY CAST([Batch Act Start] AS date))
        SELECT COALESCE(s.d,h.d) report_date, ISNULL(s.captured,0) captured,
               ISNULL(h.reported,0) reported, ISNULL(s.captured,0)-ISNULL(h.reported,0) gap
        FROM SimaticCaptured s FULL OUTER JOIN Herc h ON h.d=s.d ORDER BY report_date""", cap=120)

    # ---- 11. row samples + present-batch trace ----
    run(cur, "11.BatchCopy_all", "SELECT * FROM dbo.BatchCopy WITH (NOLOCK)", cap=300, colwidth=120)
    run(cur, "11.BatchMaterials_recent", """
        SELECT TOP (60) * FROM dbo.BatchMaterials WITH (NOLOCK) ORDER BY [Batch Act Start] DESC""",
        cap=60, colwidth=80)
    run(cur, "11.PV_copy_recent", """
        SELECT TOP (40) * FROM dbo.ParValueOnline_copy WITH (NOLOCK) ORDER BY [TimeStamp] DESC""",
        cap=40, colwidth=80)
    run(cur, "11.trace_present_batch", """
        DECLARE @g nvarchar(50)=(SELECT TOP (1) CAST([Batch GUID] AS nvarchar(50))
                                 FROM dbo.BatchMaterials WITH (NOLOCK) ORDER BY [Batch Act Start] DESC);
        SELECT @g traced_present_guid;
        SELECT 'BatchCopy' layer,* FROM dbo.BatchCopy WITH (NOLOCK) WHERE CAST(OGUID AS nvarchar(50))=@g;
        SELECT 'BatchMaterials' layer, COUNT(*) bm_rows FROM dbo.BatchMaterials WITH (NOLOCK)
          WHERE CAST([Batch GUID] AS nvarchar(50))=@g;""", cap=50, colwidth=120)

    cn.close()
    w("\nDONE PHASE1")
    OUT.close()


if __name__ == "__main__":
    main()

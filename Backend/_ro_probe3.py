"""READ-ONLY probe 3: procs/jobs/watermark + BatchMaterials & BatchCopy forensics. NO WRITES."""
import pyodbc
SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
USER, PWD = "fakieh_app_user", "Hercules"
CONN = ("DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SERVER};DATABASE=ASMBatchReports;UID={USER};PWD={PWD};"
        "TrustServerCertificate=yes;Connection Timeout=8;")


def run(cur, label, sql, cap=300):
    print(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        if cols:
            print(" | ".join(cols))
            rows = cur.fetchall()
            for r in rows[:cap]:
                print(" | ".join("" if v is None else str(v) for v in r))
            print(f"({len(rows)} rows)")
        else:
            print("(no resultset)")
    except Exception as e:
        print(f"ERROR: {e}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cur = cn.cursor()
    print("CONNECT OK")

    # Do the named procedures exist anywhere visible?
    run(cur, "named proc existence (ASMBatchReports & master)", """
        SELECT 'ASMBatchReports' db, name, OBJECT_ID('dbo.'+name) oid
        FROM (VALUES ('usp_Upsert_BatchCopy_FromPV'),('usp_Merge_BatchMaterials_FromLocal'),
                     ('usp_StagePV_FromServer2'),('usp_StagePV_FromServer1')) v(name)
        UNION ALL
        SELECT 'master', v.name, OBJECT_ID('master.dbo.'+v.name)
        FROM (VALUES ('usp_Upsert_BatchCopy_FromPV'),('usp_Merge_BatchMaterials_FromLocal'),
                     ('usp_StagePV_FromServer2'),('usp_StagePV_FromServer1')) v(name)""")

    run(cur, "OS2_BatchCopy_Compat view def", """
        SELECT OBJECT_DEFINITION(OBJECT_ID('dbo.OS2_BatchCopy_Compat')) AS def""")

    run(cur, "DataSyncTracker (watermark?)", "SELECT * FROM dbo.DataSyncTracker")

    # ---- msdb jobs ----
    run(cur, "jobs", """
        SELECT name, enabled, date_created, date_modified FROM msdb.dbo.sysjobs ORDER BY name""")
    run(cur, "job steps (full command)", """
        SELECT j.name AS job, s.step_id, s.step_name, s.subsystem, s.database_name, s.command
        FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id
        ORDER BY j.name, s.step_id""", cap=100)
    run(cur, "job schedules", """
        SELECT j.name AS job, sch.name AS sched, sch.freq_type, sch.freq_interval,
               sch.freq_subday_type, sch.freq_subday_interval, sch.active_start_time
        FROM msdb.dbo.sysjobs j
        JOIN msdb.dbo.sysjobschedules js ON js.job_id=j.job_id
        JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id""")
    run(cur, "job history around 2026-06 (failures + recent)", """
        SELECT TOP (80) j.name AS job, h.step_id, h.step_name, h.run_status,
               h.run_date, h.run_time, h.run_duration, LEFT(h.message,300) AS msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        WHERE h.run_date >= 20260601
        ORDER BY h.run_date DESC, h.run_time DESC""", cap=80)

    # ---- BatchMaterials forensics ----
    run(cur, "BM totals", """
        SELECT COUNT(*) rows_all, COUNT(DISTINCT [Batch GUID]) distinct_batches,
               SUM(CASE WHEN ROOTGUID IS NULL THEN 1 ELSE 0 END) null_rootguid,
               MIN([Batch Act Start]) min_start, MAX([Batch Act Start]) max_start,
               MIN([Batch Transfer Time]) min_xfer, MAX([Batch Transfer Time]) max_xfer
        FROM dbo.BatchMaterials""")
    run(cur, "BM by Source Server", """
        SELECT [Source Server], COUNT(*) rows_, COUNT(DISTINCT [Batch GUID]) batches,
               SUM(CASE WHEN ROOTGUID IS NULL THEN 1 ELSE 0 END) null_root
        FROM dbo.BatchMaterials GROUP BY [Source Server] ORDER BY rows_ DESC""")
    run(cur, "BM duplicates by (Batch GUID, Material Name, Material Code, sp_prot, Source Server)", """
        SELECT TOP (20) [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot],COUNT(*) c
        FROM dbo.BatchMaterials
        GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],[sp_prot]
        HAVING COUNT(*)>1 ORDER BY c DESC""")
    run(cur, "BM dup count ignoring Source Server (same batch both servers?)", """
        SELECT COUNT(*) dup_groups FROM (
          SELECT [Batch GUID],[Material Name],[Material Code],[sp_prot]
          FROM dbo.BatchMaterials
          GROUP BY [Batch GUID],[Material Name],[Material Code],[sp_prot] HAVING COUNT(*)>1) z""")
    run(cur, "BM rows per day June 2026", """
        SELECT CAST([Batch Transfer Time] AS date) d, COUNT(*) rows_,
               COUNT(DISTINCT [Batch GUID]) batches
        FROM dbo.BatchMaterials
        WHERE [Batch Transfer Time] >= '2026-06-01'
        GROUP BY CAST([Batch Transfer Time] AS date) ORDER BY d""")

    # ---- BatchCopy (header copy) forensics ----
    run(cur, "BatchCopy by SourceServer + null headers", """
        SELECT SourceServer, COUNT(*) rows_,
               SUM(CASE WHEN ProductName IS NULL THEN 1 ELSE 0 END) null_product,
               SUM(CASE WHEN FormulaCategoryName IS NULL THEN 1 ELSE 0 END) null_fcat,
               SUM(CASE WHEN Name IS NULL THEN 1 ELSE 0 END) null_name,
               SUM(CASE WHEN OrderId IS NULL THEN 1 ELSE 0 END) null_order,
               SUM(CASE WHEN Quantity IS NULL THEN 1 ELSE 0 END) null_qty,
               MIN(ActStart) min_start, MAX(ActStart) max_start
        FROM dbo.BatchCopy GROUP BY SourceServer""")
    run(cur, "ParValueOnline_copy summary", """
        SELECT COUNT(*) rows_, COUNT(DISTINCT ROOTGUID) distinct_root,
               MIN([TimeStamp]) min_ts, MAX([TimeStamp]) max_ts
        FROM dbo.ParValueOnline_copy""")

    cn.close()
    print("\nDONE")


if __name__ == "__main__":
    main()

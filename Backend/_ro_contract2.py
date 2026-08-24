"""
READ-ONLY follow-up: current Agent jobs/steps, object inventory, golden-day count,
and SOURCE-vs-LOCAL datetime ground truth (settles UTC vs local wall-time).
SELECT / sys-catalog / OBJECT_DEFINITION / msdb reads / OPENQUERY(SELECT) only. No writes.
"""
import struct, pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
BASE = r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend"
OUT = open(BASE + r"\_ro_contract2_out.txt", "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d.%03d%+03d:%02d" % (
        t[0], t[1], t[2], t[3], t[4], t[5], t[6] // 10000, t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def run(cur, label, sql, cap=400, cw=400):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                w(" | ".join(cols))
                for r in cur.fetchall()[:cap]:
                    w(" | ".join("" if v is None else str(v)[:cw] for v in r))
            else:
                w("(no resultset)")
            if not cur.nextset():
                break
    except Exception as e:
        w(f"ERROR: {str(e)[:600]}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 150
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"CONTRACT2 @ local {datetime.now().isoformat()} (READ-ONLY)")

    # (A) All programmable objects present now (are the old usp_* still there?)
    run(cur, "A.all_programmable", """
        SELECT o.name, o.type_desc, CONVERT(varchar(19),o.create_date,120) create_date,
               CONVERT(varchar(19),o.modify_date,120) modify_date
        FROM sys.objects o WHERE o.type IN ('P','V','TR','FN','IF','TF','PC')
        ORDER BY o.type_desc, o.name""", cap=100)

    # (B) Current Agent jobs + FULL step commands (unfiltered) + schedules
    run(cur, "B.jobs", """
        SELECT CAST(j.name AS varchar(80)) job, j.enabled,
               CONVERT(varchar(19),j.date_modified,120) modified
        FROM msdb.dbo.sysjobs j ORDER BY j.name""")
    cur.execute("""SELECT j.name, s.step_id, s.step_name, s.subsystem, s.database_name, s.command
                   FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id=s.job_id
                   ORDER BY j.name, s.step_id""")
    w("\n===== B.job_steps_FULL =====")
    for r in cur.fetchall():
        w(f"\n--- JOB: {r[0]} | step {r[1]} '{r[2]}' | subsystem={r[3]} | db={r[4]} ---")
        w(r[5] if r[5] is not None else "(null command)")
    run(cur, "B.schedules", """
        SELECT CAST(j.name AS varchar(80)) job, sch.name sched, sch.enabled,
               sch.freq_type, sch.freq_subday_type, sch.freq_subday_interval every_units,
               sch.active_start_time
        FROM msdb.dbo.sysjobschedules js JOIN msdb.dbo.sysjobs j ON j.job_id=js.job_id
        JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id ORDER BY j.name""")
    run(cur, "B.last20_outcomes", """
        SELECT TOP 20 CAST(j.name AS varchar(50)) job, h.step_id, h.run_date,
               RIGHT('000000'+CAST(h.run_time AS varchar(6)),6) rtime, h.run_status,
               LEFT(h.message,120) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        WHERE h.step_id IN (0,1) ORDER BY h.instance_id DESC""", cap=20, cw=120)

    # (C) Golden production-day 2026-07-22: TRUE row count (was capped at 1000)
    run(cur, "C.golden_day_count", """
        SELECT COUNT(*) rows_2026_07_22, COUNT(DISTINCT [Batch GUID]) batches_2026_07_22
        FROM dbo.BatchMaterials_Shadow WITH (NOLOCK)
        WHERE CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date) = '2026-07-22'""")
    run(cur, "C.rows_per_prod_day_last10", """
        SELECT TOP 10 CONVERT(varchar(10),CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date),120) prod_day,
               COUNT(*) rows_, COUNT(DISTINCT [Batch GUID]) batches
        FROM dbo.BatchMaterials_Shadow WITH (NOLOCK)
        GROUP BY CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date)
        ORDER BY prod_day DESC""", cap=10)

    # (D) SOURCE vs LOCAL datetime ground truth.
    # newest stored batch per server (ROOTGUID + stored local datetimes)
    run(cur, "D.local_newest_per_server", """
        SELECT [Source Server], CAST([Batch GUID] AS varchar(40)) batch_guid,
               CAST(ROOTGUID AS varchar(40)) rootguid, [Batch Name],
               CONVERT(varchar(30),[Batch Act Start],121) stored_ActStart,
               CONVERT(varchar(30),[Batch Act End],121) stored_ActEnd,
               CONVERT(varchar(30),[Batch Transfer Time],121) stored_Xfer
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY [Source Server] ORDER BY [Batch Act Start] DESC) rn
          FROM dbo.BatchMaterials_Shadow WITH (NOLOCK)
        ) z WHERE rn=1""")

    # grab one representative ROOTGUID per server to probe the source
    reps = {}
    cur.execute("""
        SELECT [Source Server], CAST(ROOTGUID AS varchar(40))
        FROM (SELECT [Source Server], ROOTGUID,
                     ROW_NUMBER() OVER (PARTITION BY [Source Server] ORDER BY [Batch Act Start] DESC) rn
              FROM dbo.BatchMaterials_Shadow WITH (NOLOCK) WHERE ROOTGUID IS NOT NULL) z
        WHERE rn=1""")
    for srv, rg in cur.fetchall():
        reps[srv.strip()] = rg
    w("\n===== D.reps =====")
    w(str(reps))

    linkmap = {"Server1": "FAKIEH_SERVER1", "Server2": "FAKIEH_SERVER2"}
    for srv, rg in reps.items():
        ls = linkmap.get(srv)
        if not ls or not rg:
            continue
        # source BatchCopy raw times for that OGUID (CONVERT ,121 exposes any datetimeoffset)
        inner = ("SELECT TOP 3 CONVERT(varchar(40),ActStart,121) src_ActStart, "
                 "CONVERT(varchar(40),ActEnd,121) src_ActEnd, "
                 "CONVERT(varchar(40),BatchTransferTime,121) src_Xfer, "
                 "CONVERT(varchar(40),Created,121) src_Created "
                 f"FROM ASMBatchReports.dbo.BatchCopy WHERE OGUID=''{rg}''")
        run(cur, f"D.source_BatchCopy {srv} via {ls} (OGUID={rg})",
            f"SELECT * FROM OPENQUERY([{ls}],'{inner}')")
        # source column type of ActStart (is it datetime or datetimeoffset upstream?)
        inner2 = ("SELECT c.name col, t.name type FROM ASMBatchReports.sys.columns c "
                  "JOIN ASMBatchReports.sys.types t ON t.user_type_id=c.user_type_id "
                  "WHERE c.object_id=OBJECT_ID(''ASMBatchReports.dbo.BatchCopy'') "
                  "AND c.name IN (''ActStart'',''ActEnd'',''BatchTransferTime'',''Created'')")
        run(cur, f"D.source_BatchCopy_coltypes {srv} via {ls}",
            f"SELECT * FROM OPENQUERY([{ls}],'{inner2}')")

    cn.close()
    w("\nDONE CONTRACT2")
    OUT.close()


if __name__ == "__main__":
    main()

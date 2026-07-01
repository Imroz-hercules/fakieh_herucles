"""
READ-ONLY Phase 4 — OS1 local pipeline proof (RetrieveAndStoreAllBatchData_S1 body,
job history, local-copy keys/triggers, DataSyncTracker). SELECT/OBJECT_DEFINITION only. NO writes.
"""
import struct, pyodbc
from datetime import datetime
SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_p4_out.txt",
           "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d%+03d:%02d" % (t[0], t[1], t[2], t[3], t[4], t[5], t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def oq(cur, label, ls, remote_sql, cap=80, cw=200, body=False):
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
        w(f"ERROR: {str(e)[:280]}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 90
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"PHASE 4 OS1 LOCAL PIPELINE @ local {datetime.now().isoformat()} (read-only)")

    w("\n===== OS1 RetrieveAndStoreAllBatchData_S1 body =====")
    oq(cur, "S1 proc body", "OS1_SQL",
       "SELECT OBJECT_DEFINITION(OBJECT_ID('ASMBatchReports.dbo.RetrieveAndStoreAllBatchData_S1'))", body=True)

    oq(cur, "OS1 job step full command", "OS1_SQL",
       "SELECT j.name job, s.step_id, s.subsystem, s.database_name, s.command "
       "FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id=s.job_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1' ORDER BY s.step_id", cap=10, cw=2000)

    oq(cur, "OS1 job history (RetrieveAndStoreAllBatchData_S1)", "OS1_SQL",
       "SELECT TOP 25 h.step_id, h.step_name, h.run_status, h.run_date, h.run_time, "
       "LEFT(h.message,300) msg FROM msdb.dbo.sysjobhistory h "
       "JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1' ORDER BY h.run_date DESC, h.run_time DESC",
       cap=25, cw=300)

    oq(cur, "OS1 job schedule", "OS1_SQL",
       "SELECT j.name job, sch.name sched, sch.freq_type, sch.freq_subday_type, sch.freq_subday_interval, "
       "sch.enabled FROM msdb.dbo.sysjobschedules js JOIN msdb.dbo.sysjobs j ON j.job_id=js.job_id "
       "JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id "
       "WHERE j.name='RetrieveAndStoreAllBatchData_S1'", cap=10)

    oq(cur, "OS1 ASMBatchReports DataSyncTracker content", "OS1_SQL",
       "SELECT [Source Server], CONVERT(varchar(33),LastTimeStamp,126) LastTimeStamp "
       "FROM ASMBatchReports.dbo.DataSyncTracker WITH (NOLOCK)")

    oq(cur, "OS1 local-copy keys/indexes (BatchCopy/ParValueOnline_copy/OrderDetails)", "OS1_SQL",
       "SELECT t.name tbl, i.name idx, i.is_primary_key, i.is_unique, c.name col, ic.key_ordinal "
       "FROM ASMBatchReports.sys.indexes i "
       "JOIN ASMBatchReports.sys.tables t ON t.object_id=i.object_id "
       "JOIN ASMBatchReports.sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id "
       "JOIN ASMBatchReports.sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id "
       "WHERE t.name IN ('BatchCopy','ParValueOnline_copy','OrderDetails') AND i.index_id>0 "
       "ORDER BY t.name, i.is_primary_key DESC, i.name, ic.key_ordinal", cap=80)

    oq(cur, "OS1 triggers on local-copy tables", "OS1_SQL",
       "SELECT t.name parent, tr.name trig, tr.is_disabled, tr.is_instead_of_trigger "
       "FROM ASMBatchReports.sys.triggers tr JOIN ASMBatchReports.sys.tables t ON t.object_id=tr.parent_id "
       "ORDER BY t.name", cap=40)

    # DB file sizes on OS1 (sizing for capture)
    oq(cur, "OS1 ASMBatchReports file sizes (MB)", "OS1_SQL",
       "SELECT name, type_desc, size*8/1024 size_mb FROM ASMBatchReports.sys.database_files")

    cn.close()
    w("\nDONE PHASE4")
    OUT.close()


if __name__ == "__main__":
    main()

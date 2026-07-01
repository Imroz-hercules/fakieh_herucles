"""
READ-ONLY Phase 3 — prove the OS-local-copy architecture (quick+final fix planning).
User-authorized read-only SIMATIC/OS probing. SELECT / catalog / OBJECT_DEFINITION only.
NO writes. autocommit, READ UNCOMMITTED. Writes _ro_p3_out.txt (UTF-8).
"""
import struct
import pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_p3_out.txt",
           "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d%+03d:%02d" % (t[0], t[1], t[2], t[3], t[4], t[5], t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def oq(cur, label, ls, remote_sql, cap=80, cw=160):
    esc = remote_sql.replace("'", "''")
    sql = f"SELECT * FROM OPENQUERY([{ls}], '{esc}')"
    w(f"\n----- [{ls}] {label} -----")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
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
    w(f"PHASE 3 OS-LOCAL-COPY CAPTURE @ local {datetime.now().isoformat()} (read-only)")

    # OS1 deep dive via OS1_SQL (sa). OS2 via FAKIEH_SERVER2 (sysadmin).
    targets = [("OS1", "OS1_SQL"), ("OS2", "FAKIEH_SERVER2")]

    for osname, ls in targets:
        w(f"\n================= {osname} via [{ls}] =================")
        oq(cur, "databases", ls,
           "SELECT name, CONVERT(varchar(20),create_date,120) created, state_desc FROM sys.databases ORDER BY name")

        # Does a local ASMBatchReports (or HerculesCapture) exist? inventory its objects.
        for db in ("ASMBatchReports", "HerculesCapture"):
            oq(cur, f"{db} exists? object inventory", ls,
               f"SELECT o.type_desc, OBJECT_SCHEMA_NAME(o.object_id) sch, o.name, "
               f"CONVERT(varchar(20),o.create_date,120) cre, CONVERT(varchar(20),o.modify_date,120) mod "
               f"FROM {db}.sys.objects o WHERE o.type IN ('P','V','FN','IF','TF','TR','U') "
               f"ORDER BY o.type_desc, o.name", cap=120)
            oq(cur, f"{db} table rowcounts", ls,
               f"SELECT t.name tbl, SUM(p.rows) rows_, CONVERT(varchar(20),t.modify_date,120) modi "
               f"FROM {db}.sys.tables t JOIN {db}.sys.partitions p "
               f"ON p.object_id=t.object_id AND p.index_id IN (0,1) "
               f"GROUP BY t.name, t.modify_date ORDER BY rows_ DESC", cap=80)

        # Custom copy logic anywhere on this OS server (SimaticBatch + ASMBatchReports modules)
        oq(cur, "SimaticBatch modules referencing copy/ASM/BatchCopy", ls,
           "SELECT o.type_desc, OBJECT_SCHEMA_NAME(o.object_id) sch, o.name "
           "FROM SimaticBatch.sys.objects o WHERE o.type IN ('P','V','FN','IF','TF','TR') "
           "AND OBJECT_DEFINITION(o.object_id) IS NOT NULL "
           "AND (OBJECT_DEFINITION(o.object_id) LIKE '%BatchCopy%' "
           "OR OBJECT_DEFINITION(o.object_id) LIKE '%ParValueOnline_copy%' "
           "OR OBJECT_DEFINITION(o.object_id) LIKE '%ASMBatchReports%' "
           "OR OBJECT_DEFINITION(o.object_id) LIKE '%HerculesCapture%' "
           "OR OBJECT_DEFINITION(o.object_id) LIKE '%CopyBatch%' "
           "OR OBJECT_DEFINITION(o.object_id) LIKE '%CopyParValue%')", cap=60)

        # ALL triggers in SimaticBatch (vendor + any custom), with dates
        oq(cur, "ALL SimaticBatch triggers", ls,
           "SELECT t.name parent, tr.name trig, tr.is_disabled, tr.is_instead_of_trigger, "
           "CONVERT(varchar(20),tr.create_date,120) cre, CONVERT(varchar(20),tr.modify_date,120) mod "
           "FROM SimaticBatch.sys.triggers tr JOIN SimaticBatch.sys.tables t ON t.object_id=tr.parent_id "
           "ORDER BY t.name, tr.name", cap=80)

        # Is source UPDATE-able? evidence: Modification table activity + tr_BatchMerger is INSTEAD OF I/U/D
        oq(cur, "Modification table recent (source UPDATE evidence)", ls,
           "SELECT TOP 5 * FROM SimaticBatch.SIMATIC_BATCH.Modification WITH (NOLOCK) "
           "ORDER BY 1 DESC", cap=5, cw=60)

        # OS SQL Agent jobs + steps referencing the pipeline
        oq(cur, "OS jobs", ls,
           "SELECT j.name, j.enabled, CONVERT(varchar(20),j.date_created,120) cre, "
           "CONVERT(varchar(20),j.date_modified,120) mod FROM msdb.dbo.sysjobs j ORDER BY j.name", cap=60)
        oq(cur, "OS job steps referencing copy/ASM/Batch", ls,
           "SELECT j.name job, s.step_id, s.subsystem, s.database_name, LEFT(s.command,300) cmd "
           "FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id=s.job_id "
           "WHERE s.command LIKE '%BatchCopy%' OR s.command LIKE '%ParValueOnline%' "
           "OR s.command LIKE '%ASMBatchReports%' OR s.database_name='ASMBatchReports' "
           "ORDER BY j.name, s.step_id", cap=40, cw=300)

    # OS1 ASMBatchReports local-copy table detail (the suspected old durable copy)
    w("\n================= OS1.ASMBatchReports local-copy detail via [OS1_SQL] =================")
    oq(cur, "OS1 ASMBatchReports columns of BatchCopy/ParValueOnline_copy/Order*", "OS1_SQL",
       "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ASMBatchReports.INFORMATION_SCHEMA.COLUMNS "
       "WHERE TABLE_NAME IN ('BatchCopy','ParValueOnline_copy','OrderDetails','OrderCopy','OrderDetail') "
       "ORDER BY TABLE_NAME, ORDINAL_POSITION", cap=200, cw=60)
    oq(cur, "OS1 ASMBatchReports.BatchCopy populate state", "OS1_SQL",
       "SELECT COUNT(*) rows_, COUNT(DISTINCT OGUID) d_oguid, "
       "CONVERT(varchar(33),MAX(BatchTransferTime),126) max_xfer, "
       "CONVERT(varchar(33),MAX(Created),126) max_created FROM ASMBatchReports.dbo.BatchCopy WITH (NOLOCK)")
    oq(cur, "OS1 ASMBatchReports.ParValueOnline_copy populate state", "OS1_SQL",
       "SELECT COUNT(*) rows_, COUNT(DISTINCT ROOTGUID) d_root, "
       "CONVERT(varchar(33),MAX([TimeStamp]),126) max_ts FROM ASMBatchReports.dbo.ParValueOnline_copy WITH (NOLOCK)")
    oq(cur, "OS1 ASMBatchReports.BatchCopy TOP5 latest", "OS1_SQL",
       "SELECT TOP 5 CAST(OGUID AS varchar(40)) OGUID, CAST(ROOTGUID AS varchar(40)) ROOTGUID, "
       "ProductName, FormulaCategoryName, OrderId, Quantity, CONVERT(varchar(33),Created,126) Created "
       "FROM ASMBatchReports.dbo.BatchCopy WITH (NOLOCK) ORDER BY Created DESC", cap=5, cw=60)

    cn.close()
    w("\nDONE PHASE3")
    OUT.close()


if __name__ == "__main__":
    main()

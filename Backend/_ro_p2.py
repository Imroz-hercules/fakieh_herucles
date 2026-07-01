"""
READ-ONLY Phase 2 SIMATIC investigation via Hercules linked servers (OPENQUERY).
User explicitly authorized full read-only SIMATIC probe (in-transcript).
HARD RULE: DO NOT ADD OR MODIFY ANYTHING. Only SELECT / catalog reads / OBJECT_DEFINITION.
TOP-limited, NOLOCK, no vendor procedure execution. autocommit, READ UNCOMMITTED.
Writes to _ro_p2_out.txt (UTF-8).
"""
import struct
import pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_p2_out.txt",
           "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d%+03d:%02d" % (t[0], t[1], t[2], t[3], t[4], t[5], t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def oq(cur, label, ls, remote_sql, cap=60, cw=120):
    """Run a remote SELECT via OPENQUERY (escape single quotes in remote_sql)."""
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
        w(f"ERROR: {str(e)[:300]}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 90
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"PHASE 2 SIMATIC CAPTURE @ local {datetime.now().isoformat()} (read-only via linked servers)")

    for ls in ("FAKIEH_SERVER1", "FAKIEH_SERVER2", "OS1_SQL"):
        w(f"\n================= {ls} =================")
        oq(cur, "identity", ls,
           "SELECT @@SERVERNAME s, DB_NAME() db, SUSER_SNAME() lg, "
           "CAST(SERVERPROPERTY('Edition') AS varchar(60)) ed, "
           "CAST(SERVERPROPERTY('ProductVersion') AS varchar(30)) ver, "
           "IS_SRVROLEMEMBER('sysadmin') sa, CONVERT(varchar(33),SYSDATETIMEOFFSET()) now")
        oq(cur, "databases", ls, "SELECT name FROM sys.databases ORDER BY name", cap=60)

    # Deep dive on the two SIMATIC sources used by the pipeline
    for ls in ("FAKIEH_SERVER1", "FAKIEH_SERVER2"):
        w(f"\n================= {ls} : SimaticBatch deep dive =================")
        oq(cur, "tables+rowcounts (top 60 by rows)", ls,
           "SELECT TOP 60 s.name sch, t.name tbl, SUM(p.rows) rows_ "
           "FROM SimaticBatch.sys.tables t JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
           "JOIN SimaticBatch.sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) "
           "GROUP BY s.name,t.name ORDER BY rows_ DESC", cap=60)
        oq(cur, "Batch/BatchArchive/Order schema", ls,
           "SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, DATA_TYPE, IS_NULLABLE "
           "FROM SimaticBatch.INFORMATION_SCHEMA.COLUMNS "
           "WHERE TABLE_NAME IN ('Batch','BatchArchive','Order') ORDER BY TABLE_NAME, ORDINAL_POSITION",
           cap=400, cw=80)
        oq(cur, "PK/unique keys on Batch/BatchArchive", ls,
           "SELECT t.name tbl, i.name idx, i.is_primary_key, i.is_unique, c.name col, ic.key_ordinal "
           "FROM SimaticBatch.sys.indexes i "
           "JOIN SimaticBatch.sys.tables t ON t.object_id=i.object_id "
           "JOIN SimaticBatch.sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id "
           "JOIN SimaticBatch.sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id "
           "WHERE t.name IN ('Batch','BatchArchive') AND (i.is_primary_key=1 OR i.is_unique=1) "
           "ORDER BY t.name, i.name, ic.key_ordinal", cap=80)
        oq(cur, "triggers on Batch/ParValue/Action (+bodies)", ls,
           "SELECT t.name parent, tr.name trig, tr.is_disabled, tr.is_instead_of_trigger, "
           "CAST(OBJECT_DEFINITION(tr.object_id) AS nvarchar(2000)) body "
           "FROM SimaticBatch.sys.triggers tr JOIN SimaticBatch.sys.tables t ON t.object_id=tr.parent_id "
           "WHERE t.name IN ('Batch','BatchArchive','ParValueOnline','ParValue','Action','Order')",
           cap=40, cw=2000)
        oq(cur, "where descriptive header fields live", ls,
           "SELECT OBJECT_NAME(c.object_id) tbl, c.name col FROM SimaticBatch.sys.columns c "
           "WHERE c.name IN ('FormulaCategoryName','ProductName','Name','OrderId','Quantity','OGUID',"
           "'ROOTGUID','Created','ActStart','ActEnd','BatchTransferTime') "
           "ORDER BY OBJECT_NAME(c.object_id), c.name", cap=200, cw=60)
        oq(cur, "Batch live count + distinct guids", ls,
           "SELECT COUNT(*) batch_rows, COUNT(DISTINCT OGUID) d_oguid, COUNT(DISTINCT ROOTGUID) d_root "
           "FROM SimaticBatch.SIMATIC_BATCH.Batch WITH (NOLOCK)")
        oq(cur, "Batch sample (key header fields)", ls,
           "SELECT TOP 30 CAST(OGUID AS varchar(40)) OGUID, CAST(ROOTGUID AS varchar(40)) ROOTGUID, "
           "ProductName, FormulaCategoryName, FormulaName, OrderId, Quantity, "
           "CONVERT(varchar(33),Created,126) Created, CONVERT(varchar(33),BatchTransferTime,126) Xfer "
           "FROM SimaticBatch.SIMATIC_BATCH.Batch WITH (NOLOCK)", cap=30, cw=70)
        oq(cur, "BatchArchive count + date span (does it RETAIN purged headers?)", ls,
           "SELECT COUNT(*) arch_rows, COUNT(DISTINCT OGUID) d_oguid, "
           "CONVERT(varchar(33),MIN(Created),126) min_created, CONVERT(varchar(33),MAX(Created),126) max_created "
           "FROM SimaticBatch.SIMATIC_BATCH.BatchArchive WITH (NOLOCK)")
        oq(cur, "BatchArchive sample (header completeness)", ls,
           "SELECT TOP 20 CAST(OGUID AS varchar(40)) OGUID, ProductName, FormulaCategoryName, "
           "FormulaName, OrderId, Quantity, CONVERT(varchar(33),Created,126) Created "
           "FROM SimaticBatch.SIMATIC_BATCH.BatchArchive WITH (NOLOCK)", cap=20, cw=70)
        oq(cur, "join test Batch.OGUID = PV.ROOTGUID", ls,
           "SELECT TOP 10 CAST(b.OGUID AS varchar(40)) batch_oguid, COUNT(*) pv_rows "
           "FROM SimaticBatch.SIMATIC_BATCH.Batch b WITH (NOLOCK) "
           "JOIN SimaticBatch.SIMATIC_BATCH.ParValueOnline pv WITH (NOLOCK) ON pv.ROOTGUID=b.OGUID "
           "GROUP BY b.OGUID", cap=10)
        oq(cur, "ParValueOnline live count + latest ts", ls,
           "SELECT COUNT(*) pv_rows, COUNT(DISTINCT ROOTGUID) d_root, "
           "CONVERT(varchar(33),MAX([TimeStamp]),126) max_ts "
           "FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline WITH (NOLOCK)")

    cn.close()
    w("\nDONE PHASE2")
    OUT.close()


if __name__ == "__main__":
    main()

"""
READ-ONLY: settle UTC-vs-local by comparing SOURCE datetimeoffset (upstream) to the
stored local DATETIME for the SAME batch (key = OGUID = local [Batch GUID]).
OPENQUERY(SELECT) only. No writes.
"""
import struct, pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
BASE = r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend"
OUT = open(BASE + r"\_ro_contract3_out.txt", "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d.%03d%+03d:%02d" % (
        t[0], t[1], t[2], t[3], t[4], t[5], t[6] // 10000, t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def run(cur, label, sql, cap=50, cw=200):
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
    w(f"CONTRACT3 @ local {datetime.now().isoformat()} (READ-ONLY)")

    # local reference: reporting server clock
    run(cur, "reporting_clock", "SELECT CONVERT(varchar(40),SYSDATETIMEOFFSET()) now_offset, CONVERT(varchar(40),SYSUTCDATETIME()) utc")

    # newest stored batch per server (key = [Batch GUID] = source OGUID)
    run(cur, "stored_newest_per_server", """
        SELECT [Source Server], CAST([Batch GUID] AS varchar(40)) batch_guid, [Batch Name],
               CONVERT(varchar(30),[Batch Act Start],121) stored_ActStart,
               CONVERT(varchar(30),[Batch Act End],121) stored_ActEnd,
               CONVERT(varchar(30),[Batch Transfer Time],121) stored_Xfer
        FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY [Source Server] ORDER BY [Batch Act Start] DESC) rn
              FROM dbo.BatchMaterials_Shadow WITH (NOLOCK)) z WHERE rn=1""")

    guids = {}
    cur.execute("""SELECT [Source Server], CAST([Batch GUID] AS varchar(40))
                   FROM (SELECT [Source Server],[Batch GUID],
                                ROW_NUMBER() OVER (PARTITION BY [Source Server] ORDER BY [Batch Act Start] DESC) rn
                         FROM dbo.BatchMaterials_Shadow WITH (NOLOCK)) z WHERE rn=1""")
    for srv, bg in cur.fetchall():
        guids[srv.strip()] = bg

    linkmap = {"Server1": "FAKIEH_SERVER1", "Server2": "FAKIEH_SERVER2"}
    for srv, ls in linkmap.items():
        # source server's own clock + identity
        run(cur, f"{ls}.clock",
            f"SELECT * FROM OPENQUERY([{ls}],'SELECT @@SERVERNAME s, CONVERT(varchar(40),SYSDATETIMEOFFSET()) now_offset')")
        # newest few source BatchCopy rows WITH datetimeoffset (raw, incl offset)
        run(cur, f"{ls}.source_newest_batchcopy",
            f"SELECT * FROM OPENQUERY([{ls}],'"
            "SELECT TOP 5 CONVERT(varchar(40),OGUID) OGUID, "
            "CONVERT(varchar(40),ActStart,121) src_ActStart, "
            "CONVERT(varchar(40),ActEnd,121) src_ActEnd, "
            "CONVERT(varchar(40),BatchTransferTime,121) src_Xfer, "
            "CONVERT(varchar(40),Created,121) src_Created "
            "FROM ASMBatchReports.dbo.BatchCopy ORDER BY BatchTransferTime DESC')")
        # exact same batch as stored (OGUID = local [Batch GUID])
        bg = guids.get(srv)
        if bg:
            run(cur, f"{ls}.source_exact_batch OGUID={bg}",
                f"SELECT * FROM OPENQUERY([{ls}],'"
                "SELECT CONVERT(varchar(40),OGUID) OGUID, "
                "CONVERT(varchar(40),ActStart,121) src_ActStart, "
                "CONVERT(varchar(40),ActEnd,121) src_ActEnd, "
                "CONVERT(varchar(40),BatchTransferTime,121) src_Xfer, "
                "CONVERT(varchar(40),Created,121) src_Created "
                f"FROM ASMBatchReports.dbo.BatchCopy WHERE OGUID=''{bg}''')")

    cn.close()
    w("\nDONE CONTRACT3")
    OUT.close()


if __name__ == "__main__":
    main()

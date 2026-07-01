"""READ-ONLY Phase 6 — free-disk on OS1/OS2 via sys.dm_os_volume_stats (xp_fixeddrives can't be
introspected through OPENQUERY). SELECT-only. Appends _ro_p6_out.txt."""
import pyodbc
SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_p6_out.txt",
           "w", encoding="utf-8")


def w(s=""):
    OUT.write(str(s) + "\n")


def oq(cur, label, ls, remote_sql):
    esc = remote_sql.replace("'", "''")
    w(f"\n----- [{ls}] {label} -----")
    try:
        cur.execute(f"SELECT * FROM OPENQUERY([{ls}], '{esc}')")
        cols = [d[0] for d in cur.description]
        w(" | ".join(cols))
        for r in cur.fetchall():
            w(" | ".join("" if v is None else str(v) for v in r))
    except Exception as e:
        w(f"ERROR: {str(e)[:300]}")


VOL = ("SELECT DISTINCT vs.volume_mount_point mnt, "
       "CAST(vs.total_bytes/1073741824.0 AS decimal(10,1)) total_gb, "
       "CAST(vs.available_bytes/1073741824.0 AS decimal(10,1)) free_gb "
       "FROM sys.master_files mf CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs")

cn = pyodbc.connect(CONN, autocommit=True)
cur = cn.cursor()
cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
w("PHASE 6 FREE DISK (dm_os_volume_stats, READ-ONLY)")
w("\n----- [LOCAL reporting] volumes -----")
cur.execute(VOL)
w(" | ".join(d[0] for d in cur.description))
for r in cur.fetchall():
    w(" | ".join(str(v) for v in r))
oq(cur, "OS1 volumes", "OS1_SQL", VOL)
oq(cur, "OS2 volumes", "FAKIEH_SERVER2", VOL)
cn.close()
w("\nDONE PHASE6")
OUT.close()

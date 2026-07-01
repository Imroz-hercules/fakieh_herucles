"""READ-ONLY probe 5: linked-server SIMATIC topology. MINIMAL, NOLOCK, TOP(1). NO WRITES.
OT-safety: READ UNCOMMITTED session, only catalog + TOP(1) samples. Never touch production write path."""
import pyodbc
SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
USER, PWD = "fakieh_app_user", "Hercules"
CONN = ("DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SERVER};DATABASE=ASMBatchReports;UID={USER};PWD={PWD};"
        "TrustServerCertificate=yes;Connection Timeout=10;")


def run(cur, label, sql, cap=60):
    print(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        if cols:
            print(" | ".join(cols))
            rows = cur.fetchall()
            for r in rows[:cap]:
                print(" | ".join("" if v is None else str(v)[:60] for v in r))
            print(f"({len(rows)} rows)")
        else:
            print("(no resultset)")
    except Exception as e:
        print(f"ERROR: {e}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    print("CONNECT OK (READ UNCOMMITTED)")

    for ls in ("FAKIEH_SERVER1", "FAKIEH_SERVER2", "OS1_SQL"):
        run(cur, f"{ls}: databases", f"SELECT name FROM [{ls}].master.sys.databases ORDER BY name")

    # Find which DB holds schema SIMATIC_BATCH and tables Batch / ParValueOnline, on Server1
    run(cur, "SERVER1: find SIMATIC_BATCH schema across dbs (sys.databases loop replaced by direct guesses)",
        """SELECT 1 AS placeholder""")

    cn.close()
    print("\nDONE")


if __name__ == "__main__":
    main()

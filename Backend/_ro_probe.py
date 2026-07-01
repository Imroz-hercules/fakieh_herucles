"""
READ-ONLY forensic probe. NO WRITES. Only SELECT / catalog-view reads.
Hard rule from user: DO NOT ADD OR MODIFY ANYTHING IN THE SQL SERVER.
This script never issues DDL/DML; autocommit=True; SELECT-only.
"""
import sys
import pyodbc

SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
USER = "fakieh_app_user"
PWD = "Hercules"

CONN = (
    "DRIVER={ODBC Driver 17 for SQL Server};"
    f"SERVER={SERVER};"
    "DATABASE=master;"
    f"UID={USER};PWD={PWD};"
    "TrustServerCertificate=yes;"
    "Connection Timeout=8;"
)


def run(cur, label, sql):
    print(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        if cols:
            print(" | ".join(cols))
            rows = cur.fetchall()
            for r in rows[:200]:
                print(" | ".join("" if v is None else str(v) for v in r))
            print(f"({len(rows)} rows)")
        else:
            print("(no resultset)")
    except Exception as e:
        print(f"ERROR: {e}")


def main():
    try:
        cn = pyodbc.connect(CONN, autocommit=True)
    except Exception as e:
        print(f"CONNECT FAILED: {e}")
        sys.exit(2)
    print("CONNECT OK (read-only intent, autocommit, SELECT-only)")
    cur = cn.cursor()

    run(cur, "identity/version", """
        SELECT
            @@VERSION AS version,
            SUSER_SNAME() AS login_name,
            IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin,
            HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW SERVER STATE') AS can_view_server_state,
            HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW ANY DEFINITION') AS can_view_any_def""")

    run(cur, "databases", """
        SELECT database_id, name, state_desc, recovery_model_desc,
               is_read_committed_snapshot_on, snapshot_isolation_state_desc
        FROM sys.databases ORDER BY name""")

    run(cur, "linked_servers (sys.servers)", """
        SELECT server_id, name, product, provider, data_source, is_linked
        FROM sys.servers ORDER BY server_id""")

    run(cur, "my db-level access per database", """
        SELECT name AS db_name,
               HAS_DBACCESS(name) AS has_access
        FROM sys.databases ORDER BY name""")

    cn.close()
    print("\nDONE")


if __name__ == "__main__":
    main()

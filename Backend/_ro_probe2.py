"""READ-ONLY probe 2: ASMBatchReports objects/procedures/indexes + msdb jobs. NO WRITES."""
import pyodbc

SERVER = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
USER, PWD = "fakieh_app_user", "Hercules"
CONN = ("DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SERVER};DATABASE=ASMBatchReports;UID={USER};PWD={PWD};"
        "TrustServerCertificate=yes;Connection Timeout=8;")


def run(cur, label, sql):
    print(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        if cols:
            print(" | ".join(cols))
            rows = cur.fetchall()
            for r in rows[:300]:
                print(" | ".join("" if v is None else str(v) for v in r))
            print(f"({len(rows)} rows)")
        else:
            print("(no resultset)")
    except Exception as e:
        print(f"ERROR: {e}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cur = cn.cursor()
    print("CONNECT OK ASMBatchReports")

    run(cur, "user procedures + modify dates", """
        SELECT s.name AS sch, o.name AS proc_name, o.create_date, o.modify_date
        FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
        WHERE o.type IN ('P','PC') ORDER BY o.modify_date DESC""")

    run(cur, "user functions/views/triggers", """
        SELECT s.name AS sch, o.name, o.type_desc, o.create_date, o.modify_date
        FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
        WHERE o.type IN ('FN','IF','TF','V','TR') ORDER BY o.modify_date DESC""")

    run(cur, "all user tables + row estimate", """
        SELECT s.name AS sch, t.name AS tbl,
               SUM(CASE WHEN p.index_id IN (0,1) THEN p.rows ELSE 0 END) AS est_rows,
               t.create_date, t.modify_date
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id=t.schema_id
        LEFT JOIN sys.partitions p ON p.object_id=t.object_id
        GROUP BY s.name, t.name, t.create_date, t.modify_date
        ORDER BY t.name""")

    run(cur, "indexes on BatchMaterials (uniqueness matters)", """
        SELECT i.name AS index_name, i.type_desc, i.is_unique, i.is_primary_key,
               STUFF((SELECT ', '+c.name FROM sys.index_columns ic
                      JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
                      WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.is_included_column=0
                      ORDER BY ic.key_ordinal FOR XML PATH('')),1,2,'') AS key_cols
        FROM sys.indexes i
        WHERE i.object_id=OBJECT_ID('dbo.BatchMaterials') AND i.type>0
        ORDER BY i.is_primary_key DESC, i.is_unique DESC, i.name""")

    run(cur, "columns of every user table", """
        SELECT t.name AS tbl, c.name AS col, ty.name AS dtype, c.max_length, c.is_nullable
        FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
        JOIN sys.types ty ON ty.user_type_id=c.user_type_id
        ORDER BY t.name, c.column_id""")

    # Test procedure-definition visibility (needs VIEW DEFINITION)
    run(cur, "proc definition visibility test", """
        SELECT o.name,
               CASE WHEN OBJECT_DEFINITION(o.object_id) IS NULL THEN 'HIDDEN/NO-PERM' ELSE 'VISIBLE' END AS def_state,
               LEN(OBJECT_DEFINITION(o.object_id)) AS def_len
        FROM sys.objects o WHERE o.type IN ('P','PC') ORDER BY o.name""")

    # msdb jobs
    run(cur, "SQL Agent jobs", """
        SELECT j.job_id, j.name, j.enabled, j.date_created, j.date_modified
        FROM msdb.dbo.sysjobs j ORDER BY j.name""")

    run(cur, "SQL Agent job steps", """
        SELECT j.name AS job, s.step_id, s.step_name, s.subsystem,
               s.database_name, LEFT(s.command, 400) AS command_head
        FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id
        ORDER BY j.name, s.step_id""")

    run(cur, "recent job history (last 60)", """
        SELECT TOP (60) j.name AS job, h.step_id, h.step_name,
               h.run_status, h.run_date, h.run_time, h.run_duration,
               LEFT(h.message,200) AS msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id
        ORDER BY h.run_date DESC, h.run_time DESC""")

    cn.close()
    print("\nDONE")


if __name__ == "__main__":
    main()

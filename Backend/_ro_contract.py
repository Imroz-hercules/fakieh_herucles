"""
READ-ONLY contract capture (topology / procs / schema / datetime / volumes / golden sample).
HARD RULE: DO NOT ADD OR MODIFY ANYTHING IN SQL SERVER.
Only SELECT / sys-catalog / OBJECT_DEFINITION / OPENQUERY(SELECT). No DDL/DML, no #temp, no EXEC of app procs.
autocommit=True, READ UNCOMMITTED. Writes _ro_contract_out.txt (UTF-8) and _ro_golden.csv.
"""
import struct
import csv
import pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
BASE = r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend"
OUT = open(BASE + r"\_ro_contract_out.txt", "w", encoding="utf-8")


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d.%03d%+03d:%02d" % (
        t[0], t[1], t[2], t[3], t[4], t[5], t[6] // 10000, t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def run(cur, label, sql, cap=1000, cw=400):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols = [d[0] for d in cur.description]
                w(" | ".join(cols))
                rows = cur.fetchall()
                for r in rows[:cap]:
                    w(" | ".join("" if v is None else str(v)[:cw] for v in r))
                w(f"({len(rows)} rows)")
            else:
                w("(no resultset)")
            if not cur.nextset():
                break
    except Exception as e:
        w(f"ERROR: {str(e)[:600]}")


def scalar(cur, sql):
    try:
        cur.execute(sql)
        r = cur.fetchone()
        return r[0] if r else None
    except Exception as e:
        return f"ERR:{str(e)[:200]}"


def dump_defs(cur, label, discover_sql):
    """Run a discovery query returning object names; dump each full definition."""
    w(f"\n===== {label} (discovery) =====")
    names = []
    try:
        cur.execute(discover_sql)
        cols = [d[0] for d in cur.description]
        w(" | ".join(cols))
        for r in cur.fetchall():
            w(" | ".join("" if v is None else str(v) for v in r))
            names.append(str(r[0]))
        w(f"({len(names)} objects)")
    except Exception as e:
        w(f"ERROR: {str(e)[:600]}")
        return
    for nm in names:
        w(f"\n----- DEFINITION: {nm} -----")
        try:
            cur.execute("SELECT OBJECT_DEFINITION(OBJECT_ID(?))", nm)
            row = cur.fetchone()
            w(row[0] if row and row[0] is not None else "(NULL definition)")
        except Exception as e:
            w(f"ERROR: {str(e)[:400]}")


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 150
    cn.add_output_converter(-155, dto)  # datetimeoffset
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"CONTRACT CAPTURE @ local {datetime.now().isoformat()} (Windows-auth, READ-ONLY)")

    # ============ 1) TOPOLOGY & VERSIONS ============
    run(cur, "1.identity", """
        SELECT @@SERVERNAME AS server_name, SERVERPROPERTY('MachineName') AS machine,
               SERVERPROPERTY('InstanceName') AS instance,
               SERVERPROPERTY('ProductVersion') AS product_version,
               SERVERPROPERTY('ProductLevel') AS product_level,
               SERVERPROPERTY('Edition') AS edition,
               DB_NAME() AS current_db, SUSER_SNAME() AS login_name,
               IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin""")
    run(cur, "1.version", "SELECT @@VERSION AS version")
    run(cur, "1.linked_servers", """
        SELECT name, product, provider, data_source,
               is_data_access_enabled, is_rpc_out_enabled
        FROM sys.servers WHERE is_linked = 1 ORDER BY name""")
    run(cur, "1.databases_present", """
        SELECT name, state_desc, CONVERT(varchar(19),create_date,120) create_date
        FROM sys.databases ORDER BY database_id""")

    # ============ 2) STORED PROCEDURES (verbatim) ============
    dump_defs(cur, "2.pipeline_objects", """
        SELECT DISTINCT OBJECT_SCHEMA_NAME(m.object_id) + '.' + OBJECT_NAME(m.object_id) AS obj_name,
               o.type_desc, CONVERT(varchar(19),o.modify_date,120) AS modify_date,
               LEN(m.definition) AS def_len
        FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
        WHERE m.definition LIKE '%BatchMaterials%'
           OR m.definition LIKE '%MaterialInfo%'
           OR m.definition LIKE '%Batch GUID%'
        ORDER BY obj_name""")
    # how the ETL procs are invoked (SQL Agent job steps)
    run(cur, "2.agent_job_steps", """
        SELECT CAST(j.name AS varchar(60)) AS job, j.enabled, s.step_id, s.step_name,
               s.subsystem, s.database_name, CAST(s.command AS varchar(200)) AS command
        FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id = s.job_id
        WHERE s.subsystem = 'TSQL' AND s.command LIKE '%usp_Collect%'
        ORDER BY j.name, s.step_id""")
    run(cur, "2.agent_job_schedules", """
        SELECT CAST(j.name AS varchar(60)) AS job, sch.name AS sched, sch.enabled AS sched_enabled,
               sch.freq_subday_interval AS every_minutes
        FROM msdb.dbo.sysjobschedules js
        JOIN msdb.dbo.sysjobs j ON j.job_id = js.job_id
        JOIN msdb.dbo.sysschedules sch ON sch.schedule_id = js.schedule_id
        WHERE j.name LIKE '%Collect%' ORDER BY j.name""")

    # ============ 3) BATCH TABLE SCHEMA (dashboard + SP target) ============
    for tbl in ("BatchMaterials_Shadow", "BatchMaterials"):
        oid = scalar(cur, f"SELECT OBJECT_ID('dbo.{tbl}')")
        w(f"\n===== 3.exists: dbo.{tbl} -> object_id={oid} =====")
        if oid is None or str(oid).startswith("ERR"):
            continue
        run(cur, f"3.columns dbo.{tbl}", f"""
            SELECT c.column_id, c.name, t.name AS type, c.max_length, c.precision, c.scale, c.is_nullable
            FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
            WHERE c.object_id = OBJECT_ID('dbo.{tbl}') ORDER BY c.column_id""", cap=100)
        run(cur, f"3.indexes dbo.{tbl}", f"""
            SELECT i.name, i.is_unique, i.is_primary_key, i.type_desc,
                   STUFF((SELECT ', ' + col.name + CASE WHEN ic.is_descending_key=1 THEN ' DESC' ELSE '' END
                          FROM sys.index_columns ic JOIN sys.columns col
                               ON col.object_id=ic.object_id AND col.column_id=ic.column_id
                          WHERE ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.is_included_column=0
                          ORDER BY ic.key_ordinal FOR XML PATH('')),1,2,'') AS key_cols
            FROM sys.indexes i
            WHERE i.object_id = OBJECT_ID('dbo.{tbl}') AND i.type > 0
            ORDER BY i.index_id""", cap=50)
        run(cur, f"3.date_column_types dbo.{tbl}", f"""
            SELECT c.name, t.name AS type
            FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id
            WHERE c.object_id = OBJECT_ID('dbo.{tbl}')
              AND (c.name LIKE '%Start%' OR c.name LIKE '%End%' OR c.name LIKE '%Time%'
                   OR t.name LIKE '%date%') ORDER BY c.column_id""", cap=50)

    # pick dashboard table
    dash = "BatchMaterials_Shadow"
    if scalar(cur, "SELECT OBJECT_ID('dbo.BatchMaterials_Shadow')") is None:
        dash = "BatchMaterials"
    w(f"\n===== DASHBOARD_TABLE = dbo.{dash} =====")

    # ============ 4) DATETIME REALITY ============
    run(cur, "4.server_now_and_tz", """
        SELECT CONVERT(varchar(40),SYSDATETIMEOFFSET()) AS server_now_offset,
               CONVERT(varchar(40),SYSUTCDATETIME()) AS server_utc,
               CONVERT(varchar(40),SYSDATETIME()) AS server_local,
               CURRENT_TIMEZONE() AS windows_time_zone,
               DATENAME(TZOFFSET, SYSDATETIMEOFFSET()) AS utc_offset""")
    run(cur, f"4.top3_recent dbo.{dash}", f"""
        SELECT TOP 3 [Source Server], [Batch Name],
               CONVERT(varchar(30),[Batch Transfer Time],121) AS [Batch Transfer Time],
               CONVERT(varchar(30),[Batch Act Start],121) AS [Batch Act Start],
               CONVERT(varchar(30),[Batch Act End],121) AS [Batch Act End]
        FROM dbo.{dash} WITH (NOLOCK)
        ORDER BY [Batch Transfer Time] DESC""")

    # ============ 5) VOLUMES & DISTRIBUTION ============
    run(cur, f"5.volumes dbo.{dash}", f"""
        SELECT COUNT(*) AS rows_,
               COUNT(DISTINCT [Source Server]) AS srcs,
               COUNT(DISTINCT [Batch GUID]) AS batches,
               COUNT(DISTINCT [Material Name]) AS mats,
               CONVERT(varchar(30),MIN([Batch Transfer Time]),121) AS mn,
               CONVERT(varchar(30),MAX([Batch Transfer Time]),121) AS mx
        FROM dbo.{dash} WITH (NOLOCK)""")
    run(cur, f"5.by_source_server dbo.{dash}", f"""
        SELECT [Source Server], COUNT(*) AS rows_, COUNT(DISTINCT [Batch GUID]) AS batches,
               CONVERT(varchar(19),MIN([Batch Act Start]),120) AS min_start,
               CONVERT(varchar(19),MAX([Batch Act Start]),120) AS max_start
        FROM dbo.{dash} WITH (NOLOCK) GROUP BY [Source Server] ORDER BY [Source Server]""")

    # ============ 7) GOLDEN SAMPLE (most recent FULL production day) ============
    # production day label = DATEADD(hour,-4, utc_col); current prod day excluded (partial).
    cur.execute(f"""
        SELECT CONVERT(varchar(10),
                 MAX(CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date)),120) AS last_full_prod_day
        FROM dbo.{dash} WITH (NOLOCK)
        WHERE CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date)
              < CAST(DATEADD(HOUR,-4,SYSUTCDATETIME()) AS date)""")
    prod_day = cur.fetchone()[0]
    if prod_day is None:
        prod_day = scalar(cur, f"SELECT CONVERT(varchar(10),MAX(CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date)),120) FROM dbo.{dash} WITH (NOLOCK)")
    w(f"\n===== 7.golden_sample_day (Saudi production day) = {prod_day} on dbo.{dash} =====")

    golden_sql = f"""
        SELECT
            [Source Server],[Batch GUID],[ROOTGUID],[OrderID],[Batch Name],[Product Name],
            CONVERT(varchar(30),[Batch Act Start],121) AS [Batch Act Start],
            CONVERT(varchar(30),[Batch Act End],121) AS [Batch Act End],
            CONVERT(varchar(30),[Batch Transfer Time],121) AS [Batch Transfer Time],
            [Quantity],[Material Name],[Material Code],[sp_prot],
            [SetPoint Float],[Actual Value Float],[FormulaCategoryName]
        FROM dbo.{dash} WITH (NOLOCK)
        WHERE CAST(DATEADD(HOUR,-4,[Batch Act Start]) AS date) = '{prod_day}'
        ORDER BY [Batch Act Start] DESC
        OFFSET 0 ROWS FETCH NEXT 1000 ROWS ONLY"""
    try:
        cur.execute(golden_sql)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        with open(BASE + r"\_ro_golden.csv", "w", newline="", encoding="utf-8") as f:
            wr = csv.writer(f)
            wr.writerow(cols)
            for r in rows:
                wr.writerow(["" if v is None else v for v in r])
        w(f"golden rows written to _ro_golden.csv: {len(rows)} rows, {len(cols)} cols")
        w("cols: " + " | ".join(cols))
        # also echo first 15 rows inline for quick view
        w("--- first 15 rows (inline preview) ---")
        for r in rows[:15]:
            w(" | ".join("" if v is None else str(v)[:60] for v in r))
    except Exception as e:
        w(f"GOLDEN ERROR: {str(e)[:600]}")

    cn.close()
    w("\nDONE CONTRACT")
    OUT.close()


if __name__ == "__main__":
    main()

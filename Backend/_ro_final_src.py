"""
READ-ONLY installer-discovery capture (sources 1-5,7,8) via linked servers.
SELECT / catalog / OBJECT_DEFINITION / OPENQUERY(SELECT) only. No writes.
Trigger bodies pulled in 4000-char chunks (avoids nvarchar(max) truncation over OLE DB).
Outputs: _ro_final_src_out.txt, _ro_vendor_schema.csv, _ro_vendor_triggers.txt
"""
import struct, csv, pyodbc
from datetime import datetime

SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
BASE = r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend"
OUT = open(BASE + r"\_ro_final_src_out.txt", "w", encoding="utf-8")
TRIG = open(BASE + r"\_ro_vendor_triggers.txt", "w", encoding="utf-8")
SERVERS = ["FAKIEH_SERVER1", "FAKIEH_SERVER2"]
TARGET_TBLS = "('Batch','BatchChanges','ParValueOnline','Order','OrderCategory')"


def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d.%03d%+03d:%02d" % (
        t[0], t[1], t[2], t[3], t[4], t[5], t[6] // 10000, t[7], t[8])


def w(s=""):
    OUT.write(str(s) + "\n")


def oq(ls, inner):
    return "SELECT * FROM OPENQUERY([%s], '%s')" % (ls, inner.replace("'", "''"))


def run(cur, label, sql, cap=500, cw=300):
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
        w(f"ERROR: {str(e)[:500]}")


def fetch(cur, sql):
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    return cols, cur.fetchall()


def main():
    cn = pyodbc.connect(CONN, autocommit=True)
    cn.timeout = 200
    cn.add_output_converter(-155, dto)
    cur = cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"FINAL SRC CAPTURE @ local {datetime.now().isoformat()} (READ-ONLY)")

    # ===== 1) SOURCE INSTANCE IDENTITY =====
    for ls in SERVERS:
        run(cur, f"1.{ls}.version", oq(ls, "SELECT @@VERSION v"))
        run(cur, f"1.{ls}.props", oq(ls,
            "SELECT CAST(SERVERPROPERTY('Edition') AS varchar(120)) edition, "
            "CAST(SERVERPROPERTY('Collation') AS varchar(120)) collation, "
            "CAST(SERVERPROPERTY('ProductMajorVersion') AS varchar(20)) major, "
            "CAST(SERVERPROPERTY('ProductVersion') AS varchar(40)) product_version, "
            "CONVERT(varchar(40),SYSDATETIMEOFFSET()) now_offset"))

    # ===== 2) VENDOR DB DISCOVERY =====
    for ls in SERVERS:
        run(cur, f"2.{ls}.databases", oq(ls, "SELECT name FROM sys.databases ORDER BY database_id"))
        run(cur, f"2.{ls}.simatic_schemas", oq(ls, "SELECT DISTINCT TABLE_SCHEMA FROM SimaticBatch.INFORMATION_SCHEMA.TABLES ORDER BY TABLE_SCHEMA"))
        run(cur, f"2.{ls}.version_tables", oq(ls, "SELECT TABLE_SCHEMA, TABLE_NAME FROM SimaticBatch.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%ersion%' OR TABLE_NAME LIKE '%DBInfo%' OR TABLE_NAME LIKE '%Product%' ORDER BY TABLE_NAME"))
        run(cur, f"2.{ls}.db_extended_properties", oq(ls, "SELECT CAST(name AS varchar(120)) name, CAST(value AS varchar(300)) value FROM SimaticBatch.sys.extended_properties WHERE class=0"))
        for vt in ("SIMATIC_BATCH.Version", "SIMATIC_BATCH.DBVersion", "SIMATIC_BATCH.DBInfo"):
            run(cur, f"2.{ls}.try {vt}", oq(ls, f"SELECT TOP 3 * FROM SimaticBatch.{vt}"), cap=3, cw=120)

    # ===== 3) VENDOR SCHEMA FINGERPRINT -> CSV =====
    schema_rows = []
    for ls in SERVERS:
        try:
            cols, rows = fetch(cur, oq(ls,
                "SELECT t.name tbl, c.column_id, c.name col, ty.name type, c.max_length, c.is_nullable "
                "FROM SimaticBatch.sys.columns c "
                "JOIN SimaticBatch.sys.tables t ON t.object_id=c.object_id "
                "JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
                "JOIN SimaticBatch.sys.types ty ON ty.user_type_id=c.user_type_id "
                f"WHERE s.name='SIMATIC_BATCH' AND t.name IN {TARGET_TBLS} "
                "ORDER BY t.name, c.column_id"))
            for r in rows:
                schema_rows.append([ls, "SimaticBatch"] + [("" if v is None else v) for v in r])
            w(f"\n===== 3.{ls}.vendor_schema -> {len(rows)} cols captured to _ro_vendor_schema.csv =====")
        except Exception as e:
            w(f"\n===== 3.{ls}.vendor_schema ERROR: {str(e)[:300]} =====")
        run(cur, f"3.{ls}.KEY_TYPES", oq(ls,
            "SELECT t.name tbl, c.name col, ty.name type, c.max_length, c.is_nullable "
            "FROM SimaticBatch.sys.columns c JOIN SimaticBatch.sys.tables t ON t.object_id=c.object_id "
            "JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id JOIN SimaticBatch.sys.types ty ON ty.user_type_id=c.user_type_id "
            "WHERE s.name='SIMATIC_BATCH' AND ("
            "(t.name='ParValueOnline' AND c.name IN ('sp_prot','Name','TimeStamp')) OR "
            "(t.name='Batch' AND c.name IN ('BatchTransferTime','ActStart','ActEnd'))) ORDER BY t.name,c.name"))
        run(cur, f"3.{ls}.BATCH_COL_PRESENCE", oq(ls,
            "SELECT c.name FROM SimaticBatch.sys.columns c JOIN SimaticBatch.sys.tables t ON t.object_id=c.object_id "
            "JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
            "WHERE s.name='SIMATIC_BATCH' AND t.name='Batch' AND c.name IN "
            "('FormulaName','MRecipeName','FormulaGUID','MRecipeGUID','Description','PlanEnd','UOMId','PCellGUID','CreationDateTime') ORDER BY c.name"))
    if schema_rows:
        with open(BASE + r"\_ro_vendor_schema.csv", "w", newline="", encoding="utf-8") as f:
            wr = csv.writer(f)
            wr.writerow(["linked_server", "db", "table", "column_id", "column", "type", "max_length", "is_nullable"])
            wr.writerows(schema_rows)

    # ===== 4) DEPLOYED CAPTURE TRIGGERS (verbatim) =====
    for ls in SERVERS:
        run(cur, f"4.{ls}.capture_trigger_summary", oq(ls,
            "SELECT t.name parent, tr.name trig, tr.is_disabled, tr.is_instead_of_trigger, "
            "m.execute_as_principal_id exec_as, DATALENGTH(m.definition)/2 def_chars "
            "FROM SimaticBatch.sys.triggers tr JOIN SimaticBatch.sys.tables t ON t.object_id=tr.parent_id "
            "JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
            "JOIN SimaticBatch.sys.sql_modules m ON m.object_id=tr.object_id "
            f"WHERE s.name='SIMATIC_BATCH' AND t.name IN {TARGET_TBLS} ORDER BY t.name,tr.name"))
        run(cur, f"4.{ls}.ALL_vendor_triggers", oq(ls,
            "SELECT t.name parent, tr.name trig, tr.is_disabled FROM SimaticBatch.sys.triggers tr "
            "JOIN SimaticBatch.sys.tables t ON t.object_id=tr.parent_id JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
            "WHERE s.name='SIMATIC_BATCH' ORDER BY t.name,tr.name"), cap=200)
        # chunked full definitions
        TRIG.write(f"\n\n################## {ls} — SIMATIC_BATCH capture-trigger definitions ##################\n")
        try:
            _, rows = fetch(cur, oq(ls,
                "SELECT tr.name trig, v.seq seq, CAST(SUBSTRING(m.definition, v.seq*4000+1, 4000) AS nvarchar(4000)) chunk "
                "FROM SimaticBatch.sys.triggers tr "
                "JOIN SimaticBatch.sys.tables t ON t.object_id=tr.parent_id "
                "JOIN SimaticBatch.sys.schemas s ON s.schema_id=t.schema_id "
                "JOIN SimaticBatch.sys.sql_modules m ON m.object_id=tr.object_id "
                "CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12),(13),(14),(15),(16),(17),(18),(19)) v(seq) "
                f"WHERE s.name='SIMATIC_BATCH' AND t.name IN {TARGET_TBLS} "
                "AND v.seq*4000 < DATALENGTH(m.definition)/2 ORDER BY tr.name, v.seq"))
            parts = {}
            order = []
            for trig, seq, chunk in rows:
                if trig not in parts:
                    parts[trig] = []
                    order.append(trig)
                parts[trig].append((seq, chunk or ""))
            for trig in order:
                body = "".join(c for _, c in sorted(parts[trig], key=lambda x: x[0]))
                TRIG.write(f"\n----- TRIGGER: {trig}  ({len(body)} chars) -----\n")
                TRIG.write(body + "\n")
            w(f"\n===== 4.{ls}.trigger_defs -> {len(order)} triggers written to _ro_vendor_triggers.txt =====")
        except Exception as e:
            w(f"\n===== 4.{ls}.trigger_defs ERROR: {str(e)[:400]} =====")

    # ===== 5) SOURCE STAGING LAYER (source-side ASMBatchReports) =====
    for ls in SERVERS:
        run(cur, f"5.{ls}.BatchCopy.stats", oq(ls,
            "SELECT COUNT_BIG(*) rows_, CONVERT(varchar(40),MIN(BatchTransferTime),121) min_btt, "
            "CONVERT(varchar(40),MAX(BatchTransferTime),121) max_btt FROM ASMBatchReports.dbo.BatchCopy"))
        run(cur, f"5.{ls}.ParValueOnline_copy.stats", oq(ls,
            "SELECT COUNT_BIG(*) rows_, CONVERT(varchar(40),MIN([TimeStamp]),121) min_ts, "
            "CONVERT(varchar(40),MAX([TimeStamp]),121) max_ts FROM ASMBatchReports.dbo.ParValueOnline_copy"))
        run(cur, f"5.{ls}.OrderDetails.rowcount", oq(ls, "SELECT COUNT_BIG(*) rows_ FROM ASMBatchReports.dbo.OrderDetails"))
        run(cur, f"5.{ls}.BatchCopy.SourceServer_distinct", oq(ls,
            "SELECT DISTINCT TOP 3 CAST(SourceServer AS varchar(60)) SourceServer, COUNT_BIG(*) rows_ "
            "FROM ASMBatchReports.dbo.BatchCopy GROUP BY SourceServer"))
        run(cur, f"5.{ls}.PVcopy.size", oq(ls,
            "SELECT SUM(CASE WHEN index_id IN (0,1) THEN row_count ELSE 0 END) rows_, "
            "SUM(reserved_page_count)*8/1024 reserved_mb, SUM(used_page_count)*8/1024 used_mb "
            "FROM ASMBatchReports.sys.dm_db_partition_stats WHERE object_id=OBJECT_ID('ASMBatchReports.dbo.ParValueOnline_copy')"))
        # schema + indexes of staging tables
        run(cur, f"5.{ls}.staging_indexes", oq(ls,
            "SELECT t.name tbl, i.name idx, i.is_unique, i.type_desc FROM ASMBatchReports.sys.indexes i "
            "JOIN ASMBatchReports.sys.tables t ON t.object_id=i.object_id "
            "WHERE t.name IN ('BatchCopy','ParValueOnline_copy','OrderDetails') AND i.type>0 ORDER BY t.name,i.index_id"), cap=60)
        try:
            cols, rows = fetch(cur, oq(ls,
                "SELECT t.name tbl, c.column_id, c.name col, ty.name type, c.max_length, c.is_nullable "
                "FROM ASMBatchReports.sys.columns c JOIN ASMBatchReports.sys.tables t ON t.object_id=c.object_id "
                "JOIN ASMBatchReports.sys.types ty ON ty.user_type_id=c.user_type_id "
                "WHERE t.name IN ('BatchCopy','ParValueOnline_copy','OrderDetails') ORDER BY t.name,c.column_id"))
            for r in rows:
                schema_rows.append([ls, "ASMBatchReports"] + [("" if v is None else v) for v in r])
            # append to CSV
            with open(BASE + r"\_ro_vendor_schema.csv", "a", newline="", encoding="utf-8") as f:
                wr = csv.writer(f)
                for r in rows:
                    wr.writerow([ls, "ASMBatchReports"] + [("" if v is None else v) for v in r])
            w(f"\n===== 5.{ls}.staging_schema -> {len(rows)} cols appended to _ro_vendor_schema.csv =====")
        except Exception as e:
            w(f"\n===== 5.{ls}.staging_schema ERROR: {str(e)[:300]} =====")
        # source-side Agent jobs
        run(cur, f"5.{ls}.agent_jobs", oq(ls, "SELECT CAST(j.name AS varchar(90)) job, j.enabled FROM msdb.dbo.sysjobs j ORDER BY j.name"), cap=60)
        run(cur, f"5.{ls}.agent_steps", oq(ls,
            "SELECT CAST(j.name AS varchar(60)) job, s.step_id, CAST(s.step_name AS varchar(60)) step, s.subsystem, "
            "CAST(s.command AS varchar(400)) command FROM msdb.dbo.sysjobsteps s JOIN msdb.dbo.sysjobs j ON j.job_id=s.job_id ORDER BY j.name,s.step_id"), cap=60, cw=400)
        run(cur, f"5.{ls}.agent_schedules", oq(ls,
            "SELECT CAST(j.name AS varchar(60)) job, CAST(sch.name AS varchar(60)) sched, sch.enabled, sch.freq_type, sch.freq_subday_interval mins "
            "FROM msdb.dbo.sysjobschedules js JOIN msdb.dbo.sysjobs j ON j.job_id=js.job_id JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id ORDER BY j.name"), cap=60)

    # ===== 7) SERVER1 STALL DIAGNOSIS =====
    run(cur, "7.FAKIEH_SERVER1.VENDOR_Batch_max", oq("FAKIEH_SERVER1",
        "SELECT CONVERT(varchar(40),MAX(BatchTransferTime),121) max_btt, CONVERT(varchar(40),MAX(ActStart),121) max_actstart, COUNT_BIG(*) rows_ FROM SimaticBatch.SIMATIC_BATCH.Batch"))
    run(cur, "7.FAKIEH_SERVER1.BatchCopy_max", oq("FAKIEH_SERVER1",
        "SELECT CONVERT(varchar(40),MAX(BatchTransferTime),121) max_btt, CONVERT(varchar(40),MAX(ActStart),121) max_actstart, COUNT_BIG(*) rows_ FROM ASMBatchReports.dbo.BatchCopy"))
    run(cur, "7.FAKIEH_SERVER1.vendor_recent_5", oq("FAKIEH_SERVER1",
        "SELECT TOP 5 CONVERT(varchar(40),BatchTransferTime,121) btt, CONVERT(varchar(40),ActStart,121) act FROM SimaticBatch.SIMATIC_BATCH.Batch ORDER BY BatchTransferTime DESC"))

    # ===== 8) AUTH MODEL =====
    run(cur, "8.linked_login_mapping", """
        SELECT s.name, ll.uses_self_credential, ll.local_principal_id,
               CASE WHEN ll.uses_self_credential=1 THEN 'self-mapping (login current security context)'
                    WHEN ll.remote_name IS NOT NULL THEN 'fixed remote SQL login'
                    ELSE 'current security context / not mapped' END AS mapping_type
        FROM sys.servers s JOIN sys.linked_logins ll ON ll.server_id=s.server_id
        WHERE s.is_linked=1 ORDER BY s.name""")
    for ls in SERVERS:
        run(cur, f"8.{ls}.remote_is_sysadmin", oq(ls, "SELECT IS_SRVROLEMEMBER('sysadmin') is_sysadmin, CAST(SYSTEM_USER AS varchar(10)) trunc_dummy"))
    run(cur, "8.agent_service_account", "SELECT servicename, service_account, startup_type_desc, status_desc FROM sys.dm_server_services")
    run(cur, "8.job_owner_sysadmin", """
        SELECT CAST(j.name AS varchar(80)) job,
               IS_SRVROLEMEMBER('sysadmin', SUSER_SNAME(j.owner_sid)) owner_is_sysadmin
        FROM msdb.dbo.sysjobs j WHERE j.name LIKE '%RetrieveAndStore%' OR j.name LIKE '%Collect%'""")

    cn.close()
    TRIG.close()
    w("\nDONE FINAL SRC")
    OUT.close()


if __name__ == "__main__":
    main()

"""READ-ONLY pre-execution readiness check for Package A. No writes whatsoever."""
import pyodbc
SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")

def main():
    cn = pyodbc.connect(CONN, autocommit=True); cn.timeout = 60
    cur = cn.cursor(); cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")

    cur.execute("SELECT @@SERVERNAME, DB_NAME(), SUSER_SNAME(), IS_SRVROLEMEMBER('sysadmin')")
    s, db, lg, sa = cur.fetchone()
    print(f"IDENTITY      : server={s} db={db} login={lg} sysadmin={sa}")

    # Jobs: enabled + currently running?
    cur.execute("""SELECT j.name, j.enabled,
        CASE WHEN EXISTS(SELECT 1 FROM msdb.dbo.sysjobactivity a
              WHERE a.job_id=j.job_id AND a.start_execution_date IS NOT NULL
                AND a.stop_execution_date IS NULL
                AND a.session_id=(SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity))
             THEN 1 ELSE 0 END AS running
        FROM msdb.dbo.sysjobs j
        WHERE j.name LIKE 'Collect Server1%' OR j.name LIKE 'Collect Server2%' ORDER BY j.name""")
    print("JOBS          :")
    for nm, en, rn in cur.fetchall():
        print(f"   - {nm!r:45} enabled={en} running={rn}")

    # Live proc bodies still match the expected BAD patterns?
    checks = {
        "usp_Upsert_BatchCopy_FromPV": [("UPDATE uses raw S.BatchROOTGUID (bad)", "= S.BatchROOTGUID"),
                                        ("already-fixed marker", "ISNULL(S.BatchROOTGUID, S.BatchOGUID)")],
        "usp_Merge_BatchMaterials_FromLocal": [("header filter FormulaCategoryName IS NOT NULL (bad)", "FormulaCategoryName IS NOT NULL"),
                                               ("header filter <> 'Auto from PV' (bad)", "<> 'Auto from PV'")],
        "usp_StagePV_FromServer2": [("reads FAKIEH_SERVER1 (bad)", "[FAKIEH_SERVER1].SimaticBatch.SIMATIC_BATCH.ParValueOnline"),
                                    ("tags 'Server1' (bad)", "'Server1' AS SourceServer"),
                                    ("reads FAKIEH_SERVER2 (fixed)", "[FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.ParValueOnline")],
    }
    print("LIVE PROC BODIES:")
    for proc, pats in checks.items():
        cur.execute("SELECT OBJECT_DEFINITION(OBJECT_ID(?))", f"dbo.{proc}")
        body = cur.fetchone()[0] or ""
        print(f"   {proc}:")
        for label, sub in pats:
            print(f"      [{'YES' if sub in body else 'no '}] {label}")

    # Current state: missing-26 + dups
    cur.execute("""DECLARE @R datetime2(0)='2026-06-17T00:00:00';
        ;WITH P AS (SELECT pv.ROOTGUID,pv.SourceServer,MAX(pv.[TimeStamp]) last_pv,
              SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
            FROM dbo.ParValueOnline_copy pv WITH(NOLOCK) WHERE pv.[TimeStamp]>=@R AND pv.ROOTGUID IS NOT NULL
            GROUP BY pv.ROOTGUID,pv.SourceServer)
        SELECT COUNT(*) FROM P WHERE P.qual>0 AND P.last_pv<DATEADD(MINUTE,-120,SYSDATETIME())
          AND NOT EXISTS(SELECT 1 FROM dbo.BatchMaterials bm WITH(NOLOCK)
              WHERE bm.[Batch GUID]=P.ROOTGUID AND (P.SourceServer IS NULL OR bm.[Source Server]=P.SourceServer))""")
    missing = cur.fetchone()[0]
    cur.execute("""SELECT COUNT(*) FROM (SELECT 1 x FROM dbo.BatchMaterials WITH(NOLOCK)
        GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],sp_prot HAVING COUNT(*)>1) z""")
    dups = cur.fetchone()[0]
    print(f"CURRENT STATE : missing_qualifying_batches={missing}  duplicate_groups={dups}")

    # Disk + DB size for backup sizing
    cur.execute("""SELECT CAST(SUM(size)*8/1024 AS int) FROM sys.master_files WHERE database_id=DB_ID('ASMBatchReports')""")
    dbmb = cur.fetchone()[0]
    cur.execute("""SELECT TOP 1 CAST(available_bytes/1073741824.0 AS decimal(10,1))
        FROM sys.master_files mf CROSS APPLY sys.dm_os_volume_stats(mf.database_id,mf.file_id)
        WHERE mf.database_id=DB_ID('ASMBatchReports')""")
    freegb = cur.fetchone()[0]
    print(f"BACKUP SIZING : ASMBatchReports~{dbmb}MB  C:free~{freegb}GB")
    cn.close()
    print("READY (read-only check complete; nothing was modified).")

if __name__ == "__main__":
    main()

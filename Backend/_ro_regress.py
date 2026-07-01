"""READ-ONLY regression diagnostic (data missing again after the hotfix).
SELECT / catalog / OBJECT_DEFINITION / msdb / OPENQUERY(SELECT) only. No writes.
Writes _ro_regress_out.txt and _ro_regress_bodies.txt."""
import struct, pyodbc
from datetime import datetime
SRV = r"DESKTOP-N8PGI9S\FAKIEH_REPORTING"
CONN = (f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SRV};DATABASE=ASMBatchReports;"
        "Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_regress_out.txt","w",encoding="utf-8")
BODY = open(r"C:\Users\Hercu\OneDrive\Desktop\main_code\fakieh_27aug\fakieh_27aug\Backend\_ro_regress_bodies.txt","w",encoding="utf-8")

def dto(raw):
    t = struct.unpack("<6hI2h", raw)
    return "%04d-%02d-%02d %02d:%02d:%02d%+03d:%02d" % (t[0],t[1],t[2],t[3],t[4],t[5],t[7],t[8])
def w(s=""): OUT.write(str(s)+"\n")
def run(cur,label,sql,cap=300,cw=120):
    w(f"\n===== {label} =====")
    try:
        cur.execute(sql)
        while True:
            if cur.description:
                cols=[d[0] for d in cur.description]; w(" | ".join(cols))
                rows=cur.fetchall()
                for r in rows[:cap]:
                    w(" | ".join("" if v is None else str(v)[:cw] for v in r))
                w(f"({len(rows)} rows)")
            else: w("(no resultset)")
            if not cur.nextset(): break
    except Exception as e: w(f"ERROR: {str(e)[:400]}")

def main():
    cn=pyodbc.connect(CONN,autocommit=True); cn.timeout=120
    cn.add_output_converter(-155,dto); cur=cn.cursor()
    cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
    w(f"REGRESSION DIAGNOSTIC @ {datetime.now().isoformat()} (READ-ONLY)")
    run(cur,"identity","SELECT @@SERVERNAME s, DB_NAME() db, SUSER_SNAME() lg, IS_SRVROLEMEMBER('sysadmin') sa, CONVERT(varchar(40),SYSDATETIMEOFFSET()) now")

    # ---- PHASE 0 ----
    run(cur,"0.1 objects changed last 21d","""SELECT o.name,o.type_desc,CONVERT(varchar(19),o.create_date,120) cre,CONVERT(varchar(19),o.modify_date,120) mod
        FROM sys.objects o WHERE o.type IN('P','V','TR','FN','IF','TF') AND o.modify_date>=DATEADD(DAY,-21,SYSDATETIME()) ORDER BY o.modify_date DESC""",cap=100)
    run(cur,"0.2 recent/backup/capture tables","""SELECT s.name sch,t.name tbl,CONVERT(varchar(19),t.create_date,120) cre,CONVERT(varchar(19),t.modify_date,120) mod,SUM(p.rows) rows_
        FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN(0,1)
        WHERE t.create_date>=DATEADD(DAY,-30,SYSDATETIME()) OR t.name LIKE '%Backup%' OR t.name LIKE '%Capture%' OR t.name LIKE '%BeforeCleanup%' OR t.name LIKE '%Phase1%' OR t.name LIKE '%Hotfix%'
        GROUP BY s.name,t.name,t.create_date,t.modify_date ORDER BY t.create_date DESC,t.name""",cap=60)

    # 0.3 dump bodies of the 6 pipeline procs (+ patterns)
    procs=['usp_Collect_From_Server1','usp_Collect_From_Server2','usp_StagePV_FromServer1','usp_StagePV_FromServer2','usp_Upsert_BatchCopy_FromPV','usp_Merge_BatchMaterials_FromLocal']
    bodies={}
    for p in procs:
        cur.execute("SELECT o.modify_date, OBJECT_DEFINITION(o.object_id) FROM sys.objects o WHERE o.name=?",p)
        row=cur.fetchone()
        bodies[p]=(row[0] if row else None, (row[1] if row else None) or "")
        BODY.write(f"\n\n################## {p}  (modify_date={bodies[p][0]}) ##################\n")
        BODY.write(bodies[p][1])
    def execbody(b):  # executable part only (after first 'SET NOCOUNT ON', skips leading comment)
        i=b.find("SET NOCOUNT ON"); return b[i:] if i>=0 else b
    ups=bodies['usp_Upsert_BatchCopy_FromPV'][1]; mrg=bodies['usp_Merge_BatchMaterials_FromLocal'][1]
    st1=bodies['usp_StagePV_FromServer1'][1]; st2=bodies['usp_StagePV_FromServer2'][1]
    q = chr(39)
    autopv_pat = "<> " + q + "Auto from PV" + q
    s1_tag = q + "Server1" + q + " AS SourceServer"
    s2_tag = q + "Server2" + q + " AS SourceServer"
    srv1_pv = "[FAKIEH_SERVER1].SimaticBatch.SIMATIC_BATCH.ParValueOnline"
    srv2_pv = "[FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.ParValueOnline"
    f_ins = "PRESENT" if "ISNULL(S.BatchROOTGUID, S.BatchOGUID)" in ups else "ABSENT"
    f_upd = "PRESENT" if "ISNULL(S.BatchROOTGUID, T.ROOTGUID)" in ups else "ABSENT"
    m_cat = "STILL THERE" if "FormulaCategoryName IS NOT NULL" in execbody(mrg) else "removed"
    m_pv  = "STILL THERE" if autopv_pat in execbody(mrg) else "removed"
    s2_r2 = srv2_pv in execbody(st2); s2_r1 = srv1_pv in execbody(st2)
    s2_t2 = s2_tag in execbody(st2); s2_t1 = s1_tag in execbody(st2)
    w("\n===== 0.4 HOTFIX present? (actual current bodies) =====")
    w(f"upsert modify_date={bodies['usp_Upsert_BatchCopy_FromPV'][0]}  INSERT-fallback={f_ins}  UPDATE-fallback={f_upd}")
    w(f"merge  modify_date={bodies['usp_Merge_BatchMaterials_FromLocal'][0]}  category_filter={m_cat}  autopv_filter={m_pv}")
    w(f"stage1 modify_date={bodies['usp_StagePV_FromServer1'][0]}  reads_SERVER1={srv1_pv in st1}  tags_Server1={s1_tag in st1}")
    w(f"stage2 modify_date={bodies['usp_StagePV_FromServer2'][0]}  EXEC reads_SERVER2={s2_r2} reads_SERVER1={s2_r1}  tags_Server2={s2_t2} tags_Server1={s2_t1}")

    run(cur,"0.5a jobs","SELECT CAST(j.name AS varchar(40)) job,j.enabled,SUSER_SNAME(j.owner_sid) owner FROM msdb.dbo.sysjobs j WHERE j.name LIKE '%Collect%' OR j.name LIKE '%Batch%' ORDER BY j.name")
    run(cur,"0.5b schedules","""SELECT CAST(j.name AS varchar(40)) job,sch.name sched,sch.enabled sched_en,sch.freq_subday_interval mins
        FROM msdb.dbo.sysjobschedules js JOIN msdb.dbo.sysjobs j ON j.job_id=js.job_id JOIN msdb.dbo.sysschedules sch ON sch.schedule_id=js.schedule_id
        WHERE j.name LIKE '%Collect%' ORDER BY j.name""")
    run(cur,"0.5c running now","SELECT CAST(j.name AS varchar(40)) job,ja.start_execution_date FROM msdb.dbo.sysjobactivity ja JOIN msdb.dbo.sysjobs j ON j.job_id=ja.job_id WHERE ja.start_execution_date IS NOT NULL AND ja.stop_execution_date IS NULL")
    run(cur,"0.5d last 40 outcomes","""SELECT TOP 40 CAST(j.name AS varchar(34)) job,h.step_id,h.run_date,RIGHT('000000'+CAST(h.run_time AS varchar(6)),6) rtime,h.run_status,LEFT(h.message,90) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id WHERE (j.name LIKE '%Collect%') AND h.step_id IN(0,1) ORDER BY h.instance_id DESC""",cap=40,cw=90)
    run(cur,"0.5e failures only (step>0)","""SELECT TOP 20 CAST(j.name AS varchar(34)) job,h.run_date,RIGHT('000000'+CAST(h.run_time AS varchar(6)),6) rtime,LEFT(h.message,300) msg
        FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id WHERE j.name LIKE '%Collect%' AND h.run_status=0 AND h.step_id>0 ORDER BY h.instance_id DESC""",cap=20,cw=300)
    run(cur,"0.6 watermarks","SELECT [Source Server],CONVERT(varchar(30),LastTimeStamp,121) LastTimeStamp FROM dbo.DataSyncTracker WITH(NOLOCK) ORDER BY 1")

    # ---- PHASE 1 ----
    run(cur,"1.1 STAGING freshness per server","""SELECT pv.SourceServer,COUNT(*) pv_rows,
        CONVERT(varchar(30),MIN(pv.[TimeStamp]),121) min_ts,CONVERT(varchar(30),MAX(pv.[TimeStamp]),121) max_ts,
        DATEDIFF(MINUTE,MAX(pv.[TimeStamp]),SYSDATETIME()) staging_lag_min
        FROM dbo.ParValueOnline_copy pv WITH(NOLOCK) GROUP BY pv.SourceServer ORDER BY pv.SourceServer""")
    run(cur,"1.2 REPORT freshness per server","""SELECT bm.[Source Server],COUNT(*) material_rows,COUNT(DISTINCT bm.[Batch GUID]) batches,
        CONVERT(varchar(19),MAX(bm.[Batch Act Start]),120) max_act_start,
        DATEDIFF(MINUTE,MAX(bm.[Batch Act Start]),SYSDATETIME()) report_lag_min
        FROM dbo.BatchMaterials bm WITH(NOLOCK) GROUP BY bm.[Source Server] ORDER BY bm.[Source Server]""")
    run(cur,"1.3 per-day captured-qualifying vs reported (30d)","""DECLARE @W datetime2(0)=DATEADD(DAY,-30,SYSDATETIME()); DECLARE @A int=120;
        ;WITH cap AS(SELECT CAST(q.first_ts AS date) d,COUNT(*) captured_qual FROM(
           SELECT ROOTGUID,MIN([TimeStamp]) first_ts,MAX([TimeStamp]) last_ts,
                  SUM(CASE WHEN av_float>0 AND sp_float>0 AND sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual
           FROM dbo.ParValueOnline_copy WITH(NOLOCK) WHERE [TimeStamp]>=@W AND ROOTGUID IS NOT NULL GROUP BY ROOTGUID) q
           WHERE q.qual>0 AND q.last_ts<DATEADD(MINUTE,-@A,SYSDATETIME()) GROUP BY CAST(q.first_ts AS date)),
        rep AS(SELECT CAST([Batch Act Start] AS date) d,COUNT(DISTINCT [Batch GUID]) reported FROM dbo.BatchMaterials WITH(NOLOCK)
           WHERE [Batch Act Start]>=@W AND [Batch GUID] IS NOT NULL GROUP BY CAST([Batch Act Start] AS date))
        SELECT CONVERT(varchar(10),COALESCE(cap.d,rep.d),120) d,ISNULL(cap.captured_qual,0) captured_qual,ISNULL(rep.reported,0) reported,
               ISNULL(cap.captured_qual,0)-ISNULL(rep.reported,0) gap
        FROM cap FULL OUTER JOIN rep ON rep.d=cap.d ORDER BY d""",cap=60)
    run(cur,"1.5 missing categorized A/B/C per server (30d)","""DECLARE @W datetime2(0)=DATEADD(DAY,-30,SYSDATETIME()); DECLARE @A int=120;
        ;WITH q AS(SELECT pv.ROOTGUID,pv.SourceServer,MAX(pv.[TimeStamp]) last_ts,
            SUM(CASE WHEN av_float>0 AND sp_float>0 AND sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual_rows
          FROM dbo.ParValueOnline_copy pv WITH(NOLOCK) WHERE pv.[TimeStamp]>=@W AND pv.ROOTGUID IS NOT NULL GROUP BY pv.ROOTGUID,pv.SourceServer)
        SELECT q.SourceServer,
          SUM(CASE WHEN q.qual_rows=0 THEN 1 ELSE 0 END) cat_B_no_qual,
          SUM(CASE WHEN q.qual_rows>0 AND NOT EXISTS(SELECT 1 FROM dbo.BatchCopy bc WITH(NOLOCK) WHERE bc.OGUID=q.ROOTGUID) THEN 1 ELSE 0 END) cat_A_no_batchcopy,
          SUM(CASE WHEN q.qual_rows>0 AND EXISTS(SELECT 1 FROM dbo.BatchCopy bc WITH(NOLOCK) WHERE bc.OGUID=q.ROOTGUID)
                    AND NOT EXISTS(SELECT 1 FROM dbo.BatchMaterials bm WITH(NOLOCK) WHERE bm.[Batch GUID]=q.ROOTGUID) THEN 1 ELSE 0 END) cat_C_merge
        FROM q WHERE q.last_ts<DATEADD(MINUTE,-@A,SYSDATETIME()) GROUP BY q.SourceServer ORDER BY q.SourceServer""")
    run(cur,"1.4 missing batch detail (top 40 newest)","""DECLARE @W datetime2(0)=DATEADD(DAY,-30,SYSDATETIME()); DECLARE @A int=120;
        ;WITH q AS(SELECT pv.ROOTGUID,pv.SourceServer,MIN(pv.[TimeStamp]) first_ts,MAX(pv.[TimeStamp]) last_ts,COUNT(*) pv_rows,
            SUM(CASE WHEN av_float>0 AND sp_float>0 AND sp_matname IS NOT NULL THEN 1 ELSE 0 END) qual_rows
          FROM dbo.ParValueOnline_copy pv WITH(NOLOCK) WHERE pv.[TimeStamp]>=@W AND pv.ROOTGUID IS NOT NULL GROUP BY pv.ROOTGUID,pv.SourceServer)
        SELECT TOP 40 CAST(q.ROOTGUID AS varchar(40)) rootguid,q.SourceServer,CONVERT(varchar(19),q.first_ts,120) first_ts,CONVERT(varchar(19),q.last_ts,120) last_ts,q.pv_rows,q.qual_rows,
          CASE WHEN q.qual_rows=0 THEN 'B_no_qual' WHEN NOT EXISTS(SELECT 1 FROM dbo.BatchCopy bc WITH(NOLOCK) WHERE bc.OGUID=q.ROOTGUID) THEN 'A_no_batchcopy' ELSE 'C_merge' END category
        FROM q WHERE q.qual_rows>0 AND q.last_ts<DATEADD(MINUTE,-@A,SYSDATETIME())
          AND NOT EXISTS(SELECT 1 FROM dbo.BatchMaterials bm WITH(NOLOCK) WHERE bm.[Batch GUID]=q.ROOTGUID AND (q.SourceServer IS NULL OR bm.[Source Server]=q.SourceServer))
        ORDER BY q.last_ts DESC""",cap=40)
    run(cur,"1.6 dups now","SELECT COUNT(*) dup_groups FROM (SELECT 1 x FROM dbo.BatchMaterials WITH(NOLOCK) GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],sp_prot HAVING COUNT(*)>1) z")
    run(cur,"1.7 totals (deletion check)","SELECT 'BatchMaterials' t,COUNT(*) rows_,COUNT(DISTINCT [Batch GUID]) batches FROM dbo.BatchMaterials WITH(NOLOCK) UNION ALL SELECT 'BatchCopy',COUNT(*),COUNT(DISTINCT OGUID) FROM dbo.BatchCopy WITH(NOLOCK) UNION ALL SELECT 'PV_copy',COUNT(*),COUNT(DISTINCT ROOTGUID) FROM dbo.ParValueOnline_copy WITH(NOLOCK)")
    run(cur,"1.1b BatchCopy freshness per server","""SELECT SourceServer,COUNT(*) rows_,COUNT(DISTINCT OGUID) batches,
        SUM(CASE WHEN ISNULL([Name],'')='Auto from PV' THEN 1 ELSE 0 END) autopv,SUM(CASE WHEN FormulaCategoryName IS NULL THEN 1 ELSE 0 END) null_fcat,
        CONVERT(varchar(19),MAX(ActStart),120) max_actstart,CONVERT(varchar(19),MAX(BatchTransferTime),120) max_xfer
        FROM dbo.BatchCopy WITH(NOLOCK) GROUP BY SourceServer ORDER BY SourceServer""")

    # ---- PHASE 4 (upstream SIMATIC live state) ----
    run(cur,"4.1 linked servers","SELECT s.name,s.data_source,s.is_data_access_enabled,s.is_rpc_out_enabled FROM sys.servers s WHERE s.is_linked=1 ORDER BY s.name")
    for ls in ("FAKIEH_SERVER1","FAKIEH_SERVER2","OS1_SQL"):
        run(cur,f"4.2 {ls} live SIMATIC ParValueOnline",
            f"SELECT * FROM OPENQUERY([{ls}],'SELECT @@SERVERNAME s, COUNT(*) pv_rows, COUNT(DISTINCT ROOTGUID) d_root, CONVERT(varchar(30),MAX([TimeStamp]),121) max_ts FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline')")
        run(cur,f"4.2b {ls} live SIMATIC Batch",
            f"SELECT * FROM OPENQUERY([{ls}],'SELECT COUNT(*) batch_rows, CONVERT(varchar(30),MAX(Created),121) max_created, CONVERT(varchar(30),MAX(BatchTransferTime),121) max_xfer FROM SimaticBatch.SIMATIC_BATCH.Batch')")

    cn.close(); w("\nDONE"); OUT.close(); BODY.close()

if __name__=="__main__":
    main()

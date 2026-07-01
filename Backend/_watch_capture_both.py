import pyodbc, time
CONN=("DRIVER={ODBC Driver 17 for SQL Server};SERVER=DESKTOP-N8PGI9S\FAKIEH_REPORTING;"
      "DATABASE=ASMBatchReports;Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT=open("_watch_capture_both_out.txt","w",encoding="utf-8")
def w(s): OUT.write(s+"\n"); OUT.flush()
def one(cur,ls):
    def q(inner): cur.execute(f"SELECT * FROM OPENQUERY([{ls}],'{inner}')"); return cur.fetchall()[0]
    bc=q("SELECT COUNT(*) r,SUM(CASE WHEN ActStart IS NOT NULL THEN 1 ELSE 0 END) a1,SUM(CASE WHEN ActEnd IS NOT NULL THEN 1 ELSE 0 END) a2,SUM(CASE WHEN BatchTransferTime IS NOT NULL THEN 1 ELSE 0 END) x FROM ASMBatchReports.dbo.BatchCopy")
    pv=q("SELECT COUNT(*) r, CONVERT(varchar(30),MAX([TimeStamp]),121) m FROM ASMBatchReports.dbo.ParValueOnline_copy")
    od=q("SELECT COUNT(*) r FROM ASMBatchReports.dbo.OrderDetails")
    livepv=q("SELECT COUNT(*) r, CONVERT(varchar(30),MAX([TimeStamp]),121) m FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline")
    return dict(bc_rows=bc[0],act_start=bc[1] or 0,act_end=bc[2] or 0,xfer=bc[3] or 0,
                pvc_rows=pv[0],pvc_max=pv[1],od_rows=od[0],live_pv_rows=livepv[0],live_pv_max=livepv[1])
w("COMBINED OS1+OS2 CAPTURE MONITOR start (gates C+D)")
done=False
for i in range(24):  # ~3.2h, 8-min polls
    line=f"[poll {i}]"
    try:
        cn=pyodbc.connect(CONN,autocommit=True); cur=cn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
        for srv,ls in (("OS1","OS1_SQL"),("OS2","FAKIEH_SERVER2")):
            d=one(cur,ls)
            line+=(f" | {srv}: BC={d['bc_rows']}(aS{d['act_start']}/aE{d['act_end']}/x{d['xfer']}) "
                   f"PVc={d['pvc_rows']}(max {d['pvc_max']}) OD={d['od_rows']} livePV={d['live_pv_rows']}(max {d['live_pv_max']})")
            # success: a completed batch fully captured + PV copy flowing
            if d['bc_rows'] and d['act_start'] and d['act_end'] and d['xfer'] and d['pvc_rows']>0:
                w(line); w(f"SUCCESS [{srv}]: completed batch captured (BatchCopy ActStart+ActEnd+BatchTransferTime; PVcopy={d['pvc_rows']}; OrderDetails={d['od_rows']}).")
                done=True
            # divergence flag: live PV advancing but copy not (possible silent capture failure)
            if d['live_pv_max'] and d['pvc_max'] and d['live_pv_max']>d['pvc_max'] and d['pvc_rows']==0 and d['live_pv_rows']>0:
                line+=f"  <<WATCH {srv}: live PV present but PVcopy still 0>>"
        cn.close()
        w(line)
        if done: break
    except Exception as e:
        w(line+f"  ERROR {str(e)[:150]}")
    time.sleep(480)
w("COMBINED MONITOR end")
OUT.close()

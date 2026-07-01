import pyodbc, time
CONN=("DRIVER={ODBC Driver 17 for SQL Server};SERVER=DESKTOP-N8PGI9S\FAKIEH_REPORTING;"
      "DATABASE=ASMBatchReports;Trusted_Connection=yes;TrustServerCertificate=yes;Connection Timeout=10;")
OUT=open("_watch_os1_capture_out.txt","w",encoding="utf-8")
def w(s):
    OUT.write(s+"\n"); OUT.flush()
def q1(cur,ls,inner):
    cur.execute(f"SELECT * FROM OPENQUERY([{ls}],'{inner}')"); return cur.fetchall()[0]
w("OS1 CAPTURE MONITOR start (gate C)")
for i in range(24):  # ~3.2h max, 8-min polls
    try:
        cn=pyodbc.connect(CONN,autocommit=True); cur=cn.cursor()
        cur.execute("SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED")
        bc=q1(cur,"OS1_SQL","SELECT COUNT(*) r, SUM(CASE WHEN ActStart IS NOT NULL THEN 1 ELSE 0 END) a1, SUM(CASE WHEN ActEnd IS NOT NULL THEN 1 ELSE 0 END) a2, SUM(CASE WHEN BatchTransferTime IS NOT NULL THEN 1 ELSE 0 END) x FROM ASMBatchReports.dbo.BatchCopy")
        pv=q1(cur,"OS1_SQL","SELECT COUNT(*) r, COUNT(DISTINCT ROOTGUID) g FROM ASMBatchReports.dbo.ParValueOnline_copy")
        od=q1(cur,"OS1_SQL","SELECT COUNT(*) r FROM ASMBatchReports.dbo.OrderDetails")
        live=q1(cur,"OS1_SQL","SELECT CONVERT(varchar(30),MAX([TimeStamp]),121) FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline")
        err=q1(cur,"OS1_SQL","SELECT COUNT(*) FROM ASMBatchReports.dbo.CaptureErrorLog") if False else None
        cn.close()
        w(f"[poll {i}] BatchCopy rows={bc[0]} actStart={bc[1]} actEnd={bc[2]} xfer={bc[3]} | PVcopy rows={pv[0]} roots={pv[1]} | OrderDetails={od[0]} | live_PV_max_ts={live[0]}")
        if bc[0] and bc[1] and bc[2] and bc[3] and pv[0]>0:
            w(f"SUCCESS: completed batch captured (BatchCopy has ActStart+ActEnd+BatchTransferTime; PVcopy filling). OrderDetails rows={od[0]}.")
            break
    except Exception as e:
        w(f"[poll {i}] ERROR {str(e)[:160]}")
    time.sleep(480)
w("OS1 CAPTURE MONITOR end")
OUT.close()

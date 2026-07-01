#!/bin/bash
# Watch the next TWO Collect-job cycles after the hotfix; confirm success + invariants.
SRV='DESKTOP-N8PGI9S\FAKIEH_REPORTING'
OUT="/c/Users/Hercu/OneDrive/Desktop/main_code/fakieh_27aug/fakieh_27aug/Backend/_watch_cycles_out.txt"
q() { sqlcmd -h -1 -W -s "|" -S "$SRV" -d ASMBatchReports -E -Q "$1" 2>&1 | grep -vE "rows affected|^$"; }

echo "WATCH START $(date '+%Y-%m-%d %H:%M:%S')" > "$OUT"
baseline=$(q "SET NOCOUNT ON; SELECT ISNULL(MAX(h.run_date*1000000 + h.run_time),0) FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id WHERE j.name LIKE 'Collect Server1%' AND h.step_id=0;" | tr -d ' ')
echo "baseline_key=$baseline" >> "$OUT"
seen=0
INV="SET NOCOUNT ON; DECLARE @R datetime2(0)='2026-06-17T00:00:00';
DECLARE @miss int=(SELECT COUNT(*) FROM (SELECT pv.ROOTGUID,pv.SourceServer,MAX(pv.[TimeStamp]) lp,
  SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) qq
  FROM dbo.ParValueOnline_copy pv WITH(NOLOCK) WHERE pv.[TimeStamp]>=@R AND pv.ROOTGUID IS NOT NULL
  GROUP BY pv.ROOTGUID,pv.SourceServer) p WHERE p.qq>0 AND p.lp<DATEADD(MINUTE,-120,SYSDATETIME())
  AND NOT EXISTS(SELECT 1 FROM dbo.BatchMaterials bm WITH(NOLOCK) WHERE bm.[Batch GUID]=p.ROOTGUID
    AND (p.SourceServer IS NULL OR bm.[Source Server]=p.SourceServer)));
DECLARE @dup int=(SELECT COUNT(*) FROM (SELECT 1 x FROM dbo.BatchMaterials WITH(NOLOCK)
  GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],sp_prot HAVING COUNT(*)>1) z);
SELECT CONCAT('missing=',@miss,' dups=',@dup);"
for i in $(seq 1 16); do
  sleep 70
  row=$(q "SET NOCOUNT ON; SELECT TOP 1 CAST(h.run_date*1000000+h.run_time AS bigint), h.run_status, LEFT(h.message,45) FROM msdb.dbo.sysjobhistory h JOIN msdb.dbo.sysjobs j ON j.job_id=h.job_id WHERE j.name LIKE 'Collect Server1%' AND h.step_id=0 ORDER BY h.run_date DESC, h.run_time DESC;")
  key=$(echo "$row" | awk -F'|' '{print $1}' | tr -d ' ')
  inv=$(q "$INV")
  echo "[$(date '+%H:%M:%S')] S1_latest=$row | $inv" >> "$OUT"
  if [[ "$key" =~ ^[0-9]+$ ]] && [ "$key" -gt "$baseline" ]; then
    seen=$((seen+1)); baseline=$key
    echo "   -> NEW CYCLE #$seen (key=$key, run_status (1=success)=$(echo "$row"|awk -F'|' '{print $2}'|tr -d ' '))" >> "$OUT"
    if [ "$seen" -ge 2 ]; then echo "TWO CYCLES OBSERVED — DONE $(date '+%H:%M:%S')" >> "$OUT"; break; fi
  fi
done
echo "WATCH END $(date '+%Y-%m-%d %H:%M:%S')" >> "$OUT"

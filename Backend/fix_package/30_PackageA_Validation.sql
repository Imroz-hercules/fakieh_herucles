/*==============================================================================
  30_PackageA_Validation.sql
  Server : DESKTOP-N8PGI9S\FAKIEH_REPORTING   DB: ASMBatchReports   (SQL 2022)
  Purpose: READ-ONLY validation of the hotfix + backfill. No writes.
  Pass criteria:
    [1] missing completed qualifying batches = 0
    [2] duplicate material groups = 0
    [3] proc bodies contain the corrected patterns
    [4] usp_StagePV_FromServer2 reads FAKIEH_SERVER2 and tags 'Server2'
    [5] watermarks sensible
    [6] no recent collect-job failures
==============================================================================*/
SET NOCOUNT ON;
USE ASMBatchReports;
GO

DECLARE @ReworkStart datetime2(0) = '2026-06-17T00:00:00';
DECLARE @AgeMin int = 120;

/*-- [1] Missing completed qualifying batches (expect 0) ----------------------*/
;WITH PvBatch AS
(
    SELECT pv.ROOTGUID, pv.SourceServer, MAX(pv.[TimeStamp]) AS last_pv,
           SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) AS qual
    FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
    WHERE pv.[TimeStamp] >= @ReworkStart AND pv.ROOTGUID IS NOT NULL
    GROUP BY pv.ROOTGUID, pv.SourceServer
)
SELECT 'MISSING_BATCHES' AS check_name, COUNT(*) AS value,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM   PvBatch p
WHERE  p.qual > 0
  AND  p.last_pv < DATEADD(MINUTE, -@AgeMin, SYSDATETIME())
  AND  NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WITH (NOLOCK)
                   WHERE bm.[Batch GUID] = p.ROOTGUID
                     AND (p.SourceServer IS NULL OR bm.[Source Server] = p.SourceServer));

/*-- [2] Duplicate material groups (expect 0) ---------------------------------*/
SELECT 'DUPLICATE_GROUPS' AS check_name, COUNT(*) AS value,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM (
    SELECT 1 AS x
    FROM dbo.BatchMaterials WITH (NOLOCK)
    GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],sp_prot
    HAVING COUNT(*) > 1
) z;

/*-- [3]/[4] Corrected patterns present in proc bodies (CHARINDEX = literal) ---*/
SELECT o.name AS proc_name,
       CASE
         WHEN o.name = 'usp_Upsert_BatchCopy_FromPV' THEN
              CASE WHEN CHARINDEX('ISNULL(S.BatchROOTGUID, S.BatchOGUID)', m.definition) > 0
                    AND CHARINDEX('ISNULL(S.BatchROOTGUID, T.ROOTGUID)',   m.definition) > 0
                   THEN 'PASS' ELSE 'FAIL' END
         WHEN o.name = 'usp_Merge_BatchMaterials_FromLocal' THEN
              CASE WHEN CHARINDEX('FormulaCategoryName IS NOT NULL', m.definition) = 0
                    AND CHARINDEX('<> ''Auto from PV''',             m.definition) = 0
                    AND CHARINDEX('ROW_NUMBER()',                    m.definition) > 0
                    AND CHARINDEX('sp_matname IS NOT NULL',          m.definition) > 0
                   THEN 'PASS' ELSE 'FAIL' END
         WHEN o.name = 'usp_StagePV_FromServer2' THEN
              CASE WHEN CHARINDEX('[FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.ParValueOnline', m.definition) > 0
                    AND CHARINDEX('''Server2'' AS SourceServer',                                m.definition) > 0
                    AND CHARINDEX('[FAKIEH_SERVER1].SimaticBatch.SIMATIC_BATCH.ParValueOnline',  m.definition) = 0
                   THEN 'PASS' ELSE 'FAIL' END
       END AS pattern_status
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('usp_Upsert_BatchCopy_FromPV','usp_Merge_BatchMaterials_FromLocal','usp_StagePV_FromServer2');

/*-- [5] Watermarks -----------------------------------------------------------*/
SELECT 'WATERMARKS' AS check_name, [Source Server],
       CONVERT(varchar(30), LastTimeStamp, 126) AS LastTimeStamp
FROM dbo.DataSyncTracker ORDER BY [Source Server];

/*-- [6] Recent collect-job failures (expect none) ----------------------------*/
SELECT 'JOB_FAILURES' AS check_name, COUNT(*) AS failures_last_3d,
       CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'REVIEW' END AS status
FROM msdb.dbo.sysjobhistory h
JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id
WHERE (j.name LIKE N'Collect Server1%' OR j.name LIKE N'Collect Server2%')
  AND h.run_status = 0 AND h.step_id > 0
  AND h.run_date >= CONVERT(int, CONVERT(char(8), DATEADD(DAY,-3,GETDATE()), 112));

/*-- Per-source rollup (informational) ----------------------------------------*/
SELECT [Source Server], COUNT(*) AS rows_, COUNT(DISTINCT [Batch GUID]) AS batches,
       CONVERT(varchar(19), MAX([Batch Act Start]), 126) AS max_start
FROM dbo.BatchMaterials WITH (NOLOCK)
GROUP BY [Source Server] ORDER BY [Source Server];
GO

/*==============================================================================
  50_PackageB_Shadow_Validation.sql
  Server : DESKTOP-N8PGI9S\FAKIEH_REPORTING   DB: ASMBatchReports   (SQL 2022)
  Purpose: Validate the durable path WITHOUT touching the live report. Builds
           dbo.BatchMaterials_Shadow from the DURABLE OS copies and compares it
           to live dbo.BatchMaterials. No production proc/job is changed here.
  Run AFTER Section 1-4 of 40_… are deployed and the capture jobs have run for a
  while during real OS1 and OS2 production.
  Pass criteria:
    - shadow missing qualifying batches = 0
    - shadow duplicate material groups = 0
    - OS1 + OS2 durable copies are receiving rows (fresh CaptureUpdatedUtc)
    - capture error logs empty
    - capture job runtime acceptable
==============================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE ASMBatchReports;
GO

DECLARE @RunShadow bit = 0;        -- <<< set 1 to (re)build the shadow table
IF @RunShadow = 1
BEGIN
    IF OBJECT_ID('dbo.BatchMaterials_Shadow','U') IS NULL
        SELECT TOP (0) * INTO dbo.BatchMaterials_Shadow FROM dbo.BatchMaterials;
    TRUNCATE TABLE dbo.BatchMaterials_Shadow;

    ;WITH durable AS
    (
        SELECT 'Server1' AS SourceServer, bc.OGUID, bc.ROOTGUID, bc.OrderId, bc.[Name],
               bc.ProductName, bc.FormulaCategoryName, bc.BatchTransferTime, bc.Quantity,
               pv.sp_matname, pv.sp_matcode, pv.sp_prot, pv.sp_float, pv.av_float, pv.[TimeStamp]
        FROM [OS1_SQL].HerculesCapture.dbo.BatchCopy bc
        JOIN [OS1_SQL].HerculesCapture.dbo.ParValueOnline_copy pv ON pv.ROOTGUID = bc.OGUID
        WHERE pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL
        UNION ALL
        SELECT 'Server2', bc.OGUID, bc.ROOTGUID, bc.OrderId, bc.[Name],
               bc.ProductName, bc.FormulaCategoryName, bc.BatchTransferTime, bc.Quantity,
               pv.sp_matname, pv.sp_matcode, pv.sp_prot, pv.sp_float, pv.av_float, pv.[TimeStamp]
        FROM [FAKIEH_SERVER2].HerculesCapture.dbo.BatchCopy bc
        JOIN [FAKIEH_SERVER2].HerculesCapture.dbo.ParValueOnline_copy pv ON pv.ROOTGUID = bc.OGUID
        WHERE pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL
    ),
    ranked AS
    (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY SourceServer, OGUID, sp_matcode, sp_matname, sp_prot
                                     ORDER BY [TimeStamp] DESC) rn,
               MIN([TimeStamp]) OVER (PARTITION BY SourceServer, OGUID) act_start,
               MAX([TimeStamp]) OVER (PARTITION BY SourceServer, OGUID) act_end
        FROM durable
    )
    INSERT dbo.BatchMaterials_Shadow
        ([Source Server],[Batch GUID],ROOTGUID,OrderId,[Batch Name],[Product Name],
         [Batch Act Start],[Batch Act End],[Batch Transfer Time],Quantity,
         [Material Name],[Material Code],sp_prot,[SetPoint Float],[Actual Value Float],FormulaCategoryName)
    SELECT SourceServer, OGUID, ISNULL(ROOTGUID,OGUID), OrderId,
           ISNULL([Name],N'Auto from PV'), ProductName,
           CONVERT(datetime,act_start), CONVERT(datetime,act_end), CONVERT(datetime,act_end),
           Quantity, sp_matname, sp_matcode, sp_prot, sp_float, av_float, FormulaCategoryName
    FROM ranked WHERE rn = 1;

    PRINT 'Shadow table rebuilt.';
END

/*-- Compare shadow vs live ---------------------------------------------------*/
SELECT 'SHADOW_VS_LIVE_BY_SOURCE' AS check_name, s.[Source Server],
       s.shadow_rows, l.live_rows, s.shadow_batches, l.live_batches
FROM (SELECT [Source Server], COUNT(*) shadow_rows, COUNT(DISTINCT [Batch GUID]) shadow_batches
      FROM dbo.BatchMaterials_Shadow GROUP BY [Source Server]) s
FULL JOIN (SELECT [Source Server], COUNT(*) live_rows, COUNT(DISTINCT [Batch GUID]) live_batches
      FROM dbo.BatchMaterials GROUP BY [Source Server]) l ON l.[Source Server]=s.[Source Server];

SELECT 'SHADOW_DUP_GROUPS' AS check_name, COUNT(*) AS value,
       CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END AS status
FROM (SELECT 1 x FROM dbo.BatchMaterials_Shadow
      GROUP BY [Source Server],[Batch GUID],[Material Name],[Material Code],sp_prot HAVING COUNT(*)>1) z;

/*-- Durable copies freshness + capture health (per OS server) ----------------*/
SELECT 'OS1_CAPTURE' AS src,
       (SELECT COUNT(*) FROM [OS1_SQL].HerculesCapture.dbo.BatchCopy)            AS batchcopy_rows,
       (SELECT COUNT(*) FROM [OS1_SQL].HerculesCapture.dbo.ParValueOnline_copy)  AS pv_rows,
       (SELECT CONVERT(varchar(30),MAX(CaptureUpdatedUtc),126) FROM [OS1_SQL].HerculesCapture.dbo.ParValueOnline_copy) AS pv_last_capture_utc,
       (SELECT COUNT(*) FROM [OS1_SQL].HerculesCapture.dbo.CaptureErrorLog)      AS capture_errors;
SELECT 'OS2_CAPTURE' AS src,
       (SELECT COUNT(*) FROM [FAKIEH_SERVER2].HerculesCapture.dbo.BatchCopy)           AS batchcopy_rows,
       (SELECT COUNT(*) FROM [FAKIEH_SERVER2].HerculesCapture.dbo.ParValueOnline_copy) AS pv_rows,
       (SELECT CONVERT(varchar(30),MAX(CaptureUpdatedUtc),126) FROM [FAKIEH_SERVER2].HerculesCapture.dbo.ParValueOnline_copy) AS pv_last_capture_utc,
       (SELECT COUNT(*) FROM [FAKIEH_SERVER2].HerculesCapture.dbo.CaptureErrorLog)     AS capture_errors;

PRINT 'Review: shadow batches should be >= live, dup groups = 0, capture_errors = 0,';
PRINT 'and pv_last_capture_utc should be within ~1-2 minutes of now during production.';
PRINT 'Only after this passes: perform Final Cutover (disable old Collect jobs, enable durable collectors).';
GO

/*============================================================================
  FINAL CUTOVER (run only after shadow PASSES) — kept here for reference.
  DO NOT run until shadow validation passes.
  -- 1) Disable (do NOT delete) old collectors. Resolve by LIKE (no exact arrow/em-dash names):
  --    DECLARE @j uniqueidentifier;
  --    SELECT @j=job_id FROM msdb.dbo.sysjobs WHERE name LIKE N'Collect Server1%'; EXEC msdb.dbo.sp_update_job @job_id=@j,@enabled=0;
  --    SELECT @j=job_id FROM msdb.dbo.sysjobs WHERE name LIKE N'Collect Server2%'; EXEC msdb.dbo.sp_update_job @job_id=@j,@enabled=0;
  -- 2) Repoint collectors to durable procs (or create new durable collector jobs):
  --    ALTER PROCEDURE dbo.usp_Collect_From_Server1 AS BEGIN SET NOCOUNT ON;
  --      EXEC dbo.usp_StagePV_FromServer1_Durable; EXEC dbo.usp_Upsert_BatchCopy_FromDurable;
  --      EXEC dbo.usp_Merge_BatchMaterials_FromLocal; END
  --    ALTER PROCEDURE dbo.usp_Collect_From_Server2 AS BEGIN SET NOCOUNT ON;
  --      EXEC dbo.usp_StagePV_FromServer2_Durable; EXEC dbo.usp_Upsert_BatchCopy_FromDurable;
  --      EXEC dbo.usp_Merge_BatchMaterials_FromLocal; END
  -- 3) Re-enable the (now durable) collectors.
============================================================================*/

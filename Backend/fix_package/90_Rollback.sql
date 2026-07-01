/*==============================================================================
  90_Rollback.sql
  Server : DESKTOP-N8PGI9S\FAKIEH_REPORTING   DB: ASMBatchReports   (SQL 2022)
  Purpose: Revert Package A (and, if cut over, Package B) safely.
  Default behavior: restore the 3 proc bodies to their pre-fix state and restore
  job enabled-states. RECOVERED DATA IS KEPT unless operator explicitly opts in.
==============================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE ASMBatchReports;
GO

/*============================================================================
  OPTION A (RECOMMENDED) — restore proc bodies from the preflight backup table.
  Set @BackupBatchId to the id printed by 00_Preflight.sql (defaults to latest).
============================================================================*/
DECLARE @RestoreProcs bit = 1;                         -- <<< 1 = restore proc bodies
DECLARE @BackupBatchId uniqueidentifier =
        (SELECT TOP (1) BackupBatchId FROM dbo._FixBackup_ProcBodies ORDER BY CapturedUtc DESC);

IF @RestoreProcs = 1 AND @BackupBatchId IS NOT NULL
BEGIN
    DECLARE @nm sysname, @def nvarchar(max), @alter nvarchar(max);
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT ObjectName, Definition FROM dbo._FixBackup_ProcBodies
        WHERE BackupBatchId = @BackupBatchId
          AND ObjectName IN (N'usp_Upsert_BatchCopy_FromPV',
                             N'usp_Merge_BatchMaterials_FromLocal',
                             N'usp_StagePV_FromServer2');
    OPEN c; FETCH NEXT FROM c INTO @nm, @def;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        BEGIN TRY
            -- definitions start with 'CREATE ...'; turn the leading CREATE into ALTER
            SET @alter = STUFF(@def, 1, 6, N'ALTER');
            EXEC sys.sp_executesql @alter;
            PRINT CONCAT('Restored ', @nm, ' from backup ', CONVERT(varchar(40),@BackupBatchId));
        END TRY
        BEGIN CATCH
            PRINT CONCAT('FAILED to restore ', @nm, ': ', ERROR_MESSAGE(),
                         ' -- use OPTION B explicit ALTER below.');
        END CATCH
        FETCH NEXT FROM c INTO @nm, @def;
    END
    CLOSE c; DEALLOCATE c;
END
ELSE IF @RestoreProcs = 1
    PRINT 'No backup batch found — use OPTION B explicit ALTER statements below.';
GO

/*============================================================================
  OPTION B (FALLBACK) — explicit ALTER with the ORIGINAL pre-fix bodies,
  captured during investigation. Run these ONLY if Option A could not restore.
  (Each is the exact production body before the hotfix.)
============================================================================*/
/*  -- Uncomment to use.

ALTER PROCEDURE [dbo].[usp_Upsert_BatchCopy_FromPV] AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @LastSync DATETIME, @MaxTimeStamp DATETIME;
  SELECT @LastSync=LastTimeStamp FROM dbo.DataSyncTracker WHERE [Source Server]='BatchCopy';
  ;WITH agg AS (
    SELECT ROOTGUID, MAX(SourceServer) SourceServer, MIN([TimeStamp]) ActStart, MAX([TimeStamp]) ActEnd,
           MAX([TimeStamp]) BatchTransferTime
    FROM dbo.ParValueOnline_copy WHERE @LastSync IS NULL OR [TimeStamp] > @LastSync GROUP BY ROOTGUID),
  BatchSource AS (
    SELECT OGUID,ROOTGUID,ROOTOBJID,ROOTOTID,OBJID,OTID,Created,OrderId,ProductName,Quantity,FormulaName,
           FormulaCategoryName,BatchTransferTime,'Server1' SourceServer FROM [FAKIEH_SERVER1].SimaticBatch.SIMATIC_BATCH.Batch
    UNION ALL
    SELECT OGUID,ROOTGUID,ROOTOBJID,ROOTOTID,OBJID,OTID,Created,OrderId,ProductName,Quantity,FormulaName,
           FormulaCategoryName,BatchTransferTime,'Server2' SourceServer FROM [FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.Batch),
  src AS (
    SELECT ISNULL(b.OGUID,a.ROOTGUID) BatchOGUID, a.ROOTGUID, ISNULL(b.SourceServer,a.SourceServer) SourceServer,
           a.ActStart,a.ActEnd, COALESCE(b.BatchTransferTime,a.BatchTransferTime) BatchTransferTime,
           b.ROOTGUID BatchROOTGUID,b.ROOTOBJID,b.ROOTOTID,b.OBJID,b.OTID,b.Created,b.OrderId,
           COALESCE(b.FormulaName,b.ProductName,N'Auto from PV') [Name],b.ProductName,b.Quantity,b.FormulaCategoryName
    FROM agg a LEFT JOIN BatchSource b ON b.OGUID=a.ROOTGUID)
  MERGE dbo.BatchCopy AS T USING src AS S ON T.OGUID=S.BatchOGUID
  WHEN NOT MATCHED THEN INSERT (OGUID,ROOTGUID,ROOTOBJID,ROOTOTID,OBJID,OTID,Created,OrderId,[Name],ProductName,
        ActStart,ActEnd,BatchTransferTime,Quantity,FormulaCategoryName,SourceServer)
    VALUES (S.BatchOGUID,S.BatchROOTGUID,ISNULL(S.ROOTOBJID,0),ISNULL(S.ROOTOTID,0),ISNULL(S.OBJID,0),ISNULL(S.OTID,0),
        ISNULL(S.Created,SYSDATETIMEOFFSET()),ISNULL(S.OrderId,0),S.[Name],S.ProductName,S.ActStart,S.ActEnd,
        S.BatchTransferTime,ISNULL(S.Quantity,0),S.FormulaCategoryName,S.SourceServer)
  WHEN MATCHED THEN UPDATE SET T.ROOTGUID=S.BatchROOTGUID,T.ROOTOBJID=ISNULL(S.ROOTOBJID,T.ROOTOBJID),
        T.ROOTOTID=ISNULL(S.ROOTOTID,T.ROOTOTID),T.OBJID=ISNULL(S.OBJID,T.OBJID),T.OTID=ISNULL(S.OTID,T.OTID),
        T.Created=ISNULL(S.Created,T.Created),T.OrderId=ISNULL(S.OrderId,T.OrderId),T.[Name]=ISNULL(S.[Name],T.[Name]),
        T.ProductName=ISNULL(S.ProductName,T.ProductName),T.Quantity=ISNULL(S.Quantity,T.Quantity),
        T.FormulaCategoryName=ISNULL(S.FormulaCategoryName,T.FormulaCategoryName),
        T.ActStart=S.ActStart,T.ActEnd=S.ActEnd,T.BatchTransferTime=S.BatchTransferTime,T.SourceServer=S.SourceServer;
  SELECT @MaxTimeStamp=MAX([TimeStamp]) FROM dbo.ParValueOnline_copy;
  IF @MaxTimeStamp IS NOT NULL MERGE dbo.DataSyncTracker AS T USING (SELECT 'BatchCopy' Src,@MaxTimeStamp LastTimeStamp) S
    ON T.[Source Server]=S.Src WHEN MATCHED THEN UPDATE SET LastTimeStamp=S.LastTimeStamp
    WHEN NOT MATCHED THEN INSERT([Source Server],LastTimeStamp) VALUES(S.Src,S.LastTimeStamp);
END
GO
-- (Original usp_Merge_BatchMaterials_FromLocal: re-add the two WHERE lines
--   AND bc.FormulaCategoryName IS NOT NULL
--   AND ISNULL(bc.[Name],'') <> 'Auto from PV'  )
-- (Original usp_StagePV_FromServer2: FROM [FAKIEH_SERVER1]... and 'Server1' AS SourceServer)
-- Prefer OPTION A — the backup table holds these verbatim.
*/
GO

/*============================================================================
  JOB STATE (#8) — restore SAVED enabled-states from dbo._FixBackup_JobState
  (written by 00_Preflight). Restores by job_id from the latest backup batch —
  does NOT blindly enable both jobs.
============================================================================*/
DECLARE @RestoreJobs bit = 1;
IF @RestoreJobs = 1 AND OBJECT_ID('dbo._FixBackup_JobState','U') IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo._FixBackup_JobState)
BEGIN
    DECLARE @jb uniqueidentifier =
        (SELECT TOP (1) BackupBatchId FROM dbo._FixBackup_JobState ORDER BY CapturedUtc DESC);
    DECLARE @jid uniqueidentifier, @jnm sysname, @jen tinyint;
    DECLARE jc CURSOR LOCAL FAST_FORWARD FOR
        SELECT job_id, job_name, enabled FROM dbo._FixBackup_JobState WHERE BackupBatchId = @jb;
    OPEN jc; FETCH NEXT FROM jc INTO @jid, @jnm, @jen;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE job_id = @jid)
        BEGIN
            EXEC msdb.dbo.sp_update_job @job_id = @jid, @enabled = @jen;
            PRINT CONCAT('Restored job "', @jnm, '" enabled = ', @jen);
        END
        ELSE PRINT CONCAT('Saved job "', @jnm, '" no longer exists — skipped.');
        FETCH NEXT FROM jc INTO @jid, @jnm, @jen;
    END
    CLOSE jc; DEALLOCATE jc;
END
ELSE IF @RestoreJobs = 1
    PRINT 'No _FixBackup_JobState rows found — run 00_Preflight.sql first; job states NOT changed.';

-- If Package B durable/capture jobs were created, disable them here by LIKE, e.g.:
--   EXEC msdb.dbo.sp_update_job @job_name=N'Collect Server1 Durable', @enabled=0;   -- reporting
--   EXEC msdb.dbo.sp_update_job @job_name=N'HerculesCapture - Snapshot (1 min)', @enabled=0;  -- run on each OS server
GO

/*============================================================================
  DATA ROLLBACK — OFF BY DEFAULT. Only if operator explicitly requests removing
  the 26 backfilled batches. Deletes only 'Auto from PV' rows for those GUIDs.
============================================================================*/
DECLARE @DeleteRecoveredRows bit = 0;     -- <<< keep 0 unless operator explicitly requests deletion
IF @DeleteRecoveredRows = 1
BEGIN
    DECLARE @g TABLE (id uniqueidentifier PRIMARY KEY);
    INSERT @g (id) VALUES
     ('E9B1C8C4-B797-42DA-8B87-00E29BE19E77'),('C9EA50A4-77DE-496C-8B61-BB4CA00D920E'),
     ('825D1A9E-186E-4A7A-993C-88CF8D431E1C'),('0C27FCC7-11D6-4E49-950F-DE29E2A96475'),
     ('61EE3DC3-DC48-4D5D-9204-ACAD3C37F8E4'),('230E2754-7562-4F51-8DC5-A744F2820E03'),
     ('3EA335E0-092E-449C-AA6B-234B85D79F85'),('11FFDE0E-E521-4C28-A06D-C5CDDBA7FBB8'),
     ('61C62215-C161-41E4-8A41-6DB0D1FDDC0E'),('169B7C35-6BC8-411C-BE5E-D2D657D2E593'),
     ('D327186B-6D08-4A14-BC54-A48AC3CC166E'),('721CFFEF-6654-428B-98BB-BE0219B558FC'),
     ('DA7EC133-825D-4F7B-836C-780D6614D0FB'),('DDDB4502-6BF0-491C-A48B-EF6CC2819CC6'),
     ('924C1176-37FA-4873-A7AD-16882C0FCD12'),('674691B9-1C4E-4A44-87D3-703F398D6EDA'),
     ('482BA306-230E-478B-9829-59A0BF398330'),('8A784E4D-B38B-4B59-9C93-FA961E715868'),
     ('6FA52756-8EEE-41C5-B3ED-644F855C1C29'),('FF3E6C59-AD25-4AEE-956B-24E7D67D2934'),
     ('DFD3060E-B22E-4761-99C1-949618F6FD8B'),('B7E12D85-3607-47F5-9991-1EDE92D4594A'),
     ('73069163-2006-4207-BB50-4EC4F16514A9'),('61A74053-64A3-422F-A5F7-39F843F770F6'),
     ('F238A5E1-14F9-4ED4-A30B-B2C894D98FF2'),('504BD727-893D-41B5-AC4C-9767D586CF28');

    BEGIN TRAN;
      DELETE bm FROM dbo.BatchMaterials bm JOIN @g g ON g.id = bm.[Batch GUID]
       WHERE ISNULL(bm.[Batch Name],'') = 'Auto from PV';
      PRINT CONCAT(@@ROWCOUNT, ' backfilled BatchMaterials rows deleted (review before COMMIT).');
      DELETE bc FROM dbo.BatchCopy bc JOIN @g g ON g.id = bc.OGUID
       WHERE ISNULL(bc.[Name],'') = 'Auto from PV';
      PRINT CONCAT(@@ROWCOUNT, ' backfilled BatchCopy rows deleted.');
    ROLLBACK;   -- <<< change to COMMIT only after reviewing the printed counts
    PRINT 'DATA ROLLBACK was a DRY-RUN (rolled back). Change ROLLBACK->COMMIT to apply.';
END
ELSE PRINT 'Data rollback skipped (recovered rows kept).';
GO

/*==============================================================================
  00_Preflight.sql   (REVISED)
  Server : DESKTOP-N8PGI9S\FAKIEH_REPORTING   DB: ASMBatchReports   (SQL 2022)
  Purpose: Safety gates + backups taken BEFORE any ALTER. Writes only backup tables.
  RULE   : Run ONLY after approval. Set @BackupConfirmed=1 after a real DB backup.
  Re-runnable: yes (backups are versioned by BackupBatchId).

  Revisions vs v1:
   #4 Hard-fail unless ALL 6 required proc bodies are captured AND non-null.
   #7 Job safety checks use LIKE 'Collect Server1%' / 'Collect Server2%' (no exact
      arrow/em-dash names); job_ids resolved + saved.
   #8 Current job enabled-states saved into dbo._FixBackup_JobState for rollback.
==============================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE ASMBatchReports;
GO

DECLARE @BackupConfirmed bit = 1;   -- <<< set to 1 ONLY after a fresh DB backup  [DONE: ...\Backup\ASMBatchReports_prehotfix_20260620.bak]
IF @BackupConfirmed <> 1
    THROW 50001, 'STOP: take a fresh ASMBatchReports backup, then set @BackupConfirmed = 1.', 1;

/*-- 1. Identity / privilege / database sanity --------------------------------*/
SELECT @@SERVERNAME AS server_name, DB_NAME() AS current_db, SUSER_SNAME() AS login_name,
       IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin, IS_MEMBER('db_owner') AS is_db_owner,
       CONVERT(varchar(40), SYSDATETIMEOFFSET()) AS now_local;

IF DB_NAME() <> N'ASMBatchReports'
    THROW 50002, 'STOP: not connected to ASMBatchReports.', 1;
IF (IS_SRVROLEMEMBER('sysadmin') = 0 AND IS_MEMBER('db_owner') = 0)
    THROW 50003, 'STOP: need sysadmin or db_owner to ALTER the pipeline procs.', 1;

/*-- 2. Confirm no Collect job is currently running (LIKE match, #7) ----------*/
IF OBJECT_ID('tempdb..#running') IS NOT NULL DROP TABLE #running;
SELECT j.name AS job_name, ja.start_execution_date
INTO   #running
FROM   msdb.dbo.sysjobactivity ja
JOIN   msdb.dbo.sysjobs        j ON j.job_id = ja.job_id
WHERE  ja.start_execution_date IS NOT NULL
  AND  ja.stop_execution_date  IS NULL
  AND  (j.name LIKE N'Collect Server1%' OR j.name LIKE N'Collect Server2%')
  AND  ja.session_id = (SELECT MAX(session_id) FROM msdb.dbo.sysjobactivity);

SELECT * FROM #running;
IF EXISTS (SELECT 1 FROM #running)
    THROW 50004, 'STOP: a Collect job is currently running. Wait for it to finish (or disable schedule) first.', 1;

/*-- One BackupBatchId for this preflight run --------------------------------*/
DECLARE @batch uniqueidentifier = NEWID();

/*-- 3. Backup CURRENT procedure bodies ---------------------------------------*/
IF OBJECT_ID('dbo._FixBackup_ProcBodies', 'U') IS NULL
    CREATE TABLE dbo._FixBackup_ProcBodies
    (
        BackupBatchId uniqueidentifier NOT NULL,
        CapturedUtc   datetime2(3)     NOT NULL CONSTRAINT DF__FixBkp_Utc DEFAULT (SYSUTCDATETIME()),
        SchemaName    sysname          NOT NULL,
        ObjectName    sysname          NOT NULL,
        ObjectType    varchar(20)      NOT NULL,
        Definition    nvarchar(max)    NULL,
        CONSTRAINT PK__FixBackup_ProcBodies PRIMARY KEY (BackupBatchId, ObjectName)
    );

INSERT dbo._FixBackup_ProcBodies (BackupBatchId, SchemaName, ObjectName, ObjectType, Definition)
SELECT @batch, OBJECT_SCHEMA_NAME(o.object_id), o.name, o.type_desc, m.definition
FROM   sys.sql_modules m
JOIN   sys.objects     o ON o.object_id = m.object_id
WHERE  o.name IN (N'usp_Upsert_BatchCopy_FromPV', N'usp_Merge_BatchMaterials_FromLocal',
                  N'usp_StagePV_FromServer2', N'usp_StagePV_FromServer1',
                  N'usp_Collect_From_Server1', N'usp_Collect_From_Server2');

/*-- 4. HARD-FAIL unless all 6 required bodies captured and NON-NULL (#4) -----*/
DECLARE @missing nvarchar(2000) =
(
    SELECT STRING_AGG(x.nm, N', ')
    FROM (VALUES (N'usp_Upsert_BatchCopy_FromPV'), (N'usp_Merge_BatchMaterials_FromLocal'),
                 (N'usp_StagePV_FromServer2'),     (N'usp_StagePV_FromServer1'),
                 (N'usp_Collect_From_Server1'),     (N'usp_Collect_From_Server2')) x(nm)
    WHERE NOT EXISTS (SELECT 1 FROM dbo._FixBackup_ProcBodies b
                      WHERE b.BackupBatchId = @batch AND b.ObjectName = x.nm AND b.Definition IS NOT NULL)
);
IF @missing IS NOT NULL
BEGIN
    DECLARE @msg nvarchar(2100) = N'STOP: required proc body missing or NULL (cannot guarantee rollback): ' + @missing;
    THROW 50005, @msg, 1;
END

SELECT ObjectName, LEN(Definition) AS def_len
FROM dbo._FixBackup_ProcBodies WHERE BackupBatchId = @batch ORDER BY ObjectName;

/*-- 5. Save current job enabled-states for rollback (#7, #8) -----------------*/
IF OBJECT_ID('dbo._FixBackup_JobState', 'U') IS NULL
    CREATE TABLE dbo._FixBackup_JobState
    (
        BackupBatchId uniqueidentifier NOT NULL,
        CapturedUtc   datetime2(3)     NOT NULL CONSTRAINT DF__FixBkp_Job DEFAULT (SYSUTCDATETIME()),
        job_id        uniqueidentifier NOT NULL,
        job_name      sysname          NOT NULL,
        enabled       tinyint          NOT NULL,
        CONSTRAINT PK__FixBackup_JobState PRIMARY KEY (BackupBatchId, job_id)
    );

INSERT dbo._FixBackup_JobState (BackupBatchId, job_id, job_name, enabled)
SELECT @batch, j.job_id, j.name, j.enabled
FROM   msdb.dbo.sysjobs j
WHERE  j.name LIKE N'Collect Server1%' OR j.name LIKE N'Collect Server2%';

SELECT job_name, enabled FROM dbo._FixBackup_JobState WHERE BackupBatchId = @batch ORDER BY job_name;

PRINT CONCAT('Preflight backups saved under BackupBatchId = ', CONVERT(varchar(40), @batch));
PRINT 'Record this BackupBatchId — 90_Rollback.sql restores proc bodies AND job states from it.';

/*-- 6. Capacity snapshot (informational) -------------------------------------*/
SELECT DISTINCT vs.volume_mount_point,
       CAST(vs.total_bytes/1073741824.0 AS decimal(10,1)) AS total_gb,
       CAST(vs.available_bytes/1073741824.0 AS decimal(10,1)) AS free_gb
FROM sys.master_files mf CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs;

PRINT 'PREFLIGHT OK — proceed to 10_PackageA_Hercules_Hotfix.sql';
GO

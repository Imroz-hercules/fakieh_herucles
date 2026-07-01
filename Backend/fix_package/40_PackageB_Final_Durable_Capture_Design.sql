/*==============================================================================
  40_PackageB_Final_Durable_Capture.sql   (REVISED — EXECUTABLE)
  Status: EXECUTABLE, syntax-valid, section-gated. Run SECTION BY SECTION on the
          indicated server (do NOT run the whole file at once). No invalid or
          commentary SQL is mixed in — the discouraged TRIGGER alternative is in
          41_PackageB_Trigger_Alternative_DESIGN.sql (design-only).

  GOAL: durable, idempotent, set-based source-side capture of live SIMATIC
        Batch + ParValueOnline on OS1 and OS2, then repoint reporting at the
        durable copies so purged headers no longer cause data loss.

  Revisions vs v1:
   #1 Capture procs are valid T-SQL (UPDATE + INSERT...WHERE NOT EXISTS — no
      invalid MERGE INSERT...SELECT).
   #2 PlanEnd removed (not proven needed; not consumed by reporting).
   #3 Section 1a HARD-ASSERTS every captured column exists with the expected base
      type on the LIVE source (OS1 and OS2) before any DDL — fails fast on drift.
      Durable column types are set to the proven live types.
   #9 Durable staging MERGE key = SourceServer + full ParValueOnline source PK
      (8 cols), not ROOTGUID+TimeStamp+Name.
   #10 Trigger alternative moved out; this file is production-ready DDL only.

  OPERATOR PREREQUISITES (explicit OT actions; NOT done by this script):
    * OS1 SQL Server Agent is STOPPED / Manual -> set Automatic + Start.
    * Verify OS2 SQL Server Agent is running (set Automatic + Start if not).
==============================================================================*/


/*############################################################################
  SECTION 0 — APPROVAL SPEED-BUMP (run alone first)
############################################################################*/
IF 1 = 1   -- <<< change to  IF 1 = 0  AFTER written approval, then run sections deliberately
    THROW 50040, 'Package B is gated. Get approval, then run each SECTION on the indicated server.', 1;
GO


/*============================================================================
  SECTION 1a — LIVE SCHEMA ASSERTION       << RUN ON OS1, THEN OS2 — RUN ALONE >>
  Validates the captured columns exist with the expected base type on the LIVE
  SIMATIC source. THROWS (and lists problems) on any drift. Read-only.
  Run this and confirm 'SCHEMA OK' BEFORE running Section 1b on the same server.
============================================================================*/
DECLARE @want TABLE (tbl sysname, col sysname, sys_type sysname);
INSERT @want (tbl,col,sys_type) VALUES
 -- Batch (durable BatchCopy capture set)
 ('Batch','ROOTGUID','uniqueidentifier'),('Batch','ROOTOBJID','int'),('Batch','ROOTOTID','int'),
 ('Batch','OGUID','uniqueidentifier'),('Batch','OBJID','int'),('Batch','OTID','int'),
 ('Batch','Created','datetimeoffset'),('Batch','OrderId','int'),('Batch','ProductName','nvarchar'),
 ('Batch','Quantity','float'),('Batch','FormulaName','nvarchar'),('Batch','FormulaCategoryName','nvarchar'),
 ('Batch','BatchTransferTime','datetimeoffset'),
 -- ParValueOnline (durable ParValueOnline_copy capture set)
 ('ParValueOnline','ROOTGUID','uniqueidentifier'),('ParValueOnline','POBJID','int'),('ParValueOnline','POTID','int'),
 ('ParValueOnline','P2OBJID','int'),('ParValueOnline','P2OTID','int'),('ParValueOnline','OBJID','int'),
 ('ParValueOnline','ActivationCounter','int'),('ParValueOnline','EventID','bigint'),
 ('ParValueOnline','TimeStamp','datetimeoffset'),('ParValueOnline','Name','nvarchar'),
 ('ParValueOnline','EventNotifyType','int'),('ParValueOnline','UsageId','int'),('ParValueOnline','DataTypeId','int'),
 ('ParValueOnline','DataTypeName','nvarchar'),('ParValueOnline','UoMId','int'),('ParValueOnline','UoMName','nvarchar'),
 ('ParValueOnline','HighValue','float'),('ParValueOnline','LowValue','float'),('ParValueOnline','RecHighValue','float'),
 ('ParValueOnline','RecLowValue','float'),('ParValueOnline','sp_float','float'),('ParValueOnline','av_float','float'),
 ('ParValueOnline','sp_matname','nvarchar'),('ParValueOnline','sp_matcode','nvarchar'),('ParValueOnline','sp_prot','int');

;WITH actual AS (
    SELECT t.name AS tbl, c.name AS col, ty.name AS sys_type
    FROM SimaticBatch.sys.columns c
    JOIN SimaticBatch.sys.tables  t ON t.object_id = c.object_id
    JOIN SimaticBatch.sys.schemas s ON s.schema_id = t.schema_id AND s.name = 'SIMATIC_BATCH'
    JOIN SimaticBatch.sys.types   ty ON ty.user_type_id = c.user_type_id
    WHERE t.name IN ('Batch','ParValueOnline')
)
SELECT w.tbl, w.col, w.sys_type AS expected_type, a.sys_type AS actual_type,
       CASE WHEN a.col IS NULL THEN 'MISSING' ELSE 'TYPE_MISMATCH' END AS problem
INTO #colcheck
FROM @want w
LEFT JOIN actual a ON a.tbl = w.tbl AND a.col = w.col
WHERE a.col IS NULL OR a.sys_type <> w.sys_type;

IF EXISTS (SELECT 1 FROM #colcheck)
BEGIN
    SELECT * FROM #colcheck ORDER BY tbl, col;
    THROW 50041, 'STOP: live SIMATIC schema does not match expected capture columns/types (see result). Do NOT run Section 1b.', 1;
END
PRINT 'SCHEMA OK — captured columns/types match live source on this server. Proceed to Section 1b.';
GO


/*============================================================================
  SECTION 1b — LOCAL CAPTURE DB + TABLES   << RUN ON OS1, THEN ON OS2 >>
  Types below are the PROVEN live types validated by Section 1a.
  datetimeoffset stored at scale 7 (lossless superset); nvarchar(512) matches the
  existing reporting copies (proven safe).
============================================================================*/
IF DB_ID('HerculesCapture') IS NULL CREATE DATABASE HerculesCapture;
GO
USE HerculesCapture;
GO

/* Durable Batch header copy (proven-consumed columns only + audit). */
IF OBJECT_ID('dbo.BatchCopy','U') IS NULL
CREATE TABLE dbo.BatchCopy
(
    ROOTGUID             uniqueidentifier  NOT NULL,
    ROOTOBJID            int               NOT NULL,
    ROOTOTID             int               NOT NULL,
    OGUID                uniqueidentifier  NOT NULL,
    OBJID                int               NOT NULL,
    OTID                 int               NOT NULL,
    Created              datetimeoffset(7) NULL,
    OrderId              int               NULL,
    ProductName          nvarchar(512)     NULL,
    Quantity             float             NULL,
    FormulaName          nvarchar(512)     NULL,
    FormulaCategoryName  nvarchar(512)     NULL,
    BatchTransferTime    datetimeoffset(7) NULL,
    CaptureSourceServer  varchar(20)       NOT NULL,
    CaptureCreatedUtc    datetime2(3)      NOT NULL CONSTRAINT DF_HC_BC_Cre DEFAULT (SYSUTCDATETIME()),
    CaptureUpdatedUtc    datetime2(3)      NOT NULL CONSTRAINT DF_HC_BC_Upd DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_HC_BatchCopy PRIMARY KEY (ROOTGUID, ROOTOBJID, ROOTOTID, OGUID, OBJID, OTID)
);
GO
/* OGUID is the batch identity the reporting join uses (BatchCopy.OGUID = PV.ROOTGUID). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_HC_BatchCopy_OGUID' AND object_id=OBJECT_ID('dbo.BatchCopy'))
    CREATE UNIQUE INDEX UX_HC_BatchCopy_OGUID ON dbo.BatchCopy(OGUID);
GO

/* Durable ParValueOnline copy (proven-consumed columns + audit). */
IF OBJECT_ID('dbo.ParValueOnline_copy','U') IS NULL
CREATE TABLE dbo.ParValueOnline_copy
(
    ROOTGUID uniqueidentifier NOT NULL, POBJID int NOT NULL, POTID int NOT NULL,
    P2OBJID int NOT NULL, P2OTID int NOT NULL, OBJID int NOT NULL,
    ActivationCounter int NOT NULL, EventID bigint NOT NULL,
    [TimeStamp] datetimeoffset(7) NOT NULL, [Name] nvarchar(512) NOT NULL,
    EventNotifyType int NULL, UsageId int NULL, DataTypeId int NULL, DataTypeName nvarchar(512) NULL,
    UoMId int NULL, UoMName nvarchar(512) NULL,
    HighValue float NULL, LowValue float NULL, RecHighValue float NULL, RecLowValue float NULL,
    sp_float float NULL, av_float float NULL,
    sp_matname nvarchar(512) NULL, sp_matcode nvarchar(512) NULL, sp_prot int NULL,
    CaptureSourceServer varchar(20) NOT NULL,
    CaptureCreatedUtc datetime2(3) NOT NULL CONSTRAINT DF_HC_PV_Cre DEFAULT (SYSUTCDATETIME()),
    CaptureUpdatedUtc datetime2(3) NOT NULL CONSTRAINT DF_HC_PV_Upd DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_HC_ParValueOnline_copy PRIMARY KEY
        (ROOTGUID, POBJID, POTID, P2OBJID, P2OTID, OBJID, ActivationCounter, EventID)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_HC_PV_ROOTGUID' AND object_id=OBJECT_ID('dbo.ParValueOnline_copy'))
    CREATE INDEX IX_HC_PV_ROOTGUID ON dbo.ParValueOnline_copy(ROOTGUID);
GO

/* Capture error log (fail-open: capture never throws into SIMATIC ops). */
IF OBJECT_ID('dbo.CaptureErrorLog','U') IS NULL
CREATE TABLE dbo.CaptureErrorLog
(
    ErrId bigint IDENTITY(1,1) PRIMARY KEY,
    WhenUtc datetime2(3) NOT NULL CONSTRAINT DF_HC_Err DEFAULT (SYSUTCDATETIME()),
    Proc_ sysname NULL, ErrNum int NULL, ErrMsg nvarchar(2048) NULL
);
GO


/*============================================================================
  SECTION 2 — LOCAL CAPTURE PROCEDURES      << RUN ON OS1, THEN ON OS2 >>
  Identical on both servers. @SourceTag supplied by the job step. Valid T-SQL:
  set-based UPDATE (refresh) + INSERT ... WHERE NOT EXISTS (new keys). Fail-open.
  Local-only reads (no linked server, no remote write), keyed on source PK.
============================================================================*/
USE HerculesCapture;
GO
CREATE OR ALTER PROCEDURE dbo.usp_Capture_Batch
    @SourceTag varchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        /* refresh existing rows (header fields can change while batch is live) */
        UPDATE T
           SET T.Created = S.Created, T.OrderId = S.OrderId, T.ProductName = S.ProductName,
               T.Quantity = S.Quantity, T.FormulaName = S.FormulaName,
               T.FormulaCategoryName = S.FormulaCategoryName, T.BatchTransferTime = S.BatchTransferTime,
               T.CaptureUpdatedUtc = SYSUTCDATETIME()
        FROM dbo.BatchCopy T
        JOIN SimaticBatch.SIMATIC_BATCH.Batch S WITH (NOLOCK)
          ON  T.ROOTGUID=S.ROOTGUID AND T.ROOTOBJID=S.ROOTOBJID AND T.ROOTOTID=S.ROOTOTID
          AND T.OGUID=S.OGUID AND T.OBJID=S.OBJID AND T.OTID=S.OTID;

        /* insert new keys */
        INSERT dbo.BatchCopy (ROOTGUID,ROOTOBJID,ROOTOTID,OGUID,OBJID,OTID,Created,OrderId,ProductName,
                              Quantity,FormulaName,FormulaCategoryName,BatchTransferTime,CaptureSourceServer)
        SELECT S.ROOTGUID,S.ROOTOBJID,S.ROOTOTID,S.OGUID,S.OBJID,S.OTID,S.Created,S.OrderId,S.ProductName,
               S.Quantity,S.FormulaName,S.FormulaCategoryName,S.BatchTransferTime,@SourceTag
        FROM SimaticBatch.SIMATIC_BATCH.Batch S WITH (NOLOCK)
        WHERE NOT EXISTS (SELECT 1 FROM dbo.BatchCopy T
                          WHERE T.ROOTGUID=S.ROOTGUID AND T.ROOTOBJID=S.ROOTOBJID AND T.ROOTOTID=S.ROOTOTID
                            AND T.OGUID=S.OGUID AND T.OBJID=S.OBJID AND T.OTID=S.OTID);
    END TRY
    BEGIN CATCH
        INSERT dbo.CaptureErrorLog(Proc_,ErrNum,ErrMsg) VALUES(N'usp_Capture_Batch',ERROR_NUMBER(),ERROR_MESSAGE());
    END CATCH
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_Capture_ParValueOnline
    @SourceTag varchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        /* refresh mutable current-value columns for existing keys */
        UPDATE T
           SET T.[TimeStamp]=S.[TimeStamp], T.[Name]=S.[Name], T.av_float=S.av_float, T.sp_float=S.sp_float,
               T.sp_matname=S.sp_matname, T.sp_matcode=S.sp_matcode, T.sp_prot=S.sp_prot,
               T.CaptureUpdatedUtc=SYSUTCDATETIME()
        FROM dbo.ParValueOnline_copy T
        JOIN SimaticBatch.SIMATIC_BATCH.ParValueOnline S WITH (NOLOCK)
          ON  T.ROOTGUID=S.ROOTGUID AND T.POBJID=S.POBJID AND T.POTID=S.POTID
          AND T.P2OBJID=S.P2OBJID AND T.P2OTID=S.P2OTID AND T.OBJID=S.OBJID
          AND T.ActivationCounter=S.ActivationCounter AND T.EventID=S.EventID;

        /* insert new keys */
        INSERT dbo.ParValueOnline_copy
              (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID,[TimeStamp],[Name],
               EventNotifyType,UsageId,DataTypeId,DataTypeName,UoMId,UoMName,HighValue,LowValue,RecHighValue,
               RecLowValue,sp_float,av_float,sp_matname,sp_matcode,sp_prot,CaptureSourceServer)
        SELECT S.ROOTGUID,S.POBJID,S.POTID,S.P2OBJID,S.P2OTID,S.OBJID,S.ActivationCounter,S.EventID,S.[TimeStamp],
               S.[Name],S.EventNotifyType,S.UsageId,S.DataTypeId,S.DataTypeName,S.UoMId,S.UoMName,S.HighValue,
               S.LowValue,S.RecHighValue,S.RecLowValue,S.sp_float,S.av_float,S.sp_matname,S.sp_matcode,S.sp_prot,@SourceTag
        FROM SimaticBatch.SIMATIC_BATCH.ParValueOnline S WITH (NOLOCK)
        WHERE NOT EXISTS (SELECT 1 FROM dbo.ParValueOnline_copy T
                          WHERE T.ROOTGUID=S.ROOTGUID AND T.POBJID=S.POBJID AND T.POTID=S.POTID
                            AND T.P2OBJID=S.P2OBJID AND T.P2OTID=S.P2OTID AND T.OBJID=S.OBJID
                            AND T.ActivationCounter=S.ActivationCounter AND T.EventID=S.EventID);
    END TRY
    BEGIN CATCH
        INSERT dbo.CaptureErrorLog(Proc_,ErrNum,ErrMsg) VALUES(N'usp_Capture_ParValueOnline',ERROR_NUMBER(),ERROR_MESSAGE());
    END CATCH
END
GO


/*============================================================================
  SECTION 3 — LOCAL CAPTURE JOB (every 1 min)   << RUN ON OS1, THEN ON OS2 >>
  Set @SourceTag = 'Server1' on OS1, 'Server2' on OS2 before running.
  Requires SQL Server Agent RUNNING on this OS server.
============================================================================*/
DECLARE @SourceTag varchar(20) = N'Server1';   -- <<< 'Server1' on OS1, 'Server2' on OS2
DECLARE @jobname sysname = N'HerculesCapture - Snapshot (1 min)';
IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @jobname)
BEGIN
    DECLARE @jid uniqueidentifier;
    EXEC msdb.dbo.sp_add_job @job_name=@jobname, @enabled=1,
         @description=N'Local set-based snapshot of live SIMATIC Batch + ParValueOnline into HerculesCapture.',
         @job_id=@jid OUTPUT;
    EXEC msdb.dbo.sp_add_jobstep @job_id=@jid, @step_name=N'Capture', @subsystem=N'TSQL',
         @database_name=N'HerculesCapture',
         @command = N'EXEC dbo.usp_Capture_Batch @SourceTag=N''' + @SourceTag + N''';
EXEC dbo.usp_Capture_ParValueOnline @SourceTag=N''' + @SourceTag + N''';';
    EXEC msdb.dbo.sp_add_schedule @schedule_name=N'HC_Every_1_Minute',
         @freq_type=4, @freq_interval=1, @freq_subday_type=4, @freq_subday_interval=1, @active_start_time=0;
    EXEC msdb.dbo.sp_attach_schedule @job_id=@jid, @schedule_name=N'HC_Every_1_Minute';
    EXEC msdb.dbo.sp_add_jobserver @job_id=@jid;
    PRINT 'SECTION 3: capture job created. Confirm SQL Agent is running on this OS server.';
END
ELSE PRINT 'SECTION 3: capture job already exists.';
GO


/*============================================================================
  SECTION 4 — REPORTING REPOINT (DURABLE)          << RUN ON REPORTING BOX >>
  In ASMBatchReports. New *_Durable procs read durable OS copies instead of live
  SIMATIC. Durable staging MERGE key = SourceServer + full source PK (#9).
  NOT wired into jobs here — cutover happens after shadow validation (file 50).
============================================================================*/
USE ASMBatchReports;
GO
CREATE OR ALTER PROCEDURE dbo.usp_StagePV_FromServer1_Durable
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LastSync datetime;
    SELECT @LastSync=LastTimeStamp FROM dbo.DataSyncTracker WHERE [Source Server]='Server1';
    MERGE dbo.ParValueOnline_copy AS T
    USING (SELECT v.ROOTGUID,v.POBJID,v.POTID,v.P2OBJID,v.P2OTID,v.OBJID,v.ActivationCounter,v.EventID,
                  v.[TimeStamp], v.[Name] COLLATE DATABASE_DEFAULT AS [Name], v.EventNotifyType,v.UsageId,
                  v.DataTypeId, v.DataTypeName COLLATE DATABASE_DEFAULT AS DataTypeName, v.UoMId,
                  v.UoMName COLLATE DATABASE_DEFAULT AS UoMName, v.HighValue,v.LowValue,v.RecHighValue,v.RecLowValue,
                  v.sp_float,v.av_float, v.sp_matname COLLATE DATABASE_DEFAULT AS sp_matname,
                  v.sp_matcode COLLATE DATABASE_DEFAULT AS sp_matcode, v.sp_prot, 'Server1' AS SourceServer
           FROM [OS1_SQL].HerculesCapture.dbo.ParValueOnline_copy v
           WHERE v.[Name] IS NOT NULL AND (@LastSync IS NULL OR v.[TimeStamp] > @LastSync)) AS S
      ON  T.SourceServer=S.SourceServer
      AND T.ROOTGUID=S.ROOTGUID AND T.POBJID=S.POBJID AND T.POTID=S.POTID
      AND T.P2OBJID=S.P2OBJID AND T.P2OTID=S.P2OTID AND T.OBJID=S.OBJID
      AND T.ActivationCounter=S.ActivationCounter AND T.EventID=S.EventID
    WHEN NOT MATCHED THEN INSERT
      (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID,[TimeStamp],[Name],EventNotifyType,
       UsageId,DataTypeId,DataTypeName,UoMId,UoMName,HighValue,LowValue,RecHighValue,RecLowValue,sp_float,av_float,
       sp_matname,sp_matcode,sp_prot,SourceServer)
      VALUES (S.ROOTGUID,S.POBJID,S.POTID,S.P2OBJID,S.P2OTID,S.OBJID,S.ActivationCounter,S.EventID,S.[TimeStamp],
       S.[Name],S.EventNotifyType,S.UsageId,S.DataTypeId,S.DataTypeName,S.UoMId,S.UoMName,S.HighValue,S.LowValue,
       S.RecHighValue,S.RecLowValue,S.sp_float,S.av_float,S.sp_matname,S.sp_matcode,S.sp_prot,S.SourceServer);
    DECLARE @m datetime; SELECT @m=MAX([TimeStamp]) FROM dbo.ParValueOnline_copy WHERE SourceServer='Server1';
    IF @m IS NOT NULL MERGE dbo.DataSyncTracker AS T USING (SELECT 'Server1' s,@m t) S ON T.[Source Server]=S.s
      WHEN MATCHED THEN UPDATE SET LastTimeStamp=S.t WHEN NOT MATCHED THEN INSERT([Source Server],LastTimeStamp) VALUES(S.s,S.t);
END
GO
CREATE OR ALTER PROCEDURE dbo.usp_StagePV_FromServer2_Durable
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LastSync datetime;
    SELECT @LastSync=LastTimeStamp FROM dbo.DataSyncTracker WHERE [Source Server]='Server2';
    MERGE dbo.ParValueOnline_copy AS T
    USING (SELECT v.ROOTGUID,v.POBJID,v.POTID,v.P2OBJID,v.P2OTID,v.OBJID,v.ActivationCounter,v.EventID,
                  v.[TimeStamp], v.[Name] COLLATE DATABASE_DEFAULT AS [Name], v.EventNotifyType,v.UsageId,
                  v.DataTypeId, v.DataTypeName COLLATE DATABASE_DEFAULT AS DataTypeName, v.UoMId,
                  v.UoMName COLLATE DATABASE_DEFAULT AS UoMName, v.HighValue,v.LowValue,v.RecHighValue,v.RecLowValue,
                  v.sp_float,v.av_float, v.sp_matname COLLATE DATABASE_DEFAULT AS sp_matname,
                  v.sp_matcode COLLATE DATABASE_DEFAULT AS sp_matcode, v.sp_prot, 'Server2' AS SourceServer
           FROM [FAKIEH_SERVER2].HerculesCapture.dbo.ParValueOnline_copy v
           WHERE v.[Name] IS NOT NULL AND (@LastSync IS NULL OR v.[TimeStamp] > @LastSync)) AS S
      ON  T.SourceServer=S.SourceServer
      AND T.ROOTGUID=S.ROOTGUID AND T.POBJID=S.POBJID AND T.POTID=S.POTID
      AND T.P2OBJID=S.P2OBJID AND T.P2OTID=S.P2OTID AND T.OBJID=S.OBJID
      AND T.ActivationCounter=S.ActivationCounter AND T.EventID=S.EventID
    WHEN NOT MATCHED THEN INSERT
      (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID,[TimeStamp],[Name],EventNotifyType,
       UsageId,DataTypeId,DataTypeName,UoMId,UoMName,HighValue,LowValue,RecHighValue,RecLowValue,sp_float,av_float,
       sp_matname,sp_matcode,sp_prot,SourceServer)
      VALUES (S.ROOTGUID,S.POBJID,S.POTID,S.P2OBJID,S.P2OTID,S.OBJID,S.ActivationCounter,S.EventID,S.[TimeStamp],
       S.[Name],S.EventNotifyType,S.UsageId,S.DataTypeId,S.DataTypeName,S.UoMId,S.UoMName,S.HighValue,S.LowValue,
       S.RecHighValue,S.RecLowValue,S.sp_float,S.av_float,S.sp_matname,S.sp_matcode,S.sp_prot,S.SourceServer);
    DECLARE @m datetime; SELECT @m=MAX([TimeStamp]) FROM dbo.ParValueOnline_copy WHERE SourceServer='Server2';
    IF @m IS NOT NULL MERGE dbo.DataSyncTracker AS T USING (SELECT 'Server2' s,@m t) S ON T.[Source Server]=S.s
      WHEN MATCHED THEN UPDATE SET LastTimeStamp=S.t WHEN NOT MATCHED THEN INSERT([Source Server],LastTimeStamp) VALUES(S.s,S.t);
END
GO
/* Upsert BatchCopy from DURABLE Batch copies (headers retained) — same FIX as Package A. */
CREATE OR ALTER PROCEDURE dbo.usp_Upsert_BatchCopy_FromDurable
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @LastSync datetime;
    SELECT @LastSync=LastTimeStamp FROM dbo.DataSyncTracker WHERE [Source Server]='BatchCopy';
    ;WITH agg AS (
        SELECT ROOTGUID, MAX(SourceServer) SourceServer, MIN([TimeStamp]) ActStart, MAX([TimeStamp]) ActEnd,
               MAX([TimeStamp]) BatchTransferTime
        FROM dbo.ParValueOnline_copy WHERE @LastSync IS NULL OR [TimeStamp] > @LastSync GROUP BY ROOTGUID),
    BatchSource AS (
        SELECT OGUID,ROOTGUID,ROOTOBJID,ROOTOTID,OBJID,OTID,Created,OrderId,ProductName,Quantity,FormulaName,
               FormulaCategoryName,BatchTransferTime,'Server1' SourceServer FROM [OS1_SQL].HerculesCapture.dbo.BatchCopy
        UNION ALL
        SELECT OGUID,ROOTGUID,ROOTOBJID,ROOTOTID,OBJID,OTID,Created,OrderId,ProductName,Quantity,FormulaName,
               FormulaCategoryName,BatchTransferTime,'Server2' SourceServer FROM [FAKIEH_SERVER2].HerculesCapture.dbo.BatchCopy),
    src AS (
        SELECT ISNULL(b.OGUID,a.ROOTGUID) BatchOGUID, a.ROOTGUID, ISNULL(b.SourceServer,a.SourceServer) SourceServer,
               a.ActStart, a.ActEnd, COALESCE(b.BatchTransferTime,a.BatchTransferTime) BatchTransferTime,
               b.ROOTGUID BatchROOTGUID, b.ROOTOBJID,b.ROOTOTID,b.OBJID,b.OTID,b.Created,b.OrderId,
               COALESCE(b.FormulaName,b.ProductName,N'Auto from PV') [Name], b.ProductName,b.Quantity,b.FormulaCategoryName
        FROM agg a LEFT JOIN BatchSource b ON b.OGUID=a.ROOTGUID)
    MERGE dbo.BatchCopy AS T USING src AS S ON T.OGUID=S.BatchOGUID
    WHEN NOT MATCHED THEN INSERT (OGUID,ROOTGUID,ROOTOBJID,ROOTOTID,OBJID,OTID,Created,OrderId,[Name],ProductName,
          ActStart,ActEnd,BatchTransferTime,Quantity,FormulaCategoryName,SourceServer)
      VALUES (S.BatchOGUID, ISNULL(S.BatchROOTGUID,S.BatchOGUID), ISNULL(S.ROOTOBJID,0),ISNULL(S.ROOTOTID,0),
          ISNULL(S.OBJID,0),ISNULL(S.OTID,0),ISNULL(S.Created,SYSDATETIMEOFFSET()),ISNULL(S.OrderId,0),S.[Name],
          S.ProductName,S.ActStart,S.ActEnd,S.BatchTransferTime,ISNULL(S.Quantity,0),S.FormulaCategoryName,S.SourceServer)
    WHEN MATCHED THEN UPDATE SET T.ROOTGUID=ISNULL(S.BatchROOTGUID,T.ROOTGUID),
          T.ROOTOBJID=ISNULL(S.ROOTOBJID,T.ROOTOBJID),T.ROOTOTID=ISNULL(S.ROOTOTID,T.ROOTOTID),
          T.OBJID=ISNULL(S.OBJID,T.OBJID),T.OTID=ISNULL(S.OTID,T.OTID),T.Created=ISNULL(S.Created,T.Created),
          T.OrderId=ISNULL(S.OrderId,T.OrderId),T.[Name]=ISNULL(S.[Name],T.[Name]),
          T.ProductName=ISNULL(S.ProductName,T.ProductName),T.Quantity=ISNULL(S.Quantity,T.Quantity),
          T.FormulaCategoryName=ISNULL(S.FormulaCategoryName,T.FormulaCategoryName),
          T.ActStart=S.ActStart,T.ActEnd=S.ActEnd,T.BatchTransferTime=S.BatchTransferTime,T.SourceServer=S.SourceServer;
    DECLARE @m datetime; SELECT @m=MAX([TimeStamp]) FROM dbo.ParValueOnline_copy;
    IF @m IS NOT NULL MERGE dbo.DataSyncTracker AS T USING (SELECT 'BatchCopy' s,@m t) S ON T.[Source Server]=S.s
      WHEN MATCHED THEN UPDATE SET LastTimeStamp=S.t WHEN NOT MATCHED THEN INSERT([Source Server],LastTimeStamp) VALUES(S.s,S.t);
END
GO
PRINT 'SECTION 4: durable reporting procs created (not yet wired into jobs). Proceed to 50_PackageB_Shadow_Validation.sql.';
GO


/*============================================================================
  SECTION 5 — REUSE vs NEW DB (note)
  To REUSE OS1 dbo.ASMBatchReports instead of HerculesCapture:
   - Point Sections 1-3 at ASMBatchReports. Its BatchCopy/ParValueOnline_copy are
     HEAPS with no PK -> first ADD the PK/unique indexes from Section 1b.
   - Still CREATE a DB on OS2 (none exists). HerculesCapture keeps OS1/OS2
     symmetric and avoids colliding with RetrieveAndStoreAllBatchData_S1.
  The TRIGGER alternative (discouraged) is in 41_PackageB_Trigger_Alternative_DESIGN.sql.
============================================================================*/

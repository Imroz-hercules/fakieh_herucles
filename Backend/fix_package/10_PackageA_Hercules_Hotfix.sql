/*==============================================================================
  10_PackageA_Hercules_Hotfix.sql
  Server : DESKTOP-N8PGI9S\FAKIEH_REPORTING   DB: ASMBatchReports   (SQL 2022)
  Purpose: ALTER the 3 confirmed-buggy procs with corrected FULL bodies.
           No DROP/CREATE (permissions preserved). Run 00_Preflight.sql first.
  Changes (only):
    1) usp_Upsert_BatchCopy_FromPV  : ROOTGUID fallback so headerless batches insert.
    2) usp_Merge_BatchMaterials_FromLocal : remove the 2 header-only filters.
    3) usp_StagePV_FromServer2      : read FAKIEH_SERVER2 + tag 'Server2'.
  Everything else (rn=1 dedup, material filters, MERGE keys, watermarks) UNCHANGED.
==============================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE ASMBatchReports;
GO

IF OBJECT_ID('dbo._FixBackup_ProcBodies','U') IS NULL
    THROW 50010, 'STOP: run 00_Preflight.sql first (no proc-body backup found).', 1;
GO

/*============================================================================
  GUARD (#5) — verify the CURRENT live bodies are either the known pre-fix shape
  (so we are correcting the expected bug) OR already-fixed (idempotent re-run).
  If a body is neither, STOP and report — never overwrite an unexpected body.
  CHARINDEX is used (not LIKE) so '[FAKIEH_SERVER1]' and '_' are literal.
============================================================================*/
DECLARE @u nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID('dbo.usp_Upsert_BatchCopy_FromPV'));
DECLARE @m nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID('dbo.usp_Merge_BatchMaterials_FromLocal'));
DECLARE @s nvarchar(max) = OBJECT_DEFINITION(OBJECT_ID('dbo.usp_StagePV_FromServer2'));

IF @u IS NULL OR @m IS NULL OR @s IS NULL
    THROW 50011, 'STOP: one of the three target procs does not exist.', 1;

/* Upsert: pre-fix consumes raw S.BatchROOTGUID; fixed uses ISNULL(...,S.BatchOGUID). */
DECLARE @u_bad  bit = CASE WHEN CHARINDEX('= S.BatchROOTGUID', @u) > 0
                             OR CHARINDEX('S.BatchROOTGUID,',   @u) > 0 THEN 1 ELSE 0 END;
DECLARE @u_good bit = CASE WHEN CHARINDEX('ISNULL(S.BatchROOTGUID, S.BatchOGUID)', @u) > 0
                            AND CHARINDEX('ISNULL(S.BatchROOTGUID, T.ROOTGUID)',   @u) > 0 THEN 1 ELSE 0 END;
IF (@u_bad = 0 AND @u_good = 0)
    THROW 50012, 'STOP: usp_Upsert_BatchCopy_FromPV body is neither the known pre-fix nor fixed shape. Review manually.', 1;

/* Merge: pre-fix contains the two header-exclusion predicates. */
DECLARE @m_bad  bit = CASE WHEN CHARINDEX('FormulaCategoryName IS NOT NULL', @m) > 0
                            AND CHARINDEX('<> ''Auto from PV''',             @m) > 0 THEN 1 ELSE 0 END;
DECLARE @m_good bit = CASE WHEN CHARINDEX('FormulaCategoryName IS NOT NULL', @m) = 0
                            AND CHARINDEX('ROW_NUMBER()',                    @m) > 0
                            AND CHARINDEX('sp_matname IS NOT NULL',          @m) > 0 THEN 1 ELSE 0 END;
IF (@m_bad = 0 AND @m_good = 0)
    THROW 50013, 'STOP: usp_Merge_BatchMaterials_FromLocal body is neither the known pre-fix nor fixed shape. Review manually.', 1;

/* StagePV Server2: pre-fix reads FAKIEH_SERVER1 + tags Server1; fixed = SERVER2 + Server2. */
DECLARE @s_bad  bit = CASE WHEN CHARINDEX('[FAKIEH_SERVER1].SimaticBatch.SIMATIC_BATCH.ParValueOnline', @s) > 0
                            AND CHARINDEX('''Server1'' AS SourceServer',                                @s) > 0 THEN 1 ELSE 0 END;
DECLARE @s_good bit = CASE WHEN CHARINDEX('[FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.ParValueOnline', @s) > 0
                            AND CHARINDEX('''Server2'' AS SourceServer',                                @s) > 0 THEN 1 ELSE 0 END;
IF (@s_bad = 0 AND @s_good = 0)
    THROW 50014, 'STOP: usp_StagePV_FromServer2 body is neither the known pre-fix nor fixed shape. Review manually.', 1;

PRINT CONCAT('GUARD OK — Upsert(bad=',@u_bad,',good=',@u_good,') Merge(bad=',@m_bad,',good=',@m_good,
             ') StagePV2(bad=',@s_bad,',good=',@s_good,'). Applying ALTERs (idempotent).');
GO

/*============================================================================
  FIX 1 — usp_Upsert_BatchCopy_FromPV
  Only difference vs production:
    INSERT  ROOTGUID = ISNULL(S.BatchROOTGUID, S.BatchOGUID)   -- was S.BatchROOTGUID
    UPDATE  T.ROOTGUID = ISNULL(S.BatchROOTGUID, T.ROOTGUID)   -- was S.BatchROOTGUID
  Preserved: BatchOGUID = ISNULL(b.OGUID, a.ROOTGUID); Name COALESCE; SourceServer.
============================================================================*/
ALTER PROCEDURE [dbo].[usp_Upsert_BatchCopy_FromPV]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @LastSync     DATETIME;
    DECLARE @MaxTimeStamp DATETIME;

    SELECT @LastSync = LastTimeStamp
    FROM dbo.DataSyncTracker
    WHERE [Source Server] = 'BatchCopy';

    ;WITH agg AS
    (
        SELECT
            ROOTGUID,
            MAX(SourceServer) AS SourceServer,
            MIN([TimeStamp])  AS ActStart,
            MAX([TimeStamp])  AS ActEnd,
            MAX([TimeStamp])  AS BatchTransferTime
        FROM dbo.ParValueOnline_copy
        WHERE @LastSync IS NULL
           OR [TimeStamp] > @LastSync
        GROUP BY ROOTGUID
    ),
    BatchSource AS
    (
        SELECT OGUID, ROOTGUID, ROOTOBJID, ROOTOTID, OBJID, OTID, Created, OrderId,
               ProductName, Quantity, FormulaName, FormulaCategoryName, BatchTransferTime,
               'Server1' AS SourceServer
        FROM [FAKIEH_SERVER1].SimaticBatch.SIMATIC_BATCH.Batch
        UNION ALL
        SELECT OGUID, ROOTGUID, ROOTOBJID, ROOTOTID, OBJID, OTID, Created, OrderId,
               ProductName, Quantity, FormulaName, FormulaCategoryName, BatchTransferTime,
               'Server2' AS SourceServer
        FROM [FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.Batch
    ),
    src AS
    (
        SELECT
            ISNULL(b.OGUID, a.ROOTGUID)                  AS BatchOGUID,
            a.ROOTGUID,
            ISNULL(b.SourceServer, a.SourceServer)       AS SourceServer,
            a.ActStart,
            a.ActEnd,
            COALESCE(b.BatchTransferTime, a.BatchTransferTime) AS BatchTransferTime,
            b.ROOTGUID  AS BatchROOTGUID,
            b.ROOTOBJID, b.ROOTOTID, b.OBJID, b.OTID, b.Created, b.OrderId,
            COALESCE(b.FormulaName, b.ProductName, N'Auto from PV') AS [Name],
            b.ProductName, b.Quantity, b.FormulaCategoryName
        FROM agg a
        LEFT JOIN BatchSource b
            ON b.OGUID = a.ROOTGUID
    )
    MERGE dbo.BatchCopy AS T
    USING src AS S
        ON T.OGUID = S.BatchOGUID
    WHEN NOT MATCHED THEN
        INSERT (OGUID, ROOTGUID, ROOTOBJID, ROOTOTID, OBJID, OTID, Created, OrderId,
                [Name], ProductName, ActStart, ActEnd, BatchTransferTime, Quantity,
                FormulaCategoryName, SourceServer)
        VALUES (S.BatchOGUID,
                ISNULL(S.BatchROOTGUID, S.BatchOGUID),     -- FIX: fallback to OGUID when header purged
                ISNULL(S.ROOTOBJID, 0), ISNULL(S.ROOTOTID, 0), ISNULL(S.OBJID, 0), ISNULL(S.OTID, 0),
                ISNULL(S.Created, SYSDATETIMEOFFSET()), ISNULL(S.OrderId, 0),
                S.[Name], S.ProductName, S.ActStart, S.ActEnd, S.BatchTransferTime,
                ISNULL(S.Quantity, 0), S.FormulaCategoryName, S.SourceServer)
    WHEN MATCHED THEN
        UPDATE SET
            T.ROOTGUID            = ISNULL(S.BatchROOTGUID, T.ROOTGUID),   -- FIX: never overwrite good ROOTGUID with NULL
            T.ROOTOBJID           = ISNULL(S.ROOTOBJID, T.ROOTOBJID),
            T.ROOTOTID            = ISNULL(S.ROOTOTID, T.ROOTOTID),
            T.OBJID               = ISNULL(S.OBJID, T.OBJID),
            T.OTID                = ISNULL(S.OTID, T.OTID),
            T.Created             = ISNULL(S.Created, T.Created),
            T.OrderId             = ISNULL(S.OrderId, T.OrderId),
            T.[Name]              = ISNULL(S.[Name], T.[Name]),
            T.ProductName         = ISNULL(S.ProductName, T.ProductName),
            T.Quantity            = ISNULL(S.Quantity, T.Quantity),
            T.FormulaCategoryName = ISNULL(S.FormulaCategoryName, T.FormulaCategoryName),
            T.ActStart            = S.ActStart,
            T.ActEnd              = S.ActEnd,
            T.BatchTransferTime   = S.BatchTransferTime,
            T.SourceServer        = S.SourceServer;

    SELECT @MaxTimeStamp = MAX([TimeStamp]) FROM dbo.ParValueOnline_copy;

    IF @MaxTimeStamp IS NOT NULL
    BEGIN
        MERGE dbo.DataSyncTracker AS T
        USING (SELECT 'BatchCopy' AS Src, @MaxTimeStamp AS LastTimeStamp) AS S
        ON T.[Source Server] = S.Src
        WHEN MATCHED THEN UPDATE SET LastTimeStamp = S.LastTimeStamp
        WHEN NOT MATCHED THEN INSERT ([Source Server], LastTimeStamp) VALUES (S.Src, S.LastTimeStamp);
    END
END
GO

/*============================================================================
  FIX 2 — usp_Merge_BatchMaterials_FromLocal
  Only difference vs production: REMOVED these two WHERE predicates
      AND bc.FormulaCategoryName IS NOT NULL
      AND ISNULL(bc.[Name],'') <> 'Auto from PV'
  Preserved: material filters (av_float>0, sp_float>0, sp_matname NOT NULL),
             ROW_NUMBER() rn=1, and the unique-index-compatible MERGE key.
============================================================================*/
ALTER PROCEDURE [dbo].[usp_Merge_BatchMaterials_FromLocal]
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH latest AS
    (
        SELECT
            ISNULL(bc.SourceServer,'Unknown') AS [Source Server],
            bc.OGUID               AS [Batch GUID],
            bc.ROOTGUID,
            bc.OrderId,
            bc.[Name]              AS [Batch Name],
            bc.ProductName         AS [Product Name],
            bc.FormulaCategoryName AS [FormulaCategoryName],
            bc.ActStart            AS [Batch Act Start],
            bc.ActEnd              AS [Batch Act End],
            bc.BatchTransferTime   AS [Batch Transfer Time],
            bc.Quantity,
            pv.sp_matname          AS [Material Name],
            pv.sp_matcode          AS [Material Code],
            pv.sp_prot,
            pv.sp_float            AS [SetPoint Float],
            pv.av_float            AS [Actual Value Float],
            pv.[TimeStamp],
            ROW_NUMBER() OVER
            (
                PARTITION BY
                    ISNULL(bc.SourceServer,'Unknown'),
                    bc.OGUID, pv.sp_matcode, pv.sp_matname, pv.sp_prot
                ORDER BY pv.[TimeStamp] DESC
            ) AS rn
        FROM dbo.BatchCopy bc
        INNER JOIN dbo.ParValueOnline_copy pv
            ON pv.ROOTGUID = bc.OGUID
        WHERE pv.av_float  > 0
          AND pv.sp_float  > 0
          AND pv.sp_matname IS NOT NULL
        -- NOTE: header-only filters removed so valid headerless ('Auto from PV') batches are kept.
    ),
    agg AS
    (
        SELECT [Source Server], [Batch GUID], ROOTGUID, OrderId, [Batch Name], [Product Name],
               FormulaCategoryName, [Batch Act Start], [Batch Act End], [Batch Transfer Time],
               Quantity, [Material Name], [Material Code], sp_prot, [SetPoint Float], [Actual Value Float]
        FROM latest
        WHERE rn = 1
    )
    MERGE dbo.BatchMaterials AS T
    USING agg AS S
        ON  T.[Source Server] = S.[Source Server]
        AND T.[Batch GUID]    = S.[Batch GUID]
        AND T.[Material Name] = S.[Material Name]
        AND ((T.[Material Code] IS NULL AND S.[Material Code] IS NULL) OR T.[Material Code] = S.[Material Code])
        AND ((T.sp_prot       IS NULL AND S.sp_prot       IS NULL) OR T.sp_prot       = S.sp_prot)
    WHEN NOT MATCHED THEN
        INSERT ([Source Server],[Batch GUID],ROOTGUID,OrderId,[Batch Name],[Product Name],
                FormulaCategoryName,[Batch Act Start],[Batch Act End],[Batch Transfer Time],
                Quantity,[Material Name],[Material Code],sp_prot,[SetPoint Float],[Actual Value Float])
        VALUES (S.[Source Server],S.[Batch GUID],S.ROOTGUID,S.OrderId,S.[Batch Name],S.[Product Name],
                S.FormulaCategoryName,S.[Batch Act Start],S.[Batch Act End],S.[Batch Transfer Time],
                S.Quantity,S.[Material Name],S.[Material Code],S.sp_prot,S.[SetPoint Float],S.[Actual Value Float])
    WHEN MATCHED THEN
        UPDATE SET
            T.ROOTGUID              = S.ROOTGUID,
            T.OrderId               = S.OrderId,
            T.[Batch Name]          = S.[Batch Name],
            T.[Product Name]        = S.[Product Name],
            T.[Batch Act Start]     = S.[Batch Act Start],
            T.[Batch Act End]       = S.[Batch Act End],
            T.[Batch Transfer Time] = S.[Batch Transfer Time],
            T.Quantity              = S.Quantity,
            T.[Material Code]       = S.[Material Code],
            T.sp_prot               = S.sp_prot,
            T.[SetPoint Float]      = S.[SetPoint Float],
            T.[Actual Value Float]  = S.[Actual Value Float],
            T.[FormulaCategoryName] = S.[FormulaCategoryName],
            T.[Source Server]       = S.[Source Server];
END
GO

/*============================================================================
  FIX 3 — usp_StagePV_FromServer2
  Only difference vs production:
      FROM [FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.ParValueOnline   -- was FAKIEH_SERVER1
      'Server2' AS SourceServer                                         -- was 'Server1'
  (watermark read/update already correctly keyed on 'Server2').
============================================================================*/
ALTER PROCEDURE [dbo].[usp_StagePV_FromServer2]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @LastSync   DATETIME;
    DECLARE @NewMaxTime DATETIME;

    SELECT @LastSync = LastTimeStamp
    FROM dbo.DataSyncTracker
    WHERE [Source Server] = 'Server2';

    ;WITH S AS
    (
        SELECT
            v.ROOTGUID, v.POBJID, v.POTID, v.P2OBJID, v.P2OTID, v.OBJID,
            v.ActivationCounter, v.EventID, v.[TimeStamp],
            v.[Name] COLLATE DATABASE_DEFAULT AS [Name],
            v.EventNotifyType, v.UsageId, v.DataTypeId,
            v.DataTypeName COLLATE DATABASE_DEFAULT AS DataTypeName,
            v.UoMId, v.UoMName COLLATE DATABASE_DEFAULT AS UoMName,
            v.HighValue, v.LowValue, v.RecHighValue, v.RecLowValue,
            v.sp_float, v.av_float,
            v.sp_matname COLLATE DATABASE_DEFAULT AS sp_matname,
            v.sp_matcode COLLATE DATABASE_DEFAULT AS sp_matcode,
            v.sp_prot,
            'Server2' AS SourceServer                                   -- FIX: tag Server2
        FROM [FAKIEH_SERVER2].SimaticBatch.SIMATIC_BATCH.ParValueOnline v   -- FIX: read OS2
        WHERE v.[Name] IS NOT NULL
          AND (@LastSync IS NULL OR v.[TimeStamp] > @LastSync)
    )
    MERGE dbo.ParValueOnline_copy AS T
    USING S
       ON T.ROOTGUID    = S.ROOTGUID
      AND T.[TimeStamp] = S.[TimeStamp]
      AND T.[Name]      = S.[Name]
    WHEN NOT MATCHED THEN
        INSERT (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID,
                [TimeStamp],[Name],EventNotifyType,UsageId,DataTypeId,DataTypeName,
                UoMId,UoMName,HighValue,LowValue,RecHighValue,RecLowValue,
                sp_float,av_float,sp_matname,sp_matcode,sp_prot,SourceServer)
        VALUES (S.ROOTGUID,S.POBJID,S.POTID,S.P2OBJID,S.P2OTID,S.OBJID,S.ActivationCounter,S.EventID,
                S.[TimeStamp],S.[Name],S.EventNotifyType,S.UsageId,S.DataTypeId,S.DataTypeName,
                S.UoMId,S.UoMName,S.HighValue,S.LowValue,S.RecHighValue,S.RecLowValue,
                S.sp_float,S.av_float,S.sp_matname,S.sp_matcode,S.sp_prot,S.SourceServer);

    SELECT @NewMaxTime = MAX([TimeStamp])
    FROM dbo.ParValueOnline_copy
    WHERE SourceServer = 'Server2';

    IF @NewMaxTime IS NOT NULL
    BEGIN
        MERGE dbo.DataSyncTracker AS T
        USING (SELECT 'Server2' AS SourceServer, @NewMaxTime AS LastTimeStamp) AS S
        ON T.[Source Server] = S.SourceServer
        WHEN MATCHED THEN UPDATE SET LastTimeStamp = S.LastTimeStamp
        WHEN NOT MATCHED THEN INSERT ([Source Server], LastTimeStamp) VALUES (S.SourceServer, S.LastTimeStamp);
    END
END
GO

PRINT 'HOTFIX applied (3 procs altered). Next: 20_PackageA_Backfill.sql (dry-run first).';
GO

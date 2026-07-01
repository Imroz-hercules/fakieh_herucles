/*==============================================================================
  20_PackageA_Backfill.sql
  Server : DESKTOP-N8PGI9S\FAKIEH_REPORTING   DB: ASMBatchReports   (SQL 2022)
  Purpose: Recover the 26 missing completed qualifying batches' MATERIALS from
           reporting dbo.ParValueOnline_copy. Source-Server-aware, dedup rn=1,
           idempotent (NOT MATCHED only -> no duplicates).
  Headers for these old batches stay 'Auto from PV' / NULL category (unrecoverable).

  SAFETY: defaults to DRY-RUN. It detects + previews counts inside a transaction,
          then ROLLS BACK unless @Execute = 1. Run once with @Execute = 0 to review
          the GUID list and the would-insert counts, then re-run with @Execute = 1.
  Re-runnable: yes (idempotent; re-running after commit recovers nothing new).
==============================================================================*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
USE ASMBatchReports;
GO

DECLARE @Execute          bit = 1;                        -- <<< 0 = preview/rollback, 1 = commit  [APPROVED: commit]
DECLARE @OverrideExpected bit = 0;                        -- <<< 1 = allow commit even if list <> expected 26
DECLARE @ReworkStart datetime2(0) = '2026-06-17T00:00:00';
DECLARE @AgeMin      int       = 120;                     -- latest PV must be >= 120 min old

/*-- 1. Identify the missing qualifying batches (the "26") --------------------*/
IF OBJECT_ID('tempdb..#miss') IS NOT NULL DROP TABLE #miss;
;WITH PvBatch AS
(
    SELECT pv.ROOTGUID, pv.SourceServer,
           MIN(pv.[TimeStamp]) AS first_pv,
           MAX(pv.[TimeStamp]) AS last_pv,
           COUNT_BIG(*)        AS pv_rows,
           SUM(CASE WHEN pv.av_float > 0 AND pv.sp_float > 0 AND pv.sp_matname IS NOT NULL
                    THEN 1 ELSE 0 END) AS qual
    FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
    WHERE pv.[TimeStamp] >= @ReworkStart
      AND pv.ROOTGUID IS NOT NULL
    GROUP BY pv.ROOTGUID, pv.SourceServer
)
SELECT p.ROOTGUID, p.SourceServer, p.first_pv, p.last_pv, p.pv_rows, p.qual
INTO   #miss
FROM   PvBatch p
WHERE  p.qual > 0
  AND  p.last_pv < DATEADD(MINUTE, -@AgeMin, SYSDATETIME())
  AND  NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm WITH (NOLOCK)
                   WHERE bm.[Batch GUID] = p.ROOTGUID
                     AND (p.SourceServer IS NULL OR bm.[Source Server] = p.SourceServer));

PRINT '--- BEFORE: missing qualifying batches to backfill ---';
SELECT CAST(ROOTGUID AS varchar(40)) AS rootguid, SourceServer,
       CONVERT(varchar(30), first_pv, 126) AS first_pv,
       CONVERT(varchar(30), last_pv, 126)  AS last_pv, pv_rows, qual
FROM   #miss ORDER BY last_pv;
SELECT COUNT(*) AS missing_batches_before FROM #miss;

/*-- 1b. EXECUTION GATE (#6): detected list must equal the expected 26 GUIDs ---
       (the set proven by the investigation). Differences block COMMIT unless
       @OverrideExpected = 1. Dry-run still prints the difference for review. */
DECLARE @exp TABLE (id uniqueidentifier PRIMARY KEY);
INSERT @exp (id) VALUES
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

PRINT '--- Difference vs expected 26 (detected-not-expected, then expected-not-detected) ---';
SELECT 'DETECTED_NOT_EXPECTED' AS kind, CAST(m.ROOTGUID AS varchar(40)) AS rootguid, m.SourceServer
FROM #miss m WHERE NOT EXISTS (SELECT 1 FROM @exp e WHERE e.id = m.ROOTGUID)
UNION ALL
SELECT 'EXPECTED_NOT_DETECTED', CAST(e.id AS varchar(40)), NULL
FROM @exp e WHERE NOT EXISTS (SELECT 1 FROM #miss m WHERE m.ROOTGUID = e.id);

DECLARE @diff int =
    (SELECT COUNT(*) FROM #miss m WHERE NOT EXISTS (SELECT 1 FROM @exp e WHERE e.id = m.ROOTGUID))
  + (SELECT COUNT(*) FROM @exp e WHERE NOT EXISTS (SELECT 1 FROM #miss m WHERE m.ROOTGUID = e.id));

IF @Execute = 1 AND @diff <> 0 AND @OverrideExpected = 0
    THROW 50020, 'STOP: detected missing set differs from the expected 26 GUIDs. Review the difference above. Set @OverrideExpected = 1 only if the new set is intended.', 1;

IF @diff <> 0
    PRINT CONCAT('NOTE: detected set differs from expected by ', @diff,
                 ' GUID(s). (Blocks COMMIT unless @OverrideExpected = 1.)');

/*-- 2. Apply inside a transaction (rolled back unless @Execute = 1) ----------*/
BEGIN TRAN;

/* 2a. Upsert headerless rows into BatchCopy (keeps BatchCopy consistent for
       future scheduled merges). ROOTGUID = OGUID (header purged). */
;WITH bsrc AS
(
    SELECT m.ROOTGUID AS OGUID, m.ROOTGUID AS ROOTGUID, m.SourceServer,
           CONVERT(datetimeoffset, m.first_pv) AS ActStart,
           CONVERT(datetimeoffset, m.last_pv)  AS ActEnd,
           CONVERT(datetimeoffset, m.last_pv)  AS BatchTransferTime
    FROM #miss m
)
MERGE dbo.BatchCopy AS T
USING bsrc AS S
   ON T.OGUID = S.OGUID AND ISNULL(T.SourceServer,'') = ISNULL(S.SourceServer,'')
WHEN NOT MATCHED THEN
    INSERT (OGUID, ROOTGUID, ROOTOBJID, ROOTOTID, OBJID, OTID, Created, OrderId,
            [Name], ProductName, ActStart, ActEnd, BatchTransferTime, Quantity,
            FormulaCategoryName, SourceServer)
    VALUES (S.OGUID, S.ROOTGUID, 0, 0, 0, 0, S.ActStart, 0,
            N'Auto from PV', NULL, S.ActStart, S.ActEnd, S.BatchTransferTime, 0,
            NULL, S.SourceServer);

DECLARE @bc_inserted int = @@ROWCOUNT;

/* 2b. Merge material-grain rows into BatchMaterials for exactly these batches.
       Same dedup + unique-key MERGE as the live pipeline; NOT MATCHED only. */
;WITH latest AS
(
    SELECT
        pv.SourceServer                     AS [Source Server],
        pv.ROOTGUID                         AS [Batch GUID],
        pv.ROOTGUID                         AS ROOTGUID,
        pv.sp_matname                       AS [Material Name],
        pv.sp_matcode                       AS [Material Code],
        pv.sp_prot,
        pv.sp_float                         AS [SetPoint Float],
        pv.av_float                         AS [Actual Value Float],
        CONVERT(datetime, MIN(pv.[TimeStamp]) OVER (PARTITION BY pv.SourceServer, pv.ROOTGUID)) AS [Batch Act Start],
        CONVERT(datetime, MAX(pv.[TimeStamp]) OVER (PARTITION BY pv.SourceServer, pv.ROOTGUID)) AS [Batch Act End],
        CONVERT(datetime, MAX(pv.[TimeStamp]) OVER (PARTITION BY pv.SourceServer, pv.ROOTGUID)) AS [Batch Transfer Time],
        ROW_NUMBER() OVER (PARTITION BY pv.SourceServer, pv.ROOTGUID, pv.sp_matcode, pv.sp_matname, pv.sp_prot
                           ORDER BY pv.[TimeStamp] DESC) AS rn
    FROM dbo.ParValueOnline_copy pv
    JOIN #miss m
      ON m.ROOTGUID = pv.ROOTGUID
     AND ISNULL(m.SourceServer,'') = ISNULL(pv.SourceServer,'')
    WHERE pv.av_float  > 0
      AND pv.sp_float  > 0
      AND pv.sp_matname IS NOT NULL
)
MERGE dbo.BatchMaterials AS T
USING (SELECT * FROM latest WHERE rn = 1) AS S
    ON  T.[Source Server] = S.[Source Server]
    AND T.[Batch GUID]    = S.[Batch GUID]
    AND T.[Material Name] = S.[Material Name]
    AND ((T.[Material Code] IS NULL AND S.[Material Code] IS NULL) OR T.[Material Code] = S.[Material Code])
    AND ((T.sp_prot       IS NULL AND S.sp_prot       IS NULL) OR T.sp_prot       = S.sp_prot)
WHEN NOT MATCHED THEN
    INSERT ([Source Server],[Batch GUID],ROOTGUID,OrderId,[Batch Name],[Product Name],
            FormulaCategoryName,[Batch Act Start],[Batch Act End],[Batch Transfer Time],
            Quantity,[Material Name],[Material Code],sp_prot,[SetPoint Float],[Actual Value Float])
    VALUES (S.[Source Server],S.[Batch GUID],S.ROOTGUID,NULL,N'Auto from PV',NULL,
            NULL,S.[Batch Act Start],S.[Batch Act End],S.[Batch Transfer Time],
            NULL,S.[Material Name],S.[Material Code],S.sp_prot,S.[SetPoint Float],S.[Actual Value Float]);

DECLARE @bm_inserted int = @@ROWCOUNT;

/*-- 3. AFTER preview (still inside the transaction) --------------------------*/
PRINT '--- AFTER: rows that would be / were inserted ---';
SELECT @bc_inserted AS batchcopy_rows_inserted, @bm_inserted AS batchmaterials_rows_inserted;

SELECT m.ROOTGUID,
       (SELECT COUNT(*) FROM dbo.BatchMaterials bm
        WHERE bm.[Batch GUID] = m.ROOTGUID
          AND ISNULL(bm.[Source Server],'') = ISNULL(m.SourceServer,'')) AS materials_now
FROM   #miss m ORDER BY m.last_pv;

/* re-check remaining-missing within the transaction */
;WITH PvBatch AS
(
    SELECT pv.ROOTGUID, pv.SourceServer, MAX(pv.[TimeStamp]) AS last_pv,
           SUM(CASE WHEN pv.av_float>0 AND pv.sp_float>0 AND pv.sp_matname IS NOT NULL THEN 1 ELSE 0 END) AS qual
    FROM dbo.ParValueOnline_copy pv WITH (NOLOCK)
    WHERE pv.[TimeStamp] >= @ReworkStart AND pv.ROOTGUID IS NOT NULL
    GROUP BY pv.ROOTGUID, pv.SourceServer
)
SELECT COUNT(*) AS missing_batches_after
FROM   PvBatch p
WHERE  p.qual > 0
  AND  p.last_pv < DATEADD(MINUTE, -@AgeMin, SYSDATETIME())
  AND  NOT EXISTS (SELECT 1 FROM dbo.BatchMaterials bm
                   WHERE bm.[Batch GUID] = p.ROOTGUID
                     AND (p.SourceServer IS NULL OR bm.[Source Server] = p.SourceServer));

/*-- 4. Commit or roll back ---------------------------------------------------*/
IF @Execute = 1
BEGIN
    COMMIT;
    PRINT 'BACKFILL COMMITTED.';
END
ELSE
BEGIN
    ROLLBACK;
    PRINT 'DRY-RUN: rolled back. Review counts above, then re-run with @Execute = 1.';
END
GO

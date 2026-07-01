/*==============================================================================
  20_Idempotency_Indexes_and_Log.sql     RUN ON: OS1 AND OS2 (in ASMBatchReports)
  REVIEW-ONLY — EXECUTE NOTHING until approved.
  - Targets are currently HEAPS. Add the unique keys the capture MERGE/UPDATE needs.
  - ParValueOnline_copy stays NON-unique on purpose (accumulates PV versions; the
    central proc dedups via ROW_NUMBER() rn=1).
  - Creates dbo.CaptureErrorLog used by the fail-open triggers in 30.
  Safe to run on OS1 (existing empty tables) and OS2 (just created by 10).
==============================================================================*/
USE ASMBatchReports;
GO

/* BatchCopy: one row per batch identity (OGUID) — required for the Batch MERGE. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_BatchCopy_OGUID' AND object_id=OBJECT_ID('dbo.BatchCopy'))
    CREATE UNIQUE INDEX UX_BatchCopy_OGUID ON dbo.BatchCopy(OGUID);
GO

/* OrderDetails: unique on (ROOTGUID, OrderId). */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_OrderDetails_Root_Order' AND object_id=OBJECT_ID('dbo.OrderDetails'))
    CREATE UNIQUE INDEX UX_OrderDetails_Root_Order ON dbo.OrderDetails(ROOTGUID, OrderId);
GO

/* ParValueOnline_copy: NON-UNIQUE helper only (accumulating). Speeds the proc join
   (PV.ROOTGUID = BC.OGUID) and the rn=1 dedup. Do NOT make this unique. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PVcopy_ROOTGUID_TS' AND object_id=OBJECT_ID('dbo.ParValueOnline_copy'))
    CREATE INDEX IX_PVcopy_ROOTGUID_TS ON dbo.ParValueOnline_copy(ROOTGUID, [TimeStamp]);
GO

/* Fail-open capture error log (written by the TRY/CATCH in every trigger). */
IF OBJECT_ID('dbo.CaptureErrorLog','U') IS NULL
CREATE TABLE dbo.CaptureErrorLog
(
    ErrId      bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_CaptureErrorLog PRIMARY KEY,
    WhenUtc    datetime2(3) NOT NULL CONSTRAINT DF_CaptureErrorLog DEFAULT (SYSUTCDATETIME()),
    Trigger_   sysname NULL,
    ErrNumber  int NULL,
    ErrMessage nvarchar(2048) NULL
);
GO
PRINT 'Indexes + CaptureErrorLog ready on this server. Next: 30 (triggers) — OT approval required.';
GO

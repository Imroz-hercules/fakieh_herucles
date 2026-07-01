/*==============================================================================
  41_PackageB_Trigger_Alternative_DESIGN.sql
  STATUS: DESIGN-ONLY. NOT EXECUTABLE. Contains NO production DDL.
  The default and recommended capture method is the local snapshot JOB in
  40_PackageB_Final_Durable_Capture.sql. Use a trigger ONLY if OT explicitly
  rejects the snapshot job. If approved, an engineer must turn the design below
  into reviewed DDL in a separate, explicitly-approved change.
==============================================================================*/
THROW 50060, 'DESIGN-ONLY FILE. Nothing to execute. See 40_… Section 1-4 for the recommended snapshot-job capture.', 1;
GO

/*------------------------------------------------------------------------------
  TRIGGER ALTERNATIVE — design notes (not runnable as-is)

  Constraints that any trigger MUST satisfy (per the non-negotiable rules):
    * LOCAL-ONLY: writes only to the local HerculesCapture DB on the same OS
      server. NO remote/linked-server writes.
    * SET-BASED: operates on the inserted/deleted pseudo-tables, never row-by-row.
    * FAIL-OPEN: wrapped in TRY/CATCH that logs to HerculesCapture.dbo.CaptureErrorLog
      and never re-raises, so a capture failure cannot block SIMATIC writes.
    * IDEMPOTENT + KEYED BY SOURCE PK: UPDATE existing + INSERT new (WHERE NOT
      EXISTS) on the full source PK. NOT insert-only.
    * AFTER trigger that COEXISTS with the vendor INSTEAD OF tr_*Merger triggers.
      The Siemens triggers are NOT modified or disabled.

  Target tables / keys (same as the snapshot design):
    * SIMATIC_BATCH.Batch          -> HerculesCapture.dbo.BatchCopy
        key (ROOTGUID,ROOTOBJID,ROOTOTID,OGUID,OBJID,OTID)
    * SIMATIC_BATCH.ParValueOnline -> HerculesCapture.dbo.ParValueOnline_copy
        key (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID)

  Shape (pseudocode — turn into reviewed DDL only if approved):

    CREATE TRIGGER SIMATIC_BATCH.tr_HC_Capture_Batch
    ON SIMATIC_BATCH.Batch AFTER INSERT, UPDATE AS
    BEGIN
      SET NOCOUNT ON;
      BEGIN TRY
        UPDATE T SET <mutable cols> = i.<cols>, T.CaptureUpdatedUtc = SYSUTCDATETIME()
        FROM HerculesCapture.dbo.BatchCopy T
        JOIN inserted i ON <full 6-col PK match>;

        INSERT HerculesCapture.dbo.BatchCopy (<col list>, CaptureSourceServer)
        SELECT <col list>, '<ServerTag>'
        FROM inserted i
        WHERE NOT EXISTS (SELECT 1 FROM HerculesCapture.dbo.BatchCopy T WHERE <full 6-col PK match>);
      END TRY
      BEGIN CATCH
        INSERT HerculesCapture.dbo.CaptureErrorLog(Proc_,ErrNum,ErrMsg)
        VALUES (N'tr_HC_Capture_Batch', ERROR_NUMBER(), ERROR_MESSAGE());
      END CATCH
    END

    -- Analogous AFTER INSERT,UPDATE trigger on SIMATIC_BATCH.ParValueOnline,
    -- keyed on its 8-column PK, same UPDATE + INSERT WHERE NOT EXISTS pattern.

  Trade-offs vs the snapshot job (why the job is preferred):
    * A trigger adds code to a Siemens runtime-critical table path; even fail-open,
      it executes on every Batch/ParValueOnline write.
    * The snapshot job is fully decoupled, easy to pause, and cannot affect SIMATIC
      write latency.
    * Header retention only needs ~1-minute granularity (batches run 25-90 min),
      which the job already guarantees.
------------------------------------------------------------------------------*/

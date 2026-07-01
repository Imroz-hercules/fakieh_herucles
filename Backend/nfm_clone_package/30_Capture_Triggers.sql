/*==============================================================================
  30_Capture_Triggers.sql       RUN ON: OS1 AND OS2, in database [SimaticBatch]
  *** OT / SIEMENS APPROVAL REQUIRED — these objects live in the SimaticBatch DB ***
  REVIEW-ONLY — EXECUTE NOTHING until approved.

  Clones NFM's copy triggers, bound to Fakieh's REAL SIMATIC_BATCH.* schema.
  SAFE PATTERN (all triggers):
      SET NOCOUNT ON; SET XACT_ABORT OFF;
      body in TRY/CATCH that LOGS to ASMBatchReports.dbo.CaptureErrorLog and
      NEVER issues ROLLBACK -> a capture failure can never block/roll back the
      SIMATIC write. All set-based from inserted/deleted; NO cursors; multi-row safe.
  No +15000 / +28000 offsets (preserve exact source IDs).
  Writes are LOCAL cross-database (SimaticBatch -> ASMBatchReports on the SAME box) —
  NOT a remote/linked-server write.
  Vendor tr_*Merger triggers are NOT modified or disabled. Our AFTER triggers
  coexist with them (the INSTEAD OF mergers MERGE into the base table, which fires
  these AFTER triggers — confirmed in the pre-build gate for Batch & BatchChanges).

  ------------------------------------------------------------------------------
  BatchCopy 56-col mapping (guardrail #6), derived from discovery:
    From SIMATIC_BATCH.Batch (set by trg_HC_Copy_Batch):
      ROOTGUID,ROOTOBJID,ROOTOTID,OGUID,OBJID,OTID,Created,ExAttribute,Quantity,
      ProductName,ProductCode,ProductGUID,ProductUoMId,FormulaCategoryName,FormulaName,
      FormulaVersion,FormulaGUID,FormulaId,MRecipeName,MRecipeVersion,MRecipeGUID,
      MRecipeId,OrderId,PlanEnd,PCellGUID,PCellId,PartId,BatchReleaseGroupId,
      CreationDateTime,BatchHasNoTags,BatchVersion,LastOSCDateTime,MarkByOSC,BatchTransferTime
    From SIMATIC_BATCH.BatchChanges (set by trg_HC_Copy_BatchChanges, latest EventID/OGUID):
      Name,Description,PredecessorBatchId,ChainMode,ChainIgnorePredecessorState,ActQuantity,
      ReleaseTime,PlanStart,ActStart,ActEnd,Mode(<-StartMode),State,ExState,
      ModificationDateTime,GapTime
    R1 — NO Fakieh source (left NULL; confirm vs NFM): CreatedTSHostId, Deleted,
      DeletedTSHostId, Withdrawn, Export, ModifiedBits, CurrentBatchDataId
==============================================================================*/
USE SimaticBatch;
GO

/*------------------------------------------------------------------------------
  trg_HC_Copy_Batch  —  Batch header columns -> ASMBatchReports.dbo.BatchCopy
------------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER SIMATIC_BATCH.trg_HC_Copy_Batch
ON SIMATIC_BATCH.Batch
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT OFF;
    BEGIN TRY
        ;WITH src AS (
            SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.OGUID ORDER BY i.Created DESC) rn
            FROM inserted i
        )
        MERGE ASMBatchReports.dbo.BatchCopy AS T
        USING (SELECT * FROM src WHERE rn = 1) AS S
            ON T.OGUID = S.OGUID
        WHEN MATCHED THEN UPDATE SET
            T.ROOTGUID=S.ROOTGUID, T.ROOTOBJID=S.ROOTOBJID, T.ROOTOTID=S.ROOTOTID,
            T.OBJID=S.OBJID, T.OTID=S.OTID, T.Created=S.Created, T.ExAttribute=S.ExAttribute,
            T.Quantity=S.Quantity, T.ProductName=S.ProductName, T.ProductCode=S.ProductCode,
            T.ProductGUID=S.ProductGUID, T.ProductUoMId=S.ProductUoMId,
            T.FormulaCategoryName=S.FormulaCategoryName, T.FormulaName=S.FormulaName,
            T.FormulaVersion=S.FormulaVersion, T.FormulaGUID=S.FormulaGUID, T.FormulaId=S.FormulaId,
            T.MRecipeName=S.MRecipeName, T.MRecipeVersion=S.MRecipeVersion, T.MRecipeGUID=S.MRecipeGUID,
            T.MRecipeId=S.MRecipeId, T.OrderId=S.OrderId, T.PlanEnd=S.PlanEnd, T.PCellGUID=S.PCellGUID,
            T.PCellId=S.PCellId, T.PartId=S.PartId, T.BatchReleaseGroupId=S.BatchReleaseGroupId,
            T.CreationDateTime=S.CreationDateTime, T.BatchHasNoTags=S.BatchHasNoTags,
            T.BatchVersion=S.BatchVersion, T.LastOSCDateTime=S.LastOSCDateTime,
            T.MarkByOSC=S.MarkByOSC, T.BatchTransferTime=S.BatchTransferTime
        WHEN NOT MATCHED THEN INSERT
            (ROOTGUID,ROOTOBJID,ROOTOTID,OGUID,OBJID,OTID,Created,ExAttribute,Quantity,
             ProductName,ProductCode,ProductGUID,ProductUoMId,FormulaCategoryName,FormulaName,
             FormulaVersion,FormulaGUID,FormulaId,MRecipeName,MRecipeVersion,MRecipeGUID,MRecipeId,
             OrderId,PlanEnd,PCellGUID,PCellId,PartId,BatchReleaseGroupId,CreationDateTime,
             BatchHasNoTags,BatchVersion,LastOSCDateTime,MarkByOSC,BatchTransferTime)
            VALUES
            (S.ROOTGUID,S.ROOTOBJID,S.ROOTOTID,S.OGUID,S.OBJID,S.OTID,S.Created,S.ExAttribute,S.Quantity,
             S.ProductName,S.ProductCode,S.ProductGUID,S.ProductUoMId,S.FormulaCategoryName,S.FormulaName,
             S.FormulaVersion,S.FormulaGUID,S.FormulaId,S.MRecipeName,S.MRecipeVersion,S.MRecipeGUID,S.MRecipeId,
             S.OrderId,S.PlanEnd,S.PCellGUID,S.PCellId,S.PartId,S.BatchReleaseGroupId,S.CreationDateTime,
             S.BatchHasNoTags,S.BatchVersion,S.LastOSCDateTime,S.MarkByOSC,S.BatchTransferTime);
        /* R1 columns (CreatedTSHostId, Deleted, DeletedTSHostId, Withdrawn, Export,
           ModifiedBits, CurrentBatchDataId) intentionally left NULL — no Fakieh source. */
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> -1
            INSERT ASMBatchReports.dbo.CaptureErrorLog(Trigger_,ErrNumber,ErrMessage)
            VALUES (N'trg_HC_Copy_Batch', ERROR_NUMBER(), ERROR_MESSAGE());
        /* NEVER ROLLBACK — capture failure must not block the SIMATIC write. */
    END CATCH
END
GO

/*------------------------------------------------------------------------------
  trg_HC_Copy_BatchChanges  —  dynamic state -> updates existing BatchCopy row(s)
  Update-only (the Batch trigger creates the header row). Latest EventID per OGUID wins.
------------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER SIMATIC_BATCH.trg_HC_Copy_BatchChanges
ON SIMATIC_BATCH.BatchChanges
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT OFF;
    BEGIN TRY
        ;WITH latest AS (
            SELECT i.*, ROW_NUMBER() OVER (PARTITION BY i.OGUID ORDER BY i.EventID DESC) rn
            FROM inserted i
        )
        UPDATE T SET
            T.Name=S.Name, T.Description=S.Description, T.PredecessorBatchId=S.PredecessorBatchId,
            T.ChainMode=S.ChainMode, T.ChainIgnorePredecessorState=S.ChainIgnorePredecessorState,
            T.ActQuantity=S.ActQuantity, T.ReleaseTime=S.ReleaseTime, T.PlanStart=S.PlanStart,
            T.ActStart=S.ActStart, T.ActEnd=S.ActEnd, T.Mode=S.StartMode, T.State=S.State,
            T.ExState=S.ExState, T.ModificationDateTime=S.ModificationDateTime, T.GapTime=S.GapTime
        FROM ASMBatchReports.dbo.BatchCopy T
        JOIN latest S ON S.OGUID = T.OGUID AND S.rn = 1;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> -1
            INSERT ASMBatchReports.dbo.CaptureErrorLog(Trigger_,ErrNumber,ErrMessage)
            VALUES (N'trg_HC_Copy_BatchChanges', ERROR_NUMBER(), ERROR_MESSAGE());
    END CATCH
END
GO

/*------------------------------------------------------------------------------
  trg_HC_Copy_ParValueOnline  —  full PV row -> ASMBatchReports.dbo.ParValueOnline_copy
  Append (target is NON-unique; central proc dedups via rn=1). NFM CopyParValueOnline pattern.
  (ParValueOnline has NO vendor trigger; SIMATIC writes it directly — AFTER fires on those writes.)
------------------------------------------------------------------------------*/
CREATE OR ALTER TRIGGER SIMATIC_BATCH.trg_HC_Copy_ParValueOnline
ON SIMATIC_BATCH.ParValueOnline
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT OFF;
    BEGIN TRY
        INSERT ASMBatchReports.dbo.ParValueOnline_copy
            (ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID,[TimeStamp],Name,
             EventNotifyType,UsageId,DataTypeId,DataTypeName,UoMId,UoMName,HighValue,LowValue,RecHighValue,
             RecLowValue,sp_float,asp_float,av_float,sp_int,asp_int,av_int,sp_string,asp_string,av_string,
             loc_unitallocname,loc_unitname,sp_locname,asp_locname,av_locname,sp_matname,sp_matcode,
             asp_matname,asp_matcode,av_matname,av_matcode,sp_EnumValue,asp_EnumValue,av_EnumValue,
             sp_Unit,asp_Unit,av_Unit,sp_prot,asp_prot,av_prot)
        SELECT
             ROOTGUID,POBJID,POTID,P2OBJID,P2OTID,OBJID,ActivationCounter,EventID,[TimeStamp],Name,
             EventNotifyType,UsageId,DataTypeId,DataTypeName,UoMId,UoMName,HighValue,LowValue,RecHighValue,
             RecLowValue,sp_float,asp_float,av_float,sp_int,asp_int,av_int,sp_string,asp_string,av_string,
             loc_unitallocname,loc_unitname,sp_locname,asp_locname,av_locname,sp_matname,sp_matcode,
             asp_matname,asp_matcode,av_matname,av_matcode,sp_EnumValue,asp_EnumValue,av_EnumValue,
             sp_Unit,asp_Unit,av_Unit,sp_prot,asp_prot,av_prot
        FROM inserted;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> -1
            INSERT ASMBatchReports.dbo.CaptureErrorLog(Trigger_,ErrNumber,ErrMessage)
            VALUES (N'trg_HC_Copy_ParValueOnline', ERROR_NUMBER(), ERROR_MESSAGE());
    END CATCH
END
GO

/*------------------------------------------------------------------------------
  trg_HC_Copy_Order  —  DESIGN STUB, DO NOT DEPLOY YET (reconciliation R3).
  SIMATIC_BATCH.Order has no OrderId / OrderCategory columns; OrderDetails is an
  Order (x) OrderCategory projection in NFM. Needs NFM's CopyOrder source AND
  confirmation that vendor tr_Order writes its base table (the pre-build gate only
  covered Batch & BatchChanges). OrderId for the report already comes from
  Batch.OrderId, so this is NON-BLOCKING for batch reporting.
------------------------------------------------------------------------------*/
/*
CREATE OR ALTER TRIGGER SIMATIC_BATCH.trg_HC_Copy_Order
ON SIMATIC_BATCH.[Order] AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT OFF;
    BEGIN TRY
        -- MERGE ASMBatchReports.dbo.OrderDetails (ROOTGUID, OrderId<-??, OrderName<-Order.Name,
        --   OrderCategory<-join SIMATIC_BATCH.OrderCategory, CreationDateTime, Quantity, Description)
        -- FINALIZE column mapping from NFM CopyOrder before enabling.
        SELECT 1;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> -1
            INSERT ASMBatchReports.dbo.CaptureErrorLog(Trigger_,ErrNumber,ErrMessage)
            VALUES (N'trg_HC_Copy_Order', ERROR_NUMBER(), ERROR_MESSAGE());
    END CATCH
END
*/
PRINT 'Capture triggers (Batch, BatchChanges, ParValueOnline) created. Order trigger = design stub (R3).';
GO

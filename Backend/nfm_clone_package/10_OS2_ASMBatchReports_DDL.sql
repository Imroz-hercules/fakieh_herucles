/*==============================================================================
  10_OS2_ASMBatchReports_DDL.sql      RUN ON: OS2  (FAKIEH_SERVER2 / OS2\INFSERVER)
  REVIEW-ONLY — EXECUTE NOTHING until approved.
  Creates the per-server durable copy DB + 3 target tables on OS2, as an EXACT
  mirror of OS1's column lists (generated from OS1 sys.columns; nvarchar(256) =
  max_length 512 bytes). OS1 already has these tables (empty) — do NOT run there.
  No SIMATIC object is touched here.
==============================================================================*/
IF DB_ID('ASMBatchReports') IS NULL CREATE DATABASE ASMBatchReports;
GO
USE ASMBatchReports;
GO

IF OBJECT_ID('dbo.BatchCopy','U') IS NULL
CREATE TABLE dbo.BatchCopy
(
    ROOTGUID uniqueidentifier NOT NULL,
    ROOTOBJID int NOT NULL,
    ROOTOTID int NOT NULL,
    OGUID uniqueidentifier NOT NULL,
    OBJID int NOT NULL,
    OTID int NOT NULL,
    Created datetimeoffset(3) NOT NULL,
    CreatedTSHostId smallint NULL,
    Deleted datetimeoffset(3) NULL,
    DeletedTSHostId smallint NULL,
    Name nvarchar(256) NULL,
    Description nvarchar(max) NULL,
    Withdrawn bit NULL,
    ExAttribute nvarchar(max) NULL,
    PredecessorBatchId int NULL,
    ChainMode int NULL,
    ChainIgnorePredecessorState bit NULL,
    Quantity float NULL,
    ActQuantity float NULL,
    ProductName nvarchar(256) NULL,
    ProductCode nvarchar(256) NULL,
    ProductGUID uniqueidentifier NULL,
    ProductUoMId int NULL,
    FormulaCategoryName nvarchar(256) NULL,
    FormulaName nvarchar(256) NULL,
    FormulaVersion nvarchar(256) NULL,
    FormulaGUID uniqueidentifier NULL,
    FormulaId int NULL,
    MRecipeName nvarchar(256) NULL,
    MRecipeVersion nvarchar(256) NULL,
    MRecipeGUID uniqueidentifier NULL,
    MRecipeId int NULL,
    OrderId int NULL,
    ReleaseTime datetimeoffset(3) NULL,
    PlanStart datetimeoffset(3) NULL,
    PlanEnd datetimeoffset(3) NULL,
    ActStart datetimeoffset(3) NULL,
    ActEnd datetimeoffset(3) NULL,
    Mode int NULL,
    Export smallint NULL,
    State int NULL,
    ExState int NULL,
    ModifiedBits int NULL,
    PCellGUID uniqueidentifier NULL,
    PCellId int NULL,
    PartId int NULL,
    BatchReleaseGroupId int NULL,
    CreationDateTime datetimeoffset(3) NULL,
    ModificationDateTime datetimeoffset(3) NULL,
    BatchHasNoTags bit NULL,
    CurrentBatchDataId int NULL,
    GapTime int NULL,
    BatchVersion nvarchar(256) NULL,
    LastOSCDateTime datetimeoffset(3) NULL,
    MarkByOSC bit NULL,
    BatchTransferTime datetimeoffset(3) NULL
);
GO

IF OBJECT_ID('dbo.ParValueOnline_copy','U') IS NULL
CREATE TABLE dbo.ParValueOnline_copy
(
    ROOTGUID uniqueidentifier NOT NULL,
    POBJID int NOT NULL,
    POTID int NOT NULL,
    P2OBJID int NOT NULL,
    P2OTID int NOT NULL,
    OBJID int NOT NULL,
    ActivationCounter int NOT NULL,
    EventID bigint NOT NULL,
    [TimeStamp] datetimeoffset(3) NOT NULL,
    Name nvarchar(256) NOT NULL,
    EventNotifyType int NOT NULL,
    UsageId int NULL,
    DataTypeId int NULL,
    DataTypeName nvarchar(256) NULL,
    UoMId int NULL,
    UoMName nvarchar(256) NULL,
    HighValue float NULL,
    LowValue float NULL,
    RecHighValue float NULL,
    RecLowValue float NULL,
    sp_float float NULL,
    asp_float float NULL,
    av_float float NULL,
    sp_int int NULL,
    asp_int int NULL,
    av_int int NULL,
    sp_string nvarchar(256) NULL,
    asp_string nvarchar(256) NULL,
    av_string nvarchar(256) NULL,
    loc_unitallocname nvarchar(256) NULL,
    loc_unitname nvarchar(256) NULL,
    sp_locname nvarchar(256) NULL,
    asp_locname nvarchar(256) NULL,
    av_locname nvarchar(256) NULL,
    sp_matname nvarchar(256) NULL,
    sp_matcode nvarchar(256) NULL,
    asp_matname nvarchar(256) NULL,
    asp_matcode nvarchar(256) NULL,
    av_matname nvarchar(256) NULL,
    av_matcode nvarchar(256) NULL,
    sp_EnumValue nvarchar(256) NULL,
    asp_EnumValue nvarchar(256) NULL,
    av_EnumValue nvarchar(256) NULL,
    sp_Unit nvarchar(256) NULL,
    asp_Unit nvarchar(256) NULL,
    av_Unit nvarchar(256) NULL,
    sp_prot int NULL,
    asp_prot int NULL,
    av_prot int NULL
);
GO

IF OBJECT_ID('dbo.OrderDetails','U') IS NULL
CREATE TABLE dbo.OrderDetails
(
    ROOTGUID uniqueidentifier NOT NULL,
    OrderId int NOT NULL,
    OrderName nvarchar(256) NULL,
    OrderCategory nvarchar(256) NULL,
    CreationDateTime datetimeoffset(7) NULL,
    Quantity float NULL,
    Description nvarchar(max) NULL
);
GO
PRINT 'OS2 ASMBatchReports targets created (mirror of OS1). Next: 20 (indexes+log), 30 (triggers).';
GO

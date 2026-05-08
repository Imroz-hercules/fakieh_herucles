-- Optional nonclustered indexes for dbo.BatchMaterials (ASMBatchReports).
-- Review with actual execution plans before applying in production; run during maintenance window.

-- IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BatchMaterials_BatchTransferTime' AND object_id = OBJECT_ID(N'dbo.BatchMaterials'))
--     DROP INDEX IX_BatchMaterials_BatchTransferTime ON dbo.BatchMaterials;
-- CREATE NONCLUSTERED INDEX IX_BatchMaterials_BatchTransferTime
--     ON dbo.BatchMaterials ([Batch Transfer Time])
--     INCLUDE ([Batch GUID], [OrderId], [Material Name], [Batch Act Start], [Product Name]);

-- IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BatchMaterials_BatchActStart' AND object_id = OBJECT_ID(N'dbo.BatchMaterials'))
--     DROP INDEX IX_BatchMaterials_BatchActStart ON dbo.BatchMaterials;
-- CREATE NONCLUSTERED INDEX IX_BatchMaterials_BatchActStart
--     ON dbo.BatchMaterials ([Batch Act Start])
--     INCLUDE ([Batch GUID], [OrderId], [Material Name], [Product Name]);

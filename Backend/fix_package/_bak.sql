SET NOCOUNT ON;
DECLARE @p nvarchar(512) = CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(512));
IF @p IS NULL OR @p = N'' SET @p = N'C:\Temp';
IF RIGHT(@p,1) = '\' SET @p = LEFT(@p, LEN(@p)-1);
DECLARE @f nvarchar(700) = @p + N'\ASMBatchReports_prehotfix_20260620.bak';
BACKUP DATABASE ASMBatchReports TO DISK = @f WITH COPY_ONLY, INIT, CHECKSUM, STATS = 25;
PRINT 'BACKUP_FILE=' + @f;

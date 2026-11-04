BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[companies] ADD [department] NVARCHAR(30);

-- La columna es nueva en este mismo lote: el índice y el CHECK van en EXEC para que se
-- compilen después del ALTER (si no, SQL Server responde "Invalid column name").

-- CreateIndex
EXEC(N'CREATE NONCLUSTERED INDEX [companies_department_status_idx] ON [dbo].[companies]([department], [status]);');

-- Valores permitidos (DEPARTMENTS en @axiom/contracts; schema-consistency.test.ts lo verifica).
EXEC(N'ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_department_check]
  CHECK ([department] IS NULL OR [department] IN (N''BOACO'', N''CARAZO'', N''CHINANDEGA'', N''CHONTALES'',
    N''COSTA_CARIBE_NORTE'', N''COSTA_CARIBE_SUR'', N''ESTELI'', N''GRANADA'', N''JINOTEGA'', N''LEON'',
    N''MADRIZ'', N''MANAGUA'', N''MASAYA'', N''MATAGALPA'', N''NUEVA_SEGOVIA'', N''RIO_SAN_JUAN'', N''RIVAS''));');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

BEGIN TRY

BEGIN TRAN;

-- CreateIndex
CREATE NONCLUSTERED INDEX [companies_sectorId_status_idx] ON [dbo].[companies]([sectorId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [contracts_status_endDate_idx] ON [dbo].[contracts]([status], [endDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [interactions_userId_companyId_occurredAt_idx] ON [dbo].[interactions]([userId], [companyId], [occurredAt]);

-- ─── SQL añadido a mano: reglas de contratos (ADR 0005) ───
ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [contracts_dates_check]
  CHECK ([endDate] IS NULL OR [endDate] >= [startDate]);

ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [contracts_currency_check]
  CHECK ([currency] IN (N'NIO', N'USD'));

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

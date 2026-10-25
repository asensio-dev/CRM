BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] INT NOT NULL IDENTITY(1,1),
    [email] NVARCHAR(150) NOT NULL,
    [fullName] NVARCHAR(150) NOT NULL,
    [passwordHash] NVARCHAR(255) NOT NULL,
    [role] NVARCHAR(20) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [users_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[refresh_tokens] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [tokenHash] NVARCHAR(255) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [refresh_tokens_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [refresh_tokens_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[economic_sectors] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(60) NOT NULL,
    CONSTRAINT [economic_sectors_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [economic_sectors_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[economic_activities] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(200) NOT NULL,
    CONSTRAINT [economic_activities_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [economic_activities_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[companies] (
    [id] INT NOT NULL IDENTITY(1,1),
    [ruc] NVARCHAR(20) NOT NULL,
    [legalName] NVARCHAR(200) NOT NULL,
    [tradeName] NVARCHAR(200),
    [legalRepName] NVARCHAR(100),
    [legalRepIdNumber] NVARCHAR(20),
    [employeeCount] INT NOT NULL CONSTRAINT [companies_employeeCount_df] DEFAULT 0,
    [phone] NVARCHAR(20),
    [shippingAddress] NVARCHAR(300),
    [particularAddress] NVARCHAR(300),
    [activityId] INT,
    [sectorId] INT,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [companies_status_df] DEFAULT 'POR_CONTACTAR',
    [lastContactAt] DATETIME2,
    [source] NVARCHAR(20) NOT NULL CONSTRAINT [companies_source_df] DEFAULT 'MANUAL',
    [version] INT NOT NULL CONSTRAINT [companies_version_df] DEFAULT 0,
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [companies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [companies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [companies_ruc_key] UNIQUE NONCLUSTERED ([ruc])
);

-- CreateTable
CREATE TABLE [dbo].[company_branches] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [tradeName] NVARCHAR(200),
    [address] NVARCHAR(300),
    [phone] NVARCHAR(20),
    [employeeCount] INT NOT NULL CONSTRAINT [company_branches_employeeCount_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [company_branches_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [company_branches_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[interactions] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [userId] INT NOT NULL,
    [planItemId] INT,
    [channel] NVARCHAR(20) NOT NULL,
    [outcome] NVARCHAR(30) NOT NULL,
    [notes] NVARCHAR(2000),
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [interactions_occurredAt_df] DEFAULT CURRENT_TIMESTAMP,
    [nextFollowUpAt] DATETIME2,
    CONSTRAINT [interactions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[status_history] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [userId] INT NOT NULL,
    [fromStatus] NVARCHAR(30),
    [toStatus] NVARCHAR(30) NOT NULL,
    [note] NVARCHAR(1000),
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [status_history_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [status_history_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[rotation_cycles] (
    [id] INT NOT NULL IDENTITY(1,1),
    [number] INT NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE NOT NULL,
    [closedAt] DATETIME2,
    CONSTRAINT [rotation_cycles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [rotation_cycles_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[portfolio_assignments] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [userId] INT NOT NULL,
    [cycleId] INT NOT NULL,
    [assignedAt] DATETIME2 NOT NULL CONSTRAINT [portfolio_assignments_assignedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [releasedAt] DATETIME2,
    [releaseReason] NVARCHAR(30),
    [cyclesWithoutProgress] INT NOT NULL CONSTRAINT [portfolio_assignments_cyclesWithoutProgress_df] DEFAULT 0,
    CONSTRAINT [portfolio_assignments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[weekly_plans] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT NOT NULL,
    [cycleId] INT NOT NULL,
    [weekNumber] INT NOT NULL,
    [weekStart] DATE NOT NULL,
    [quota] INT NOT NULL,
    [generatedAt] DATETIME2 NOT NULL CONSTRAINT [weekly_plans_generatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [weekly_plans_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [weekly_plans_userId_weekStart_key] UNIQUE NONCLUSTERED ([userId],[weekStart])
);

-- CreateTable
CREATE TABLE [dbo].[weekly_plan_items] (
    [id] INT NOT NULL IDENTITY(1,1),
    [planId] INT NOT NULL,
    [companyId] INT NOT NULL,
    [priority] INT NOT NULL,
    [reason] NVARCHAR(30) NOT NULL,
    [contactedAt] DATETIME2,
    CONSTRAINT [weekly_plan_items_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [weekly_plan_items_planId_companyId_key] UNIQUE NONCLUSTERED ([planId],[companyId])
);

-- CreateTable
CREATE TABLE [dbo].[appointments] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [userId] INT NOT NULL,
    [scheduledAt] DATETIME2 NOT NULL,
    [mode] NVARCHAR(20) NOT NULL,
    [location] NVARCHAR(300),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [appointments_status_df] DEFAULT 'PROGRAMADA',
    [notes] NVARCHAR(2000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [appointments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [appointments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[contracts] (
    [id] INT NOT NULL IDENTITY(1,1),
    [companyId] INT NOT NULL,
    [code] NVARCHAR(30) NOT NULL,
    [startDate] DATE NOT NULL,
    [endDate] DATE,
    [amount] DECIMAL(18,2) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL CONSTRAINT [contracts_currency_df] DEFAULT 'NIO',
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [contracts_status_df] DEFAULT 'BORRADOR',
    [notes] NVARCHAR(2000),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [contracts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [contracts_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [contracts_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[settings] (
    [key] NVARCHAR(60) NOT NULL,
    [value] NVARCHAR(500) NOT NULL,
    [description] NVARCHAR(300),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [settings_pkey] PRIMARY KEY CLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[import_jobs] (
    [id] INT NOT NULL IDENTITY(1,1),
    [fileName] NVARCHAR(260) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [import_jobs_status_df] DEFAULT 'PENDIENTE',
    [totalRows] INT NOT NULL CONSTRAINT [import_jobs_totalRows_df] DEFAULT 0,
    [insertedCount] INT NOT NULL CONSTRAINT [import_jobs_insertedCount_df] DEFAULT 0,
    [updatedCount] INT NOT NULL CONSTRAINT [import_jobs_updatedCount_df] DEFAULT 0,
    [branchCount] INT NOT NULL CONSTRAINT [import_jobs_branchCount_df] DEFAULT 0,
    [rejectedCount] INT NOT NULL CONSTRAINT [import_jobs_rejectedCount_df] DEFAULT 0,
    [errorMessage] NVARCHAR(2000),
    [createdById] INT,
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [import_jobs_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [finishedAt] DATETIME2,
    CONSTRAINT [import_jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[import_rejections] (
    [id] INT NOT NULL IDENTITY(1,1),
    [jobId] INT NOT NULL,
    [rowNumber] INT NOT NULL,
    [reason] NVARCHAR(300) NOT NULL,
    [rawData] NVARCHAR(max) NOT NULL,
    CONSTRAINT [import_rejections_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_userId_idx] ON [dbo].[refresh_tokens]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [companies_status_idx] ON [dbo].[companies]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [companies_legalName_idx] ON [dbo].[companies]([legalName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [companies_tradeName_idx] ON [dbo].[companies]([tradeName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [companies_sectorId_activityId_idx] ON [dbo].[companies]([sectorId], [activityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [companies_lastContactAt_idx] ON [dbo].[companies]([lastContactAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [company_branches_companyId_idx] ON [dbo].[company_branches]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [interactions_companyId_occurredAt_idx] ON [dbo].[interactions]([companyId], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [interactions_userId_occurredAt_idx] ON [dbo].[interactions]([userId], [occurredAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [interactions_nextFollowUpAt_idx] ON [dbo].[interactions]([nextFollowUpAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [status_history_companyId_changedAt_idx] ON [dbo].[status_history]([companyId], [changedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [status_history_toStatus_changedAt_idx] ON [dbo].[status_history]([toStatus], [changedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [portfolio_assignments_userId_releasedAt_idx] ON [dbo].[portfolio_assignments]([userId], [releasedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [portfolio_assignments_companyId_idx] ON [dbo].[portfolio_assignments]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [weekly_plan_items_companyId_idx] ON [dbo].[weekly_plan_items]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [appointments_userId_scheduledAt_idx] ON [dbo].[appointments]([userId], [scheduledAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [appointments_companyId_idx] ON [dbo].[appointments]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [contracts_companyId_idx] ON [dbo].[contracts]([companyId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [contracts_status_idx] ON [dbo].[contracts]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [import_rejections_jobId_idx] ON [dbo].[import_rejections]([jobId]);

-- AddForeignKey
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_activityId_fkey] FOREIGN KEY ([activityId]) REFERENCES [dbo].[economic_activities]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_sectorId_fkey] FOREIGN KEY ([sectorId]) REFERENCES [dbo].[economic_sectors]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_branches] ADD CONSTRAINT [company_branches_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[interactions] ADD CONSTRAINT [interactions_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[interactions] ADD CONSTRAINT [interactions_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[interactions] ADD CONSTRAINT [interactions_planItemId_fkey] FOREIGN KEY ([planItemId]) REFERENCES [dbo].[weekly_plan_items]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[status_history] ADD CONSTRAINT [status_history_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[status_history] ADD CONSTRAINT [status_history_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[portfolio_assignments] ADD CONSTRAINT [portfolio_assignments_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[portfolio_assignments] ADD CONSTRAINT [portfolio_assignments_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[portfolio_assignments] ADD CONSTRAINT [portfolio_assignments_cycleId_fkey] FOREIGN KEY ([cycleId]) REFERENCES [dbo].[rotation_cycles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[weekly_plans] ADD CONSTRAINT [weekly_plans_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[weekly_plans] ADD CONSTRAINT [weekly_plans_cycleId_fkey] FOREIGN KEY ([cycleId]) REFERENCES [dbo].[rotation_cycles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[weekly_plan_items] ADD CONSTRAINT [weekly_plan_items_planId_fkey] FOREIGN KEY ([planId]) REFERENCES [dbo].[weekly_plans]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[weekly_plan_items] ADD CONSTRAINT [weekly_plan_items_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[appointments] ADD CONSTRAINT [appointments_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[appointments] ADD CONSTRAINT [appointments_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [contracts_companyId_fkey] FOREIGN KEY ([companyId]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [contracts_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[import_jobs] ADD CONSTRAINT [import_jobs_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[import_rejections] ADD CONSTRAINT [import_rejections_jobId_fkey] FOREIGN KEY ([jobId]) REFERENCES [dbo].[import_jobs]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- ─── SQL añadido a mano (code first + --create-only) ───
-- Prisma no soporta enum en SQL Server: se restringen los valores con CHECK.
-- Los valores deben coincidir con @axiom/contracts.

ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_role_check]
  CHECK ([role] IN (N'ADMIN', N'SUPERVISOR', N'EJECUTIVO'));

ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_status_check]
  CHECK ([status] IN (N'POR_CONTACTAR', N'CONTACTADO', N'SIN_RESPUESTA', N'CON_RESPUESTA',
                      N'AGENDANDO_CITA', N'EN_PROCESO_CONTRATO', N'CONTRATO_ACTIVO', N'DESCARTADO'));

ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_source_check]
  CHECK ([source] IN (N'EXCEL', N'MANUAL'));

ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_employee_count_check]
  CHECK ([employeeCount] >= 0);

ALTER TABLE [dbo].[status_history] ADD CONSTRAINT [status_history_to_status_check]
  CHECK ([toStatus] IN (N'POR_CONTACTAR', N'CONTACTADO', N'SIN_RESPUESTA', N'CON_RESPUESTA',
                        N'AGENDANDO_CITA', N'EN_PROCESO_CONTRATO', N'CONTRATO_ACTIVO', N'DESCARTADO'));

ALTER TABLE [dbo].[interactions] ADD CONSTRAINT [interactions_channel_check]
  CHECK ([channel] IN (N'LLAMADA', N'WHATSAPP', N'CORREO', N'VISITA', N'OTRO'));

ALTER TABLE [dbo].[interactions] ADD CONSTRAINT [interactions_outcome_check]
  CHECK ([outcome] IN (N'CONTESTO', N'NO_CONTESTO', N'NUMERO_EQUIVOCADO', N'INTERESADO',
                       N'NO_INTERESADO', N'VOLVER_A_LLAMAR'));

ALTER TABLE [dbo].[portfolio_assignments] ADD CONSTRAINT [portfolio_assignments_release_reason_check]
  CHECK ([releaseReason] IS NULL OR [releaseReason] IN (N'SIN_AVANCE', N'REASIGNACION_MANUAL',
                                                        N'CONTRATO_ACTIVO', N'DESCARTADO'));

ALTER TABLE [dbo].[weekly_plans] ADD CONSTRAINT [weekly_plans_week_check]
  CHECK ([weekNumber] >= 1 AND [quota] >= 0);

ALTER TABLE [dbo].[weekly_plan_items] ADD CONSTRAINT [weekly_plan_items_reason_check]
  CHECK ([reason] IN (N'SEGUIMIENTO', N'NUEVA', N'REINTENTO', N'ROTACION'));

ALTER TABLE [dbo].[appointments] ADD CONSTRAINT [appointments_mode_check]
  CHECK ([mode] IN (N'PRESENCIAL', N'VIRTUAL', N'TELEFONICA'));

ALTER TABLE [dbo].[appointments] ADD CONSTRAINT [appointments_status_check]
  CHECK ([status] IN (N'PROGRAMADA', N'REALIZADA', N'CANCELADA', N'REPROGRAMADA'));

ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [contracts_status_check]
  CHECK ([status] IN (N'BORRADOR', N'ENVIADO', N'FIRMADO', N'ACTIVO', N'CANCELADO', N'VENCIDO'));

ALTER TABLE [dbo].[contracts] ADD CONSTRAINT [contracts_amount_check]
  CHECK ([amount] >= 0);

ALTER TABLE [dbo].[import_jobs] ADD CONSTRAINT [import_jobs_status_check]
  CHECK ([status] IN (N'PENDIENTE', N'PROCESANDO', N'COMPLETADO', N'FALLIDO'));

-- Una empresa solo puede tener UNA asignación de cartera activa (índice único filtrado).
CREATE UNIQUE NONCLUSTERED INDEX [portfolio_assignments_one_active_per_company]
  ON [dbo].[portfolio_assignments]([companyId]) WHERE [releasedAt] IS NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

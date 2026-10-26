-- ─── Índices de rendimiento (Ola 4, prueba de carga en QA con los datos reales) ───
-- Escrita a mano: Prisma no modela INCLUDE. Todos los nombres se declaran en schema.prisma (con
-- `map:` cuando no es el nombre por defecto), así que `prisma migrate diff` queda vacío.
-- Contexto, medidas antes/después y consultas afectadas: docs/rendimiento-qa.md.
--
-- Idea común: el listado de empresas pagina en dos pasos (primero solo los `id` de la página, luego
-- las columnas por clave primaria). Si el índice que da el orden lleva incluidas las columnas de
-- filtro, SQL Server lo recorre en orden y para en la página pedida, sin ir a la tabla por cada fila.

BEGIN TRY
BEGIN TRAN;

-- 1) Búsqueda por texto (listado y tablero con `q`): el LIKE '%…%' recorre este índice; con las
--    columnas de orden y filtro incluidas ya no hace falta una búsqueda de clave por coincidencia
--    (con términos frecuentes eran >17 k por consulta).
DROP INDEX [companies_searchText_idx] ON [dbo].[companies];
CREATE NONCLUSTERED INDEX [companies_searchText_idx] ON [dbo].[companies]([searchText])
  INCLUDE ([legalName], [status], [lastContactAt], [employeeCount], [sectorId], [activityId]);

-- 2) Listado filtrado por estado (+ sector / actividad / teléfono / empleados) ordenado por razón social.
DROP INDEX [companies_status_legalName_idx] ON [dbo].[companies];
CREATE NONCLUSTERED INDEX [companies_status_legalName_idx]
  ON [dbo].[companies]([status], [legalName])
  INCLUDE ([sectorId], [activityId], [phone], [employeeCount]);

-- 3) Listado filtrado por estado ordenado por número de empleados (cualquier sentido).
CREATE NONCLUSTERED INDEX [companies_status_employeeCount_idx]
  ON [dbo].[companies]([status], [employeeCount])
  INCLUDE ([sectorId], [activityId], [phone]);

-- 4) Tablero con filtro de sector / actividad: las tarjetas salen del índice sin ir a la tabla.
DROP INDEX [companies_board_idx] ON [dbo].[companies];
CREATE NONCLUSTERED INDEX [companies_board_idx]
  ON [dbo].[companies]([status], [lastContactAt], [employeeCount] DESC, [id])
  INCLUDE ([legalName], [tradeName], [phone], [sectorId], [activityId]);

-- 5) Totales del listado por sector + estado (+ teléfono / empleados): solo lectura del índice.
DROP INDEX [companies_sectorId_status_idx] ON [dbo].[companies];
CREATE NONCLUSTERED INDEX [companies_sectorId_status_idx]
  ON [dbo].[companies]([sectorId], [status])
  INCLUDE ([phone], [employeeCount]);

-- 6) Cartera activa de un ejecutivo (my-week, assignments, analytics por usuario) sin búsquedas de clave.
DROP INDEX [portfolio_assignments_userId_releasedAt_idx] ON [dbo].[portfolio_assignments];
CREATE NONCLUSTERED INDEX [portfolio_assignments_userId_releasedAt_idx]
  ON [dbo].[portfolio_assignments]([userId], [releasedAt])
  INCLUDE ([companyId], [cycleId], [assignedAt]);

-- 7) Analytics por ejecutivo: avances / estados alcanzados (status_history por usuario y fecha).
CREATE NONCLUSTERED INDEX [status_history_userId_changedAt_idx]
  ON [dbo].[status_history]([userId], [changedAt])
  INCLUDE ([companyId], [fromStatus], [toStatus]);

-- 8) Analytics del equipo (supervisor): interacciones por rango de fechas.
CREATE NONCLUSTERED INDEX [interactions_occurredAt_idx]
  ON [dbo].[interactions]([occurredAt])
  INCLUDE ([userId], [companyId], [outcome]);

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW
END CATCH

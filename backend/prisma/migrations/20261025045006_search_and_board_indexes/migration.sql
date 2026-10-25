-- ─── Índices de rendimiento (Ola 2) ───
-- Escrita a mano: Prisma no modela columnas calculadas, collations por columna ni INCLUDE.
-- Prisma no detecta estos objetos como "drift", así que futuras migraciones no los borran.
-- (verificado con `prisma migrate diff --from-config-datasource --to-schema`).

BEGIN TRY
BEGIN TRAN;

-- 1) Búsqueda de texto en empresas.
--    LIKE '%x%' con Modern_Spanish_CI_AS cuesta ~900 ms de CPU sobre 103 k filas (comparaciones
--    lingüísticas). Una columna calculada PERSISTED normalizada (mayúsculas, sin tildes) con
--    collation binaria + índice estrecho baja a ~45 ms. Full-Text Search no está instalado.
--    La app debe buscar con `normalizeSearchText()` de @axiom/contracts (misma normalización).
ALTER TABLE [dbo].[companies] ADD [searchText] AS
  CAST(TRANSLATE(UPPER(CONCAT([ruc], N' ', [legalName], N' ', [tradeName])),
                 N'ÁÉÍÓÚÜÑÀÈÌÒÙ', N'AEIOUUNAEIOU') AS NVARCHAR(450))
  COLLATE Latin1_General_100_BIN2 PERSISTED;

CREATE NONCLUSTERED INDEX [companies_searchText_idx] ON [dbo].[companies]([searchText]);

-- 2) Tablero del pipeline: top N por estado ordenado por lastContactAt / employeeCount
--    sin ir a la tabla base (columnas de la tarjeta incluidas).
CREATE NONCLUSTERED INDEX [companies_board_idx]
  ON [dbo].[companies]([status], [lastContactAt], [employeeCount] DESC, [id])
  INCLUDE ([legalName], [tradeName], [phone]);

-- 3) Listado de empresas filtrado por estado y ordenado por razón social.
CREATE NONCLUSTERED INDEX [companies_status_legalName_idx]
  ON [dbo].[companies]([status], [legalName]);

COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW
END CATCH

# ADR 0002 — Importación masiva del Excel

- **Estado:** aceptado (2026-10-24)

## Contexto

El Excel fuente tiene ~127 k filas con datos personales. Debe cargarse en minutos, de forma repetible, sin cargar el archivo completo en memoria y sin duplicar datos al re-ejecutar.

## Decisión

- **Lectura en streaming** con `exceljs` (`stream.xlsx.WorkbookReader`) detrás del puerto `SpreadsheetRowSource`; la normalización y deduplicación son funciones puras de dominio.
- **Escritura por lotes de 100 empresas** (`CompanyImportWriter`): SQL Server admite 2 100 parámetros por sentencia y una fila de `companies` usa ~14 columnas. `createMany` no tiene `skipDuplicates` en SQL Server, por lo que se deduplica en memoria (primera fila de un RUC = empresa; el resto = `CompanyBranch`; filas con igual tradeName+dirección+teléfono se omiten) y contra la base (consulta de RUC existentes por lote).
- **El ETL se salta el dominio de `companies` a propósito**: instanciar un agregado `Company` por fila, validar transiciones y publicar eventos para 127 k filas multiplica el coste sin aportar reglas (las empresas importadas nacen `POR_CONTACTAR`, versión 0). El adaptador `PrismaCompanyImportWriter` escribe con Prisma directamente. Si cambia el esquema de `companies`, hay que revisar este adaptador.
- **Idempotencia**: empresa existente con `source = EXCEL` → se actualizan solo campos base (nombres, representante, empleados, teléfono, direcciones, actividad, sector) y únicamente si cambiaron; **nunca** `status`, `version`, `lastContactAt` ni `createdById`. Empresa `MANUAL` → intacta (y sus sucursales). Las sucursales ya existentes (misma clave tradeName+dirección+teléfono) no se duplican.
- Sin transacción global por lote: un fallo a mitad deja datos parciales válidos y la re-ejecución los completa.
- **Longitudes**: los textos que exceden su columna se recortan y la fila se cuenta como `truncatedRows`; la cédula demasiado larga se descarta (un identificador recortado sería falso). Solo se rechazan filas sin RUC, con RUC inválido (> 20 caracteres) o sin razón social. Teléfono inválido o ausente no rechaza.
- Los rechazos guardan la fila original (`rawData`) **solo en la base de datos**; la API (`ImportRejectionDto`) expone número de fila y motivo, nunca datos personales.
- Entradas: CLI `bun run db:import <xlsx>` y `POST /api/import` (solo ADMIN, `.xlsx` ≤ 50 MB, 202 + consulta por `GET /api/import/:id`).

## Consecuencias

- Re-ejecutar el import es seguro y barato (sin cambios no hay `UPDATE`).
- Las filas con el mismo RUC que aparecen tras un rechazo de la primera fila se tratan como empresa (la primera fila *válida* crea la empresa).

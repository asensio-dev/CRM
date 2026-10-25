# ADR 0004 — Índices de búsqueda y tablero

- **Estado:** aceptado (2026-10-25)
- **Migración:** `backend/prisma/migrations/*_search_and_board_indexes`

## Contexto

Con las 103 657 empresas reales, `GET /api/companies?q=ferreteria` tardaba ~1,3 s: `LIKE '%x%'` sobre tres columnas
con la collation lingüística `Modern_Spanish_CI_AS` cuesta ~900 ms de CPU. Full-Text Search no está instalado en el servidor.

## Decisión

1. Columna calculada **PERSISTED** `companies.searchText` = `TRANSLATE(UPPER(ruc + ' ' + legalName + ' ' + tradeName), tildes/Ñ → ASCII)`
   con collation `Latin1_General_100_BIN2` e índice propio. Las búsquedas usan `normalizeSearchText()` de `@axiom/contracts`
   (misma normalización en JS).
2. Índice cubriente del tablero: `(status, lastContactAt, employeeCount DESC, id) INCLUDE (legalName, tradeName, phone)`.
3. Índice `(status, legalName)` para listados filtrados por estado.

| Consulta (API, BD local) | Antes | Después |
|---|---|---|
| Búsqueda de empresas por texto | 1 269 ms | ~140 ms |
| Tablero kanban sin texto | 171 ms | 39 ms |
| Tablero kanban con texto | — | 77 ms |

## Consecuencias

- `searchText` está declarada en `schema.prisma` (si no, `migrate dev` intenta borrarla) pero es **solo lectura**: nunca se escribe.
- Los tres índices también se declaran en el schema con `map:` para que Prisma no los detecte como drift
  (Prisma no compara `INCLUDE` ni la collation). Verificado con `prisma migrate diff --from-config-datasource --to-schema` → vacío.
- Las columnas calculadas indexadas exigen `QUOTED_IDENTIFIER ON` al escribir en `companies`. Prisma/tedious lo usan por defecto;
  con `sqlcmd` hay que pasar `-I`.
- Si cambia la normalización hay que cambiar a la vez la columna (migración nueva) y `normalizeSearchText`.

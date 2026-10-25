# ADR 0001 — Stack y arquitectura base

- **Estado:** aceptado (2026-10-24)

## Decisión

| Tema | Elección | Motivo |
|---|---|---|
| Runtime | Bun 1.4.4 | Requisito; ejecuta TypeScript y decoradores sin paso de build |
| API | NestJS 12 (ESM) + `@nestjs/platform-express` | Verificado arrancando sobre Bun en Ola 0 |
| ORM | Prisma 7.10 con `prisma-client` generator (`runtime = "bun"`) y `@prisma/adapter-mssql` | Prisma 7 exige driver adapter; la URL vive en `prisma.config.ts`, no en el schema |
| TypeScript | 6.0.3 (no 7) | dependency-cruiser aún no soporta la API de TS 7 y analizaba 0 módulos en silencio |
| Lint/format | Biome 2 | Una sola herramienta rápida en lugar de ESLint + Prettier |
| Arquitectura | Hexagonal por módulo, verificada con dependency-cruiser | Ver `backend/.dependency-cruiser.cjs` |
| Transacciones | `PrismaService.db` + `AsyncLocalStorage` | Los repositorios participan en la transacción de `UnitOfWork.run` sin recibir el cliente por parámetro |
| Ids | `Int IDENTITY` | Mejor para el índice clúster con 127 k+ filas que UUID aleatorios |

## Consecuencias

- Prisma no soporta `enum` en SQL Server: estados como `NVARCHAR` + `CHECK` escrito a mano (`migrate dev --create-only`) y valores en `@axiom/contracts`, sincronizados por `schema-consistency.test.ts`.
- Todas las FKs con `NO ACTION` (salvo sucursales e ítems de plan) para evitar el error de SQL Server de *multiple cascade paths*; los usuarios se desactivan, no se borran.
- Prisma 7 no carga `.env` por sí solo: `prisma.config.ts` usa `process.loadEnvFile`.
- Se incluyó el estado `DESCARTADO` (propuesto en el plan). Si se decide no usarlo, se elimina con una migración nueva.

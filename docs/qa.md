# Entorno QA (tipo producción)

Base `AxiomCRM_QA` en el mismo servidor SQL que el desarrollo local, preparada como en producción: migraciones con
`migrate deploy`, API con `NODE_ENV=production` y logins de mínimo privilegio. **Nunca toca `AxiomCRM` (desarrollo) ni
`AxiomCRM_Test` (pruebas).** Resultados de la prueba de carga: [rendimiento-qa.md](rendimiento-qa.md).

## 1. Preparar (idempotente)

```bash
cd backend
bun run qa:setup                 # crea/actualiza todo; --reset borra la base y empieza de cero
```

`scripts/qa-env.ts setup` hace, en orden:

1. Crea `AxiomCRM_QA` (`Modern_Spanish_CI_AS`) si no existe, con autenticación de Windows (`sqlcmd -E`, el SQL viaja por
   stdin). Opciones `--server` y `--port` la primera vez.
2. Crea o actualiza dos logins (contraseñas generadas, `CHECK_POLICY = ON`):

   | Login | Permisos en `AxiomCRM_QA` | Uso |
   |---|---|---|
   | `axiom_qa_migrator` | `db_ddladmin` + `db_datareader` + `db_datawriter` | solo `prisma migrate deploy` / `migrate diff` |
   | `axiom_qa_app` | `db_datareader` + `db_datawriter` + `GRANT EXECUTE` (sin DDL ni `db_owner`) | API, seed, importación y scripts |

   Si por error el login de la app es miembro de `db_owner`, `db_ddladmin` o `db_securityadmin`, se le quita.
3. `prisma migrate deploy` (login de migración) y `prisma migrate status` → debe decir *up to date*.
4. `prisma db seed` con el login de la **aplicación** (parámetros, sectores y administrador `admin@axiom.qa`).
5. Usuarios QA: `qa.ejecutivo01…10@axiom.qa` (EJECUTIVO) y `qa.supervisor1…2@axiom.qa` (SUPERVISOR), todos con la
   contraseña `QA_USER_PASSWORD`.
6. Comprobaciones: collation, nº de migraciones, `CHECK` (17), índice único filtrado de la cartera, columna calculada
   `searchText` persistida, lista de índices, **drift vacío** (`prisma migrate diff --from-config-datasource --to-schema`)
   y que el login de la app **no puede** crear tablas (`CREATE TABLE` debe fallar). Falla con código ≠ 0 si algo no cuadra.

Las contraseñas y secretos JWT se generan la primera vez y se guardan **solo** en `backend/.env.qa` (patrón `.env.*` del
`.gitignore`). El script nunca los imprime y los reutiliza en ejecuciones siguientes. Bórralo cuando termines (§5).

`bun scripts/qa-env.ts verify` repite solo el paso 6.

## 2. Cargar datos reales y actividad

```bash
cd backend
# Importación del Excel (ruta fuera del repo; contiene datos personales)
bun scripts/qa-env.ts run -- bun scripts/import-companies.ts "<ruta>/Empresas Nicaragua.xlsx"
# 8 semanas de actividad simulada sobre 4 000 empresas, repartidas entre los 10 ejecutivos QA
bun scripts/qa-env.ts run -- bun scripts/seed-activity.ts --weeks 8 --companies 4000 --seed 7
# Rotación semanal real (ciclo, carteras de 60, planes de 20)
bun scripts/qa-env.ts rotate
# Actividad de la semana en curso sobre la cartera
bun scripts/qa-env.ts run -- bun scripts/seed-activity.ts --weeks 1 --companies 250 --seed 11 --force
```

`run -- <comando>` ejecuta cualquier comando con el entorno QA (login de la app). Bun carga `backend/.env` (desarrollo) en
cada proceso de `backend/`, pero las variables del proceso ganan, así que `qa-env.ts` fija explícitamente `DATABASE_URL` y
vacía `SHADOW_DATABASE_URL` / `SEED_DEMO_PASSWORD`; además aborta si la URL no apunta a `AxiomCRM_QA`.

## 3. API en modo producción

```bash
cd backend
bun scripts/qa-env.ts api        # NODE_ENV=production, PORT=3100, TRUST_PROXY=loopback, login axiom_qa_app
```

Comprobaciones: `GET http://localhost:3100/api/health` → `{"status":"ok","database":"up"}` y `GET /api/docs` → 404.
Para pararla, corta el proceso que escucha en el puerto 3100 (en Windows `qa-env.ts api` lanza un proceso hijo: si cierras
solo la consola padre, comprueba el puerto).

Frontend de producción: `bun run --filter @axiom/frontend build` y `cd frontend && bunx vite preview --port 4173`.

## 4. Prueba de carga

```bash
cd backend
# qa:load = bun scripts/qa-env.ts run -- bun scripts/load-test.ts (con la API de §3 en marcha)
bun run qa:load prime                                   # citas y contratos vía API (idempotente)
bun run qa:load --levels 1,10,30 --duration 30 --warmup 5 --out <archivo.json>
bun run qa:load --levels 30,60 --think 1000             # usuarios con pausa realista entre peticiones
```

Opciones: `--levels` (usuarios virtuales concurrentes), `--duration` / `--warmup` (s), `--think` (pausa media entre
peticiones, ms; 0 = bucle cerrado), `--only companies.,pipeline.board` (filtra operaciones), `--base`, `--out`.
Cada usuario virtual inicia sesión con un `X-Forwarded-For` propio (la API corre con `TRUST_PROXY=loopback`), igual que
detrás de un proxy, para no compartir el límite de 5 logins/min por IP. La salida son tablas p50/p95/p99 por operación,
sin datos de empresas.

Observación del lado de SQL Server (con `sqlcmd -E -I -d AxiomCRM_QA`):

```sql
ALTER DATABASE SCOPED CONFIGURATION CLEAR PROCEDURE_CACHE;      -- antes de medir (solo afecta a AxiomCRM_QA)
-- Consultas con más CPU
SELECT TOP 20 qs.execution_count, qs.total_worker_time / 1000 / qs.execution_count AS avg_cpu_ms,
       qs.total_logical_reads / qs.execution_count AS avg_reads, LEFT(st.text, 200) AS q
FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
WHERE st.dbid = DB_ID() OR st.dbid IS NULL ORDER BY qs.total_worker_time DESC;
-- Índices que el optimizador echa en falta
SELECT d.equality_columns, d.inequality_columns, d.included_columns, s.user_seeks, s.avg_user_impact
FROM sys.dm_db_missing_index_details d
JOIN sys.dm_db_missing_index_groups g ON g.index_handle = d.index_handle
JOIN sys.dm_db_missing_index_group_stats s ON s.group_handle = g.index_group_handle
WHERE d.database_id = DB_ID();
-- Interbloqueos acumulados desde el arranque del servidor
SELECT cntr_value FROM sys.dm_os_performance_counters
WHERE counter_name LIKE 'Number of Deadlocks/sec%' AND instance_name = '_Total';
```

## 5. Limpieza

- Borra `backend/.env.qa` cuando termines (contiene las contraseñas de los logins QA y de los usuarios QA).
- La base se deja en el servidor para repetir pruebas. Para eliminarla del todo (con `sqlcmd -E -I`):

  ```sql
  ALTER DATABASE [AxiomCRM_QA] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [AxiomCRM_QA];
  DROP LOGIN [axiom_qa_app];
  DROP LOGIN [axiom_qa_migrator];
  ```

- La base QA contiene los **datos personales** del Excel: mismas reglas que la de desarrollo (no copiarla, no
  exportarla, no compartir capturas con filas).

# Rendimiento en QA con los datos reales (Ola 4, T4.1)

Prueba de la API con las 127 197 filas reales del Excel, carteras y actividad simulada, en un entorno tipo producción.
Cómo reproducirla: [qa.md](qa.md). Fecha: 2026-10-25.

## 1. Entorno

| Pieza | Valor |
|---|---|
| Máquina | Windows 11 Pro, 8 CPU lógicas, 16 GB (portátil de desarrollo). El generador de carga corre en la misma máquina |
| SQL Server | 2022 Developer (16.0.4305, CU27), mismo host, base `AxiomCRM_QA` (`Modern_Spanish_CI_AS`) |
| API | 1 proceso Bun 1.4.4, `NODE_ENV=production`, `TRUST_PROXY=loopback`, login `axiom_qa_app` (lectura/escritura, sin DDL), pool del adaptador mssql por defecto (10 conexiones) |
| Migraciones | `prisma migrate deploy` con `axiom_qa_migrator` (`db_ddladmin`); `migrate status` al día y `migrate diff` vacío |

### Mínimo privilegio

La aplicación funciona **completa** con `db_datareader` + `db_datawriter` + `EXECUTE`: arranque, login/refresh, todos
los endpoints de la prueba (0 respuestas 5xx), seed, importación CLI, `seed-activity`, rotación semanal y las altas de citas
y contratos. No hace falta ningún permiso más. `EXECUTE` se concede por si en el futuro hay procedimientos; hoy no se usa.
`setup` comprueba además que el login de la app **no** puede crear tablas. `prisma migrate diff` necesita leer la
definición del esquema completo, por eso se ejecuta con el login de migración.

## 2. Volumen de datos

| Dato | Cantidad |
|---|---:|
| Filas del Excel | 127 197 |
| Empresas | 103 657 (4 793 sin teléfono) |
| Sucursales | 20 490 |
| Filas duplicadas omitidas | 3 004 |
| Actividades económicas / sectores | 893 / 9 |
| Rechazos | 46 (todos «RUC faltante») |
| Usuarios | 13 (admin + 10 EJECUTIVO + 2 SUPERVISOR) |
| Interacciones / cambios de estado | 7 432 / 11 693 (8 semanas simuladas + semana en curso) |
| Asignaciones activas / planes / ítems | 600 / 10 / 200 (ciclo 1, semana 1 de 3) |
| Citas / contratos | 437 / 299 (156 enviados) |
| Empresas por estado | POR_CONTACTAR 99 407 · CON_RESPUESTA 1 816 · SIN_RESPUESTA 1 092 · AGENDANDO_CITA 437 · DESCARTADO 307 · CONTACTADO 299 · EN_PROCESO_CONTRATO 182 · CONTRATO_ACTIVO 117 |

### Importación

| Ejecución | Duración | Resultado |
|---|---:|---|
| 1.ª (base vacía, índices originales) | 167 s | 103 657 empresas, 20 490 sucursales, 3 004 duplicadas, 893 actividades, 46 rechazos |
| 1.ª (base vacía, con la migración nueva) | 179 s | idéntico |
| 2.ª (idempotencia) | 22–23 s | 0 nuevas, 0 actualizadas, 103 657 sin cambios, 20 490 sucursales ya existentes |

Los conteos coinciden con el perfil conocido y con la importación de desarrollo. Los índices nuevos encarecen la carga
inicial ~7 %.

## 3. Método

`backend/scripts/load-test.ts`: usuarios virtuales (UV) en bucle cerrado, repartidos entre los 12 usuarios QA (cada uno
inicia sesión una vez con su propio `X-Forwarded-For`). Mezcla ponderada de 21 operaciones: ~90 % lecturas y ~10 %
escrituras sobre la propia cartera (registrar interacción con `planItemId`, cambio de estado con `expectedVersion`).
Lecturas: empresas (página 1, texto con 15 términos genéricos, filtros sector+estado+teléfono con 3 órdenes, páginas
profundas 2 000–4 100), ficha, tablero con y sin `q`, línea de tiempo, Mi semana, ciclo actual, asignaciones, analytics
(summary con y sin sector, funnel, weekly-activity, executives, cycle-coverage), citas y contratos.
30 s por nivel tras 5 s de calentamiento, caché de planes de `AxiomCRM_QA` vaciada antes de cada serie. Los datos son
deterministas (`--seed`), así que antes y después usan el mismo volumen.

> Un UV en bucle cerrado no espera entre peticiones: **10 UV ≈ 150–180 req/s**. Una persona real hace del orden de una
> petición cada pocos segundos, así que 10 UV equivalen a cientos de usuarios humanos. Por eso se añade una serie con
> pausa (`--think 1000`, §4.3).

Objetivos: lecturas p95 < 300 ms con 10 UV, escrituras p95 < 500 ms, 0 respuestas 5xx, 0 interbloqueos.

## 4. Resultados

### 4.1 Antes y después (p50 / p95 / p99 en ms)

| Operación | 1 UV antes | 1 UV después | 10 UV antes | 10 UV después | 30 UV antes | 30 UV después |
|---|---:|---:|---:|---:|---:|---:|
| companies.list | 60 / 71 / 79 | 13 / 16 / 21 | 214 / 410 / 463 | 45 / 80 / 96 | 599 / 855 / 923 | 158 / 226 / 258 |
| companies.search.q | 149 / 190 / 249 | 58 / 113 / 124 | 403 / 664 / 787 | 178 / **310** / 455 | 757 / 1086 / 1200 | 288 / 468 / 575 |
| companies.filter.sort | 11 / 182 / 199 | 4 / 9 / 72 | 60 / 309 / 429 | 18 / 149 / 325 | 427 / 783 / 909 | 126 / 237 / 326 |
| companies.deep.page | 155 / 184 / 188 | 57 / 79 / 85 | 2241 / 3832 / 5182 | 157 / 232 / 270 | 2672 / 4226 / 5055 | 267 / 397 / 439 |
| companies.detail | 3 / 4 / 6 | 3 / 3 / 3 | 20 / 78 / 116 | 16 / 40 / 50 | 344 / 626 / 679 | 126 / 194 / 220 |
| pipeline.board | 30 / 39 / 50 | 32 / 36 / 44 | 97 / 221 / 317 | 94 / 162 / 198 | 262 / 483 / 556 | 157 / 241 / 284 |
| pipeline.board.q | 78 / 145 / 145 | 61 / 155 / 174 | 200 / 367 / 456 | 203 / **381** / 657 | 401 / 703 / 970 | 276 / 451 / 685 |
| pipeline.timeline | 3 / 6 / 7 | 5 / 7 / 9 | 39 / 129 / 222 | 29 / 63 / 85 | 541 / 1026 / 1115 | 237 / 350 / 390 |
| portfolio.my-week | 5 / 8 / 10 | 5 / 7 / 8 | 39 / 129 / 208 | 31 / 58 / 73 | 674 / 989 / 1248 | 255 / 350 / 399 |
| portfolio.cycles.current | 10 / 12 / 14 | 10 / 14 / 17 | 68 / 180 / 225 | 51 / 90 / 112 | 886 / 1292 / 1585 | 331 / 443 / 487 |
| portfolio.assignments | 4 / 5 / 6 | 4 / 4 / 5 | 17 / 132 / 163 | 20 / 49 / 62 | 326 / 531 / 715 | 131 / 195 / 236 |
| analytics.summary | 5 / 7 / 7 | 4 / 5 / 5 | 27 / 87 / 184 | 21 / 40 / 49 | 188 / 382 / 552 | 86 / 180 / 224 |
| analytics.summary.sector | 4 / 205 / 239 | 18 / 27 / 43 | 22 / 710 / 819 | 50 / 134 / 161 | 218 / 850 / 932 | 112 / 215 / 247 |
| analytics.funnel | 4 / 5 / 5 | 3 / 5 / 8 | 19 / 83 / 88 | 14 / 35 / 55 | 218 / 433 / 530 | 79 / 189 / 205 |
| analytics.weekly-activity | 4 / 5 / 5 | 4 / 5 / 5 | 15 / 33 / 54 | 15 / 29 / 40 | 211 / 404 / 411 | 69 / 121 / 153 |
| analytics.executives | 6 / 9 / 9 | 5 / 7 / 7 | 23 / 107 / 112 | 25 / 47 / 55 | 364 / 549 / 659 | 145 / 200 / 237 |
| analytics.cycle-coverage | 5 / 7 / 7 | 5 / 6 / 6 | 28 / 127 / 147 | 25 / 45 / 49 | 356 / 523 / 785 | 144 / 214 / 230 |
| appointments.list | 3 / 4 / 7 | 3 / 4 / 6 | 21 / 110 / 192 | 19 / 38 / 51 | 374 / 584 / 681 | 134 / 194 / 200 |
| contracts.list | 3 / 3 / 5 | 3 / 3 / 5 | 18 / 75 / 96 | 17 / 40 / 48 | 348 / 632 / 718 | 128 / 198 / 219 |
| write.interaction | 10 / 15 / 16 | 10 / 14 / 18 | 50 / 183 / 260 | 49 / 97 / 134 | 760 / 1306 / 1591 | 333 / 454 / 515 |
| write.status | 7 / 11 / 11 | 7 / 8 / 12 | 27 / 122 / 167 | 32 / 66 / 81 | 382 / 744 / 851 | 148 / 210 / 224 |

| Nivel | Antes | Después |
|---|---|---|
| 1 UV | 25 req/s | 53 req/s |
| 10 UV | 50 req/s, peor p95 lectura 3 832 ms | 149 req/s, peor p95 lectura 381 ms |
| 30 UV | 51 req/s, peor p95 lectura 4 226 ms, escritura 1 306 ms | 149 req/s, peor p95 lectura 468 ms, escritura 454 ms |

Errores: **0 respuestas 5xx y 0 4xx** en todas las series (incluidos los 409 de versión: cada UV usa empresas de su
cartera). Interbloqueos: **0** (contador `Number of Deadlocks/sec` del servidor). Entre ejecuciones repetidas la
variación es de ±15 % (el generador comparte CPU con la API y SQL Server).

Evolución del rendimiento con 10 UV a medida que se aplicaban las correcciones: 50 → 135 req/s (paginación en dos pasos
+ índice de texto cubriente) → 172 req/s (índices de filtros, `LOOP` en el tablero, texto en una pasada, `RECOMPILE` en
analytics por sector) → 150–180 req/s con todo (base recreada desde cero).

### 4.2 Objetivos con 10 UV (bucle cerrado)

| Objetivo | Resultado |
|---|---|
| Lecturas p95 < 300 ms | **Cumplido en 19 de 21 operaciones** (la mayoría < 100 ms). Fuera: `pipeline.board.q` 381 ms y `companies.search.q` 310 ms (en otra ejecución, 261 ms). Ver §6 |
| Escrituras p95 < 500 ms | Cumplido: interacción 97 ms, cambio de estado 66 ms (30 UV: 454 / 210 ms) |
| 0 respuestas 5xx | Cumplido |
| 0 interbloqueos | Cumplido |

### 4.3 Con pausa realista (`--think 1000`, ~1 petición/s por usuario)

| UV | req/s | Peor p95 lectura | Peor p95 escritura | 5xx |
|---|---:|---:|---:|---:|
| 30 | 29 | 175 ms (`pipeline.board.q`) | 43 ms | 0 |
| 60 | 57 | 312 ms (`companies.filter.sort`) | 295 ms | 0 |

Con 30 usuarios activos a ritmo humano todas las operaciones quedan por debajo de 200 ms en p95.

### 4.4 Lado de SQL Server

- **Antes:** la consulta con más CPU era el listado sin filtros: `SELECT <11 columnas> … ORDER BY legalName, id OFFSET
  n ROWS` → 496 ms de CPU de media (plan paralelo de 8 hilos que ordenaba la tabla entera, 10 213 lecturas), 522
  ejecuciones en la serie. Después la búsqueda por texto (dos recorridos del índice por petición, ~85 + 220 ms de CPU, con
  hasta 34 k lecturas por búsquedas de clave) y el tablero con `q` (8–25 k lecturas). Esperas dominantes: `CXPACKET`
  (paralelismo).
- **Después:** la consulta de `id` de una página cuesta 5–23 ms (≈ 300 lecturas, incluso en páginas profundas); la de
  texto, un recorrido del índice cubriente (~50 ms de CPU con términos normales, ~110 ms con términos que coinciden con
  17 k empresas); el tablero sin texto, ~30 ms (el `GROUP BY status` sobre 103 k filas con la collation lingüística).
- **Índices que faltan** (`sys.dm_db_missing_index_*`, tras la corrección): solo sugerencias de impacto bajo sobre tablas
  pequeñas (`status_history(changedAt)` para el supervisor, `interactions(userId, occurredAt) INCLUDE (outcome)`,
  `company_branches(companyId) INCLUDE …`). No se añaden: hoy tienen decenas de miles de filas como mucho.
- **Cuello de botella actual: el proceso de la API.** Con 10 UV el proceso Bun usa ~0,9 núcleos (un solo hilo de
  JavaScript saturado) mientras la CPU total de la máquina ronda el 60 %. El perfil (`bun --cpu-prof`) reparte el tiempo
  entre escritura de sockets, el intérprete de consultas de Prisma 7, el parser TDS de `tedious` y el pipeline de Nest;
  no hay un punto caliente de la aplicación.

## 5. Correcciones

Contratos públicos de la API sin cambios.

1. **Paginación en dos pasos** (`PrismaCompanyReader.search`): primero solo los `id` de la página (los resuelve un índice
   estrecho), luego las columnas por clave primaria. Listado 60 → 13 ms; páginas profundas con 10 UV 3,8 s → 0,23 s.
2. **Búsqueda por texto en una pasada**: con `q`, página y total salen de una sola consulta parametrizada
   (`COUNT(*) OVER ()`, construida desde la misma especificación con `toSqlCompanyWhere`; comodines de `LIKE` escapados).
   Sin `q` se mantienen count + página en paralelo, que es más barato.
3. **Tablero con `q`**: la ventana `ROW_NUMBER`/`COUNT` usa solo columnas del índice de texto y las ≤ 160 tarjetas se
   completan por clave primaria con `INNER LOOP JOIN` (sin la pista SQL Server elegía un hash join con un segundo
   recorrido).
4. **Analytics con `sectorId`**: `OPTION (RECOMPILE)` (el 94 % de las empresas está en un sector; un plan en caché
   compilado para otro costaba hasta 20 k lecturas). Summary por sector p95 205 → 27 ms (1 UV) y 710 → 134 ms (10 UV).
5. **Desempate del orden en la misma dirección** (`id DESC` cuando el orden es descendente): así un índice
   `(campo, id)` sirve en los dos sentidos. Antes, cualquier orden descendente ordenaba todas las coincidencias. El orden
   entre empresas con el mismo valor cambia (sigue siendo estable); no forma parte del contrato.
6. **Caché de nombres de catálogo** (`CatalogNameCache`): sectores y actividades en memoria; se releen si aparece un id
   desconocido o cada 10 min. Quita dos consultas por página de empresas y por ficha.
7. **Migración `20261025200000_qa_performance_indexes`** (escrita a mano; nombres declarados en `schema.prisma`, drift vacío
   comprobado contra QA):

   | Índice | Cambio | Para |
   |---|---|---|
   | `companies_searchText_idx` | `INCLUDE (legalName, status, lastContactAt, employeeCount, sectorId, activityId)` | Texto en listado y tablero sin búsquedas de clave |
   | `companies_status_legalName_idx` | `INCLUDE (sectorId, activityId, phone, employeeCount)` | Filtros por estado ordenados por razón social |
   | `companies_status_employeeCount_idx` | nuevo `(status, employeeCount) INCLUDE (sectorId, activityId, phone)` | Filtros por estado ordenados por empleados |
   | `companies_board_idx` | `INCLUDE` + `sectorId`, `activityId` | Tablero filtrado por sector / actividad |
   | `companies_sectorId_status_idx` | `INCLUDE (phone, employeeCount)` | Totales del listado filtrado |
   | `portfolio_assignments_userId_releasedAt_idx` | `INCLUDE (companyId, cycleId, assignedAt)` | Cartera de un ejecutivo |
   | `status_history_userId_changedAt_idx` | nuevo, `INCLUDE (companyId, fromStatus, toStatus)` | Analytics por ejecutivo |
   | `interactions_occurredAt_idx` | nuevo, `INCLUDE (userId, companyId, outcome)` | Analytics del equipo por fechas |

8. **Frontend** (§7): páginas bajo demanda y dependencias en chunks propios.

## 6. Riesgos y pendientes

- **Búsqueda `LIKE '%…%'`**: recorre entero el índice de texto (~50 ms de CPU por búsqueda, ~110–150 ms con términos muy
  frecuentes en el tablero). Crece lineal con el número de empresas. Con 10 UV en bucle cerrado `board.q` (381 ms) y
  `search.q` (260–310 ms) quedan en el límite o por encima del objetivo de 300 ms; con carga realista (§4.3) están por
  debajo de 200 ms. Si la base pasa de ~300 k empresas o se ve lentitud real: instalar Full-Text Search o un índice de
  n-gramas.
- **Un solo proceso de API** ≈ 150–180 req/s en esta máquina (limitado por el hilo de JavaScript). El equipo previsto
  (10–20 personas) usa una fracción pequeña. Escalar a varias instancias requiere antes: desactivar el cron en todas
  menos una (desde v1.0.0: `SCHEDULER_ENABLED=false` en todas menos una), y asumir que el límite de logins y la
  revocación inmediata de sesiones son por proceso (ver `security-review.md`).
- **Tablero sin filtro**: cada carga cuenta las 103 k empresas por estado (~30 ms de CPU). Con mucho más volumen,
  valorar una vista indexada de conteos.
- **Páginas muy profundas**: `OFFSET` recorre las filas previas en el índice (~20–60 ms en las páginas 2 000–4 100).
  Aceptable; la interfaz no invita a llegar ahí.
- **Parámetros (`settings`)** se leen en cada petición de portfolio/analytics (consulta trivial); no se cachean porque
  un cambio en la tabla debe surtir efecto de inmediato.
- **Medida en un solo host**: generador, API y SQL Server comparten 8 CPU; en servidores separados las cifras deberían
  mejorar. No se pudo leer el consumo de CPU del proceso `sqlservr` (servicio de otro usuario); se usaron las DMV.

## 7. Bundle del frontend (`vite build`)

| Chunk | Antes | Después |
|---|---:|---:|
| Principal (`index`) | **967,2 kB** (gzip 301,3) | 166,0 kB (gzip 54,3) |
| `vendor-react` | — | 245,3 kB (gzip 78,0) |
| `vendor-tanstack` | — | 161,8 kB (gzip 50,4) |
| `vendor-zod` | — | 134,0 kB (gzip 40,9) |
| **Carga inicial total** | 967,2 kB (gzip 301,3) | **707,1 kB (gzip 223,5)** |
| Páginas | dentro del principal | 1–51 kB cada una, bajo demanda |
| Tablero (Recharts, ya era diferido) | 428,9 kB | 429,4 kB |

Cambios: `frontend/src/app/router.tsx` carga cada página con `React.lazy` (`lazyPage`) dentro de un `Suspense` con
esqueleto; `frontend/vite.config.ts` separa React, TanStack y Zod en chunks propios (`manualChunks`), que no cambian
entre despliegues de la app. Ningún chunk supera ya los 500 kB.

## 8. Configuración recomendada para producción

| Ajuste | Valor | Motivo |
|---|---|---|
| Instancias de la API | **1** (con supervisor de procesos que la reinicie) | Cron semanal en proceso, límite de logins y revocación en memoria. Holgura estimada: 60 usuarios a ~1 petición/s dieron p95 ≤ 312 ms, frente a 10–20 personas previstas |
| Pool de conexiones | `connectionLimit=10` en `DATABASE_URL` (valor por defecto del adaptador; explícito para documentarlo) y `poolTimeout=15` | Con 10 conexiones el proceso ya se satura por CPU antes que por conexiones; más no aporta (la espera de pool no se midió por separado) |
| `NODE_ENV` | `production` | Cookie `Secure`, sin Swagger |
| `TRUST_PROXY` | `1` (o la subred del proxy) | Límite de login por IP real |
| Login de la app | `db_datareader` + `db_datawriter` (+ `EXECUTE`) | Verificado en QA: no necesita más |
| SQL Server (DBA) | `cost threshold for parallelism` = 50 y `MAXDOP` 4 por base (`ALTER DATABASE SCOPED CONFIGURATION SET MAXDOP = 4`) | El valor por defecto (5) paralelizaba consultas baratas (`CXPACKET` dominante). No se aplicó en QA: es una configuración del servidor |
| Tras la importación inicial | `EXEC sp_updatestats;` | Estadísticas al día tras cargar 100 k filas de golpe |
| Mantenimiento | Reorganizar / reconstruir índices de `companies` semanalmente si la fragmentación > 30 % | La importación por lotes fragmenta los índices |

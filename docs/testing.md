# Pruebas

Tres capas. Solo la primera forma parte de `bun run verify` (no necesita base de datos):

| Capa | Dónde | Comando | BD |
|---|---|---|---|
| Unitarias / componentes | `backend/src/**/*.test.ts`, `frontend/src/**/*.test.tsx`, `packages/contracts` | `bun run test` (incluido en `bun run verify`) | no |
| Integración del backend | `backend/test/integration/*.int.test.ts` | `bun run test:integration` | `AxiomCRM_Test` |
| E2E (Playwright, Chromium) | `e2e/tests/*.spec.ts` | `bun run test:e2e` | `AxiomCRM_Test` |

## Regla dura: nunca contra la base de desarrollo

Las capas 2 y 3 usan **solo** la base `AxiomCRM_Test` del mismo servidor SQL que `backend/.env`. El nombre es una constante
(`backend/test/support/test-database.ts`); `DATABASE_URL` solo aporta servidor y credenciales. Además, `bootApp()` y el
`playwright.config.ts` abortan si `DATABASE_URL` no apunta a `AxiomCRM_Test`, de modo que ejecutar `bun test` a mano sin
preparar el entorno falla en vez de tocar `AxiomCRM`. El login `axiom_dev` ya tiene `dbcreator`, que basta para crear y
borrar la base de pruebas.

## Preparar la base de pruebas

```bash
bun run --filter @axiom/backend test:db     # equivale a: cd backend && bun scripts/test-db.ts
```

`backend/scripts/test-db.ts` (re)crea `AxiomCRM_Test` (collation `Modern_Spanish_CI_AS`), aplica `prisma migrate deploy` y
siembra datos **sintéticos y deterministas** (`backend/test/support/seed-test-data.ts`): parámetros, sectores, actividades de
ficción, 300 empresas `TST000000001…300` (la nº 1 es «Ñandú Test S.A.»; cada 25.ª no tiene teléfono) y cuatro usuarios
(ADMIN, SUPERVISOR y dos EJECUTIVO). Las contraseñas y los secretos JWT se generan al vuelo y se escriben solo en
`backend/.env.test` (ignorado por git, nunca se imprimen). Es re-ejecutable: cada vez empieza de cero.

## Integración del backend

```bash
bun run test:integration                 # recrea la base y corre todo (~15-40 s)
cd backend && bun run test:integration -- --no-reset test/integration/pipeline.int.test.ts   # un archivo, sin recrear
```

Arrancan el `AppModule` real (mismo cableado que `main.ts`) con `@nestjs/testing` en un puerto efímero y hablan con él por
HTTP (`fetch`), así que cubren guards, pipes, filtros, Prisma y SQL Server de verdad. Cubren: auth (login, rotación y
reutilización del refresh token, 401/403 por rol, límite por IP y por cuenta), empresas (búsqueda sin tildes con
`searchText`, filtros, RUC duplicado → 409, cédula oculta al EJECUTIVO), pipeline (transiciones automáticas, 422, nota
obligatoria, bloqueo optimista, línea de tiempo), cartera (rotación, planes ≥ cuota, política de acceso, marcado del plan,
liberación por `CONTRATO_ACTIVO`, idempotencia), citas y contratos (incluida la regresión de que **no se publican eventos si
la transacción exterior hace rollback**), importación de un `.xlsx` sintético (idempotente) y coherencia de analytics con el
tablero.

Convenciones: cada prueba crea sus propias empresas con RUC único (`createCompany`); las que dependen del estado de la
cartera llaman a `resetPortfolio()` y a `run-weekly` en su `beforeAll`. Cada `describe` arranca su propia app porque el
login limita a 5 intentos/min por IP y cada app tiene su contador en memoria.

## E2E con Playwright

```bash
bunx playwright install chromium        # una vez por máquina (CDN oficial de Playwright)
bun run test:e2e                        # recrea la base, elige puertos libres y corre (~1-2 min)
bun run test:e2e -- --no-reset auth     # un archivo; también acepta --headed, --ui, -g "texto"…
```

`scripts/test-e2e.ts` prepara la base, carga `backend/.env.test`, escoge dos puertos libres y lanza `playwright test`, cuya
`webServer` arranca (y detiene al terminar):

1. la API: `backend/test/support/e2e-server.ts` (el `AppModule` real contra `AxiomCRM_Test`) **sin** el límite de intentos de
   login, porque todos los navegadores de la prueba comparten IP y se superarían los 5/min (ese límite se prueba en integración);
2. Vite (`bun run dev`) con el proxy `/api` apuntando a esa API vía `API_PROXY_TARGET` (variable opcional de
   `frontend/vite.config.ts`; sin ella el proxy sigue siendo `http://localhost:3000`).

Flujos: login/logout y restauración de sesión al recargar, menú por rol, empresas (búsqueda sin tildes, ficha, edición, alta y
RUC duplicado, cédula oculta), kanban (menú «Mover a…», arrastrar y soltar con el sensor de ratón de dnd-kit, descartar con
nota, destinos permitidos), registrar contacto y ver la línea de tiempo, importación de un `.xlsx` y un humo por cada pantalla
de la ola 3 (Mi semana, Cartera, Tablero, Citas, Contratos). Los specs corren en serie (`workers: 1`) sobre la misma base.

Notas: Playwright corre bajo Node y no puede cargar `exceljs`, por eso el `.xlsx` de la importación lo genera un proceso de
Bun (`backend/test/support/write-xlsx.ts`). `e2e/test-results/` y `e2e/playwright-report/` están en `.gitignore` (las trazas
contienen tokens). `bun run typecheck:e2e` comprueba los tipos de `e2e/`.

## CI

`.github/workflows/ci.yml`: el job `integration` levanta un contenedor SQL Server, y `bun run test:integration` crea
`AxiomCRM_Test`, migra, siembra y prueba (la contraseña de `sa` viene de `secrets.CI_MSSQL_SA_PASSWORD`; nada de credenciales
en el workflow). El job `e2e` solo corre con `workflow_dispatch` (Actions → CI → Run workflow) y sube el informe HTML si falla.

## Hallazgos conocidos (pruebas marcadas)

- **Carrera de refresh al recargar** (`e2e/tests/session-race.spec.ts`, `test.fail`): recargar la página mientras
  `POST /api/auth/refresh` sigue en vuelo deja al navegador con el refresh token ya rotado; la siguiente carga lo reutiliza,
  el servidor lo trata como robo y revoca toda la familia → el usuario vuelve a `/login`. Mitigación posible: ventana de
  gracia (p. ej. 10-30 s) en `RefreshSessionUseCase` que acepte el token recién rotado y devuelva su sucesor.
- **Resumen de «Ejecutar rotación semanal» invisible desde Mi semana**: el botón vive dentro del estado vacío («Aún no hay un
  ciclo activo»); al terminar la mutación la pantalla se refresca, ese estado vacío se desmonta y con él el diálogo con el
  resumen y el callback del toast (no se muestra nada). Desde Cartera (botón del encabezado) sí funciona. Solución: montar el
  diálogo fuera del `EmptyState` o usar `onSuccess` en el `useMutation`.
- Un `.xlsx` guardado por ExcelJS (no por Excel) escribe `xl/workbook.xml` al final del zip y el lector en streaming de la
  importación falla con `this.model.sheets` indefinido; los fixtures de pruebas lo reempaquetan en el orden de Excel
  (`reorderLikeExcel`). Un libro con solo encabezados (sin filas) termina `COMPLETADO` con 0 filas en vez de `FALLIDO`.

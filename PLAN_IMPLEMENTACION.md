# AXIOM CRM — Plan de implementación

## Estado

- **Ola 0 (cimientos): completada.**
- **Ola 1 (núcleo): completada.** Empresas, importación, identidad, pipeline y shell del frontend.
- **Ola 2 (rotación y gestión): completada.** Cartera y plan semanal, citas y contratos, analítica, frontend de empresas y kanban.
- **Ola 3 (experiencia y calidad): en curso.** Mi semana, tablero, pruebas de integración y E2E, revisión de seguridad y documentación (T3.5).

> Detalle de cada decisión en [docs/adr/](docs/adr/); referencia de la API en [docs/api.md](docs/api.md).

---

> CRM de seguimiento comercial de empresas de Nicaragua con cartera de clientes rotativa (ciclo de 3 semanas, mínimo 20 contactos por semana), pipeline de estados y tablero visual.
>
> **Stack:** Bun · NestJS · Prisma · SQL Server · React · Tailwind · arquitectura hexagonal · Git con ramas por agente · hasta 5 sub-agentes en paralelo.

---

## 0. Diagnóstico del Excel fuente (`Empresas Nicaragua.xlsx`)

| Dato | Valor | Impacto en el diseño |
|---|---|---|
| Hoja | `Hoja1`, **127 197 filas**, 11 columnas | La importación debe ser por *streaming* y por lotes, no cargar todo en memoria del request HTTP |
| Columnas | `RUC, RAZONSOCIAL_EMPRESA, CEDULA_REP_LEGAL, REPRESENTANTE_LEGAL, NOMBRE_COMERCIAL_NOMINA, CANTIDAD_EMPLEADOS, DIRECCION_ENVIO, DIRECCION_PARTICULAR, TELEFONO, ACTIVIDAD_ECONOMICA, SECTOR_ECONOMICO` | Se mapean a `Company` + `CompanyBranch` (ver modelo) |
| RUC repetidos | **10 154 RUC** aparecen más de una vez | Una empresa = un RUC; las filas extra son **sucursales/nóminas** (`CompanyBranch`), no duplicados a descartar |
| Tipo de RUC | 118 101 texto, 9 050 numéricos, **46 vacíos** | Normalizar a `NVARCHAR(20)` en mayúsculas; filas sin RUC van al reporte de rechazos |
| Sin teléfono | 5 378 filas | El teléfono es opcional; se marca la empresa como "sin canal de contacto" para no asignarla en la cartera semanal |
| Empleados = 0 | 93 357 filas | Se guarda tal cual, pero sirve para priorizar (empresas con más empleados primero) |
| Actividades económicas | 914 distintas | Tabla catálogo `EconomicActivity` |
| Sectores | 9 (`PRIVADA NACIONAL` 119 827, `PRIVADO EXTRANJERO` 3 392, `ESTADO` 1 205, …) | Tabla catálogo `EconomicSector` |
| Longitudes máx. | Razón social 181, direcciones 284, actividad 166 | Usar `NVARCHAR(200)` / `NVARCHAR(300)` |
| Codificación | Correcta (acentos y ñ intactos) | Usar siempre `NVARCHAR` en SQL Server |

> ⚠️ **El Excel contiene datos personales** (cédulas, nombres de representantes legales, teléfonos). **Nunca debe entrar al repositorio.** Va en `data/` que está en `.gitignore` (ver §7).

---

## 1. Reglas de negocio

### 1.1 Estados del pipeline (máquina de estados)

```
POR_CONTACTAR ──► CONTACTADO ──► SIN_RESPUESTA ──► (reintento) CONTACTADO
                       │
                       └──────► CON_RESPUESTA ──► AGENDANDO_CITA ──► EN_PROCESO_CONTRATO ──► CONTRATO_ACTIVO
```

| Estado | Significado | Transiciones permitidas |
|---|---|---|
| `POR_CONTACTAR` *(estado inicial, añadido)* | Empresa en cartera aún sin gestión | → `CONTACTADO` |
| `CONTACTADO` | Se hizo el intento de contacto | → `SIN_RESPUESTA`, `CON_RESPUESTA` |
| `SIN_RESPUESTA` | No contestó | → `CONTACTADO` (reintento) |
| `CON_RESPUESTA` | Contestó y hay interés/conversación | → `AGENDANDO_CITA`, `SIN_RESPUESTA` |
| `AGENDANDO_CITA` | Se está coordinando o ya hay cita | → `EN_PROCESO_CONTRATO`, `CON_RESPUESTA` |
| `EN_PROCESO_CONTRATO` | Propuesta / negociación / firma | → `CONTRATO_ACTIVO`, `AGENDANDO_CITA` |
| `CONTRATO_ACTIVO` | Cliente ganado | (terminal; sale de la rotación) |

- Se recomienda añadir `DESCARTADO` (no interesado / datos inválidos) para que esas empresas salgan de la rotación. **Pendiente de tu confirmación.**
- Cada cambio de estado genera un registro en `StatusHistory` (quién, cuándo, desde, hasta, nota) y un evento de dominio `CompanyStatusChanged`.
- Cualquier transición no listada se rechaza en el dominio (patrón **State**), no en el controlador.

### 1.2 Cartera rotativa

| Parámetro (configurable en tabla `Setting`) | Valor por defecto |
|---|---|
| `ROTATION_CYCLE_WEEKS` | **3** |
| `WEEKLY_CONTACT_QUOTA` | **20** (mínimo por ejecutivo) |
| `PORTFOLIO_SIZE` | `cycle_weeks × weekly_quota` = **60** empresas activas por ejecutivo |
| `MAX_CYCLES_WITHOUT_PROGRESS` | 2 (después vuelve al pool y se reasigna a otro ejecutivo) |

Reglas:
1. Cada ejecutivo tiene una **cartera** (`PortfolioAssignment`) de ~60 empresas.
2. Cada lunes (job programado) se genera el **plan semanal** (`WeeklyPlan` + `WeeklyPlanItem`) con al menos 20 empresas de su cartera.
3. Prioridad para armar el plan (patrón **Strategy**, intercambiable):
   1. Seguimientos con fecha comprometida esa semana (citas, llamadas pactadas).
   2. `POR_CONTACTAR` nunca gestionadas.
   3. `SIN_RESPUESTA` con el último intento más antiguo.
   4. Resto, ordenado por fecha de último contacto ascendente y número de empleados descendente.
4. En un ciclo de 3 semanas **todas** las empresas de la cartera deben haber sido contactadas al menos una vez (indicador "cobertura del ciclo").
5. Al cerrar el ciclo: las empresas sin avance durante `MAX_CYCLES_WITHOUT_PROGRESS` ciclos se liberan al pool; la cartera se rellena con empresas del pool hasta volver a 60.
6. `CONTRATO_ACTIVO` sale de la rotación de prospección y pasa a cartera de clientes activos.
7. Empresas sin teléfono no se asignan automáticamente.

### 1.3 Roles

| Rol | Puede |
|---|---|
| `ADMIN` | Todo: usuarios, parámetros, importación, reasignaciones |
| `SUPERVISOR` | Ver todas las carteras y tableros, reasignar empresas |
| `EJECUTIVO` | Ver y gestionar solo su cartera y su plan semanal |

---

## 2. Arquitectura

### 2.1 Estructura del repositorio (monorepo con *Bun workspaces*)

```
axiom-crm/
├── backend/                 # NestJS + Prisma (ejecutado con Bun)
├── frontend/                # React + Vite + Tailwind (ejecutado con Bun)
├── packages/
│   └── contracts/           # Esquemas Zod + tipos compartidos (DTOs de la API, enums de estado)
├── data/                    # ⛔ gitignored — aquí va el Excel
├── docs/                    # ADRs, diagramas, guía de agentes
├── docker-compose.yml       # SQL Server 2022 local (contraseña leída de variable del sistema)
├── .env.example             # solo NOMBRES de variables, sin valores reales
├── .gitignore
├── .gitleaks.toml
└── package.json             # "workspaces": ["backend", "frontend", "packages/*"]
```

> Recomendación: mueve el proyecto **fuera de OneDrive** (p. ej. `C:\dev\axiom-crm`). OneDrive sincroniza `node_modules` y `.git` y bloquea archivos durante `git worktree`, `bun install` y las migraciones.

### 2.2 Backend — hexagonal por módulo (bounded context)

```
backend/src/
├── main.ts
├── app.module.ts
├── shared/
│   ├── domain/              # AggregateRoot, Entity, ValueObject, DomainEvent, Result, errores de dominio
│   ├── application/         # UseCase<I,O>, UnitOfWork (puerto), EventBus (puerto), Clock (puerto)
│   └── infrastructure/
│       ├── prisma/          # PrismaService, PrismaUnitOfWork ($transaction)
│       ├── config/          # carga y validación de variables de entorno con Zod
│       ├── events/          # adaptador EventBus con @nestjs/event-emitter
│       └── http/            # filtros de excepción, interceptores, paginación
└── modules/
    └── <modulo>/
        ├── domain/
        │   ├── entities/        # Company, PipelineStage, WeeklyPlan…
        │   ├── value-objects/   # Ruc, Phone, PipelineStatus, Week…
        │   ├── events/
        │   ├── services/        # lógica de dominio pura (p. ej. RotationPolicy)
        │   └── ports/           # interfaces de repositorio (puertos de salida)
        ├── application/
        │   ├── use-cases/       # un caso de uso = una clase con execute()
        │   ├── dtos/
        │   └── queries/         # lecturas optimizadas (CQRS ligero)
        ├── infrastructure/
        │   ├── persistence/     # PrismaXRepository + mappers dominio ⇄ Prisma
        │   └── http/            # controllers, request/response DTOs, guards
        └── <modulo>.module.ts   # cablea puertos ⇄ adaptadores con tokens de inyección
```

**Regla de dependencias (obligatoria y verificada en CI):**
`domain` ← `application` ← `infrastructure`. El dominio no importa nada de `@nestjs/*` ni `@prisma/*`. Se verifica con `dependency-cruiser` (o `eslint-plugin-boundaries`) en el pipeline.

### 2.3 Módulos

| Módulo | Responsabilidad |
|---|---|
| `identity` | Usuarios, roles, login JWT (access + refresh), hash con `Bun.password` (argon2) |
| `companies` | CRUD de empresas y sucursales, búsqueda, filtros por sector/actividad/empleados |
| `catalogs` | Sectores, actividades económicas |
| `import` | Importación ETL del Excel: lectura en streaming, normalización, deduplicación, lotes, reporte |
| `pipeline` | Máquina de estados, historial, registro de interacciones (llamada, WhatsApp, correo, visita) |
| `portfolio` | Carteras, ciclos de rotación, plan semanal, reasignaciones, job semanal |
| `appointments` | Citas (fecha, modalidad, lugar, resultado) |
| `contracts` | Contratos (inicio, fin, monto, estado) |
| `analytics` | Indicadores del tablero (solo lectura, consultas optimizadas) |
| `settings` | Parámetros del negocio (cuota, semanas de ciclo…) |

### 2.4 Principios y patrones

| Principio / patrón | Dónde se aplica |
|---|---|
| **S** — Responsabilidad única | Un caso de uso por clase (`ChangeCompanyStatusUseCase`, `GenerateWeeklyPlanUseCase`…); controladores solo traducen HTTP |
| **O** — Abierto/cerrado | Estrategias de priorización de cartera intercambiables sin tocar el caso de uso |
| **L** — Sustitución de Liskov | Repositorios en memoria y Prisma cumplen el mismo contrato (los tests usan los de memoria) |
| **I** — Segregación de interfaces | Puertos pequeños: `CompanyReader`, `CompanyWriter` en vez de un repositorio gigante |
| **D** — Inversión de dependencias | Casos de uso dependen de puertos (`Symbol` tokens); Nest inyecta el adaptador |
| **Repository + Mapper** | `infrastructure/persistence` |
| **Unit of Work** | `PrismaUnitOfWork` sobre `prisma.$transaction` para cambios de estado + historial + evento |
| **State** | `PipelineStatus` decide sus transiciones válidas |
| **Strategy** | `PortfolioPrioritizationStrategy` |
| **Factory** | Creación de agregados con invariantes (`Company.create`, `WeeklyPlan.generate`) |
| **Domain Events / Observer** | `CompanyStatusChanged` → actualiza `lastContactAt`, métricas, notificaciones |
| **Specification** | Filtros combinables de búsqueda de empresas |
| **CQRS ligero** | `analytics` y listados usan consultas de lectura directas; escrituras pasan por el dominio |
| **Result / errores tipados** | El dominio devuelve errores de negocio, un filtro global los mapea a HTTP 4xx |

### 2.5 Frontend

| Pieza | Elección |
|---|---|
| Base | React 19 + Vite + TypeScript, ejecutado con Bun |
| Estilos | Tailwind CSS v4 + **shadcn/ui** (componentes accesibles, sin dependencia de runtime pesada) |
| Datos del servidor | **TanStack Query** (caché, reintentos, invalidación tras cambiar estado) |
| Tablas | **TanStack Table** con paginación del lado del servidor (127 k empresas) |
| Rutas | TanStack Router (tipado) o React Router 7 |
| Formularios | React Hook Form + Zod (esquemas de `packages/contracts`, los mismos que valida el backend) |
| Kanban | **dnd-kit** (arrastrar tarjetas entre columnas = cambio de estado) |
| Gráficos | Recharts |
| Estado de UI | Zustand (solo estado local: filtros, panel lateral) |
| Iconos / fechas | lucide-react, date-fns (zona `America/Managua`) |

Estructura por *features* (misma idea de separación que el backend):

```
frontend/src/
├── app/            # providers, router, layout
├── shared/         # ui (shadcn), api-client, hooks genéricos, utils
└── features/
    ├── auth/
    ├── companies/      # listado, ficha, alta, edición
    ├── import/         # subir Excel, ver progreso y reporte de rechazos
    ├── pipeline/       # kanban por estado + registro de interacción
    ├── my-week/        # "Mi semana": plan de 20+, barra de progreso, checklist
    ├── portfolio/      # carteras, ciclo actual, cobertura, reasignación
    ├── appointments/
    ├── contracts/
    └── dashboard/
```

**Pantallas clave**

1. **Mi semana** (pantalla principal del ejecutivo): lista de las 20+ empresas del plan, barra `12 / 20 contactadas`, botón rápido "Registrar contacto" que abre un panel con resultado → cambia el estado.
2. **Pipeline (kanban)**: 6 columnas por estado con conteo, filtros por ejecutivo/sector; arrastrar valida la transición contra la máquina de estados.
3. **Ficha de empresa**: datos, sucursales, línea de tiempo de interacciones e historial de estados, citas y contrato.
4. **Tablero**: embudo por estado, cumplimiento de cuota semanal por ejecutivo, cobertura del ciclo de 3 semanas, tasa de conversión entre etapas, contratos activos.
5. **Cartera / rotación**: semana N de 3 del ciclo, empresas pendientes de tocar en el ciclo, reasignaciones.
6. **Empresas**: buscador por RUC, razón social, nombre comercial, filtros, alta manual de nuevas empresas.
7. **Importación**: subir Excel, previsualizar, ejecutar, ver reporte.

---

## 3. Modelo de datos (Prisma + SQL Server, *code first*)

> **Particularidades de Prisma con SQL Server que el plan ya contempla**
> - Prisma **no soporta `enum` en SQL Server** → los estados son `String` en la base de datos, `PipelineStatus` es un *value object* en el dominio y se añade una restricción `CHECK` editando la migración generada con `--create-only`.
> - Límite de **2 100 parámetros** por consulta → la importación inserta en lotes de ~150 filas.
> - `createMany({ skipDuplicates })` no existe en SQL Server → la deduplicación se hace antes de insertar (o con `MERGE` en SQL crudo).
> - `prisma migrate dev` necesita una **base sombra**: el usuario de desarrollo necesita permiso `CREATE DATABASE` o se define `shadowDatabaseUrl`.

Entidades principales (resumen, el esquema exacto lo crea la tarea T0.2):

```prisma
model User {
  id            String   @id @default(uuid()) @db.UniqueIdentifier
  email         String   @unique @db.NVarChar(150)
  fullName      String   @db.NVarChar(150)
  passwordHash  String   @db.NVarChar(255)
  role          String   @db.NVarChar(20)        // ADMIN | SUPERVISOR | EJECUTIVO (CHECK)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  assignments   PortfolioAssignment[]
}

model Company {
  id                 String   @id @default(uuid()) @db.UniqueIdentifier
  ruc                String   @unique @db.NVarChar(20)
  legalName          String   @db.NVarChar(200)
  tradeName          String?  @db.NVarChar(200)
  legalRepName       String?  @db.NVarChar(100)
  legalRepIdNumber   String?  @db.NVarChar(20)
  employeeCount      Int      @default(0)
  phone              String?  @db.NVarChar(20)
  shippingAddress    String?  @db.NVarChar(300)
  activityId         Int?
  sectorId           Int?
  status             String   @default("POR_CONTACTAR") @db.NVarChar(30) // CHECK
  lastContactAt      DateTime?
  source             String   @default("EXCEL") @db.NVarChar(20)       // EXCEL | MANUAL
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  branches           CompanyBranch[]
  interactions       Interaction[]
  statusHistory      StatusHistory[]
  @@index([status])
  @@index([legalName])
  @@index([sectorId, activityId])
}

model CompanyBranch        { /* sucursal/nómina: tradeName, address, phone, employeeCount */ }
model EconomicSector       { id Int @id @default(autoincrement()) name String @unique }
model EconomicActivity     { id Int @id @default(autoincrement()) name String @unique }
model Interaction          { /* companyId, userId, channel, outcome, notes, occurredAt, nextFollowUpAt */ }
model StatusHistory        { /* companyId, userId, fromStatus, toStatus, note, changedAt */ }
model RotationCycle        { /* startDate, endDate, number, isClosed */ }
model PortfolioAssignment  { /* companyId, userId, cycleId, assignedAt, releasedAt, cyclesWithoutProgress */ }
model WeeklyPlan           { /* userId, cycleId, weekStart, weekNumber(1..3), quota */ }
model WeeklyPlanItem       { /* planId, companyId, priority, contactedAt */ }
model Appointment          { /* companyId, userId, scheduledAt, mode, location, outcome */ }
model Contract             { /* companyId, startDate, endDate, amount Decimal(18,2), status */ }
model Setting              { key String @id  value String }
model ImportJob            { /* fileName, totalRows, inserted, updated, branches, rejected, status, startedAt, finishedAt */ }
model ImportRejection      { /* jobId, rowNumber, reason, rawData */ }
```

### 3.1 Migraciones *code first*

| Situación | Comando |
|---|---|
| Crear/alterar esquema en desarrollo | `bunx prisma migrate dev --name <cambio>` |
| Necesito SQL a mano (CHECK, índices filtrados, vistas) | `bunx prisma migrate dev --create-only --name <cambio>` → editar `migration.sql` → `bunx prisma migrate dev` |
| Aplicar en QA/producción | `bunx prisma migrate deploy` (nunca `migrate dev` ni `db push` fuera de local) |
| Ver estado | `bunx prisma migrate status` |
| Datos iniciales (roles, parámetros, catálogos, admin) | `bunx prisma db seed` (script idempotente con `upsert`) |

Reglas:
- Las migraciones se versionan en Git y **nunca se editan una vez fusionadas a `main`**; un cambio = una migración nueva.
- **Solo un agente por ola puede crear migraciones** (ver §5.4), para evitar migraciones con marcas de tiempo cruzadas entre ramas.

---

## 4. Seguridad y credenciales ("Git nunca olvida")

1. **Nada con valores reales se versiona.** `.gitignore` incluye desde el primer commit:
   ```
   .env
   .env.*
   !.env.example
   data/
   *.xlsx
   *.csv
   node_modules/
   dist/
   coverage/
   ```
2. `.env.example` lista **solo nombres** (`DATABASE_URL=`, `JWT_ACCESS_SECRET=`…) sin valores.
3. Las credenciales viven fuera del repo:
   - **Local:** variables de entorno de usuario de Windows (o un `.env.local` ignorado que Bun carga automáticamente). `docker-compose.yml` lee `MSSQL_SA_PASSWORD` del entorno, nunca escrita en el archivo.
   - **CI:** *GitHub Actions secrets*.
   - **Producción:** gestor de secretos del hosting (Azure Key Vault, Doppler, etc.).
4. **gitleaks** como *pre-commit hook* (vía `lefthook`) **y** como paso de CI: si detecta un secreto, el commit falla.
5. La configuración se valida al arrancar con Zod: si falta un secreto la app no inicia (mejor que arrancar con un valor por defecto inseguro).
6. Los agentes tienen prohibido escribir valores de secretos en código, tests, commits, mensajes de PR o documentación; en tests se generan al vuelo.
7. Usuario de base de datos de la app con permisos mínimos (no `sa`); `sa` solo para el contenedor local.
8. API: `helmet`, CORS restringido al frontend, *rate limiting* (`@nestjs/throttler`) en login, validación de toda entrada con Zod, auditoría con `StatusHistory`.
9. Si alguna vez se comete un secreto: **rotarlo de inmediato** (reescribir el historial no basta, puede estar en clones o forks).

---

## 5. Trabajo con sub-agentes y Git

### 5.1 Agentes por tipo de tarea

| Agente | Cuándo usarlo | Por qué |
|---|---|---|
| **Agente principal** | Arquitectura, esquema de base de datos, dominio crítico (máquina de estados, rotación), integración de ramas, revisión de seguridad y código | Máximo razonamiento; los errores aquí se propagan a todo el sistema |
| **Agente de implementación** | Implementación de módulos, casos de uso, adaptadores, pantallas React, tests | Mejor equilibrio calidad/velocidad/costo para código de producción |
| **Agente de tareas mecánicas** | Andamiaje repetitivo, configuración de lint/format, seeds, README, CHANGELOG, documentación de endpoints | Rápido y barato para tareas mecánicas y bien acotadas |

### 5.2 Flujo de Git por agente

```
main (protegida: solo merges con tests en verde)
 ├── feat/w1-companies       ← agente A (worktree ../axiom-wt/w1-companies)
 ├── feat/w1-import          ← agente B
 ├── feat/w1-identity        ← agente C
 ├── feat/w1-pipeline        ← agente D
 └── feat/w1-frontend-shell  ← agente E
```

Cada agente, en su propio **git worktree** (aislamiento total entre los 5 en paralelo):

1. `git worktree add ../axiom-wt/<slug> -b feat/<ola>-<slug> main`
2. Trabaja **solo en los archivos de su tarea** (tabla de propiedad en §5.4).
3. Commits pequeños con **Conventional Commits**: `feat(pipeline): add state transition rules`, `test(import): cover duplicate RUC as branch`.
4. Antes de integrar:
   ```bash
   git fetch && git rebase main
   bun install && bun run lint && bun run typecheck && bun test
   ```
5. Integración a `main` **de una rama a la vez** (candado de merge: el siguiente agente espera a que termine el anterior y vuelve a hacer *rebase*):
   ```bash
   git switch main && git merge --no-ff feat/<ola>-<slug> && git push
   ```
   (Alternativa con GitHub: PR + revisión del agente principal integrador + *squash merge*.)
6. Borra el worktree y la rama al terminar.

Guía para los agentes en `docs/AGENTS.md` con estas reglas, la regla de dependencias hexagonal y la prohibición de secretos.

### 5.3 Olas de trabajo (máx. 5 tareas en paralelo)

**Ola 0 — Cimientos** (secuencial, 1 agente, *bloquea todo lo demás*)

| ID | Tarea | Agente |
|---|---|---|
| T0.1 | `git init`, monorepo Bun workspaces, `.gitignore`, `.env.example`, gitleaks + lefthook, `docker-compose` SQL Server 2022, CI (lint, typecheck, test, gitleaks, dependency-cruiser) | Agente principal |
| T0.2 | NestJS ejecutándose en Bun (`emitDecoratorMetadata`), `shared/` kernel, Prisma configurado para SQL Server, **esquema completo de todas las entidades** + migración inicial + CHECKs + seed | Agente principal |
| T0.3 | `packages/contracts` con esquemas Zod de estados, roles y DTOs base; `docs/AGENTS.md`, ADRs iniciales | Agente de tareas mecánicas |

> Se define el esquema completo en la Ola 0 a propósito: así las olas paralelas no compiten por `schema.prisma`.

**Ola 1 — Núcleo** (5 en paralelo)

| ID | Tarea | Agente | Rama |
|---|---|---|---|
| T1.1 | Módulo `companies` + `catalogs`: CRUD, sucursales, búsqueda paginada, filtros (Specification) | Agente de implementación | `feat/w1-companies` |
| T1.2 | Módulo `import`: lectura en streaming del Excel (ExcelJS), normalización de RUC/teléfono, deduplicación (RUC repetido → sucursal), lotes de 150, `ImportJob` + reporte de rechazos, script CLI `bun run import data/Empresas Nicaragua.xlsx` | Agente de implementación | `feat/w1-import` |
| T1.3 | Módulo `identity`: usuarios, JWT access/refresh, guards por rol, `Bun.password` | Agente de implementación | `feat/w1-identity` |
| T1.4 | Módulo `pipeline`: value object `PipelineStatus` (State), `ChangeCompanyStatusUseCase` con UoW, `StatusHistory`, `Interaction`, evento `CompanyStatusChanged` | **Agente principal** | `feat/w1-pipeline` |
| T1.5 | Frontend base: Vite + React + Tailwind v4 + shadcn/ui, layout con barra lateral, router, cliente API con TanStack Query, login | Agente de implementación | `feat/w1-frontend-shell` |

**Ola 2 — Rotación y gestión** (5 en paralelo)

| ID | Tarea | Agente | Rama |
|---|---|---|---|
| T2.1 | Módulo `portfolio`: ciclos de 3 semanas, asignación de cartera (60), `GenerateWeeklyPlanUseCase` (Strategy de priorización), cierre de ciclo y liberación al pool, job semanal con `@nestjs/schedule` (lunes 06:00 `America/Managua`) | **Agente principal** | `feat/w2-portfolio` |
| T2.2 | Módulos `appointments` y `contracts` (al activar contrato → estado `CONTRATO_ACTIVO` vía caso de uso de pipeline) | Agente de implementación | `feat/w2-appointments-contracts` |
| T2.3 | Módulo `analytics`: embudo, cumplimiento de cuota, cobertura de ciclo, conversión por etapa (consultas de lectura optimizadas) | Agente de implementación | `feat/w2-analytics` |
| T2.4 | Frontend: empresas (tabla paginada, ficha con línea de tiempo, alta/edición) + pantalla de importación | Agente de implementación | `feat/w2-fe-companies` |
| T2.5 | Frontend: kanban de pipeline con dnd-kit + panel "Registrar contacto" | Agente de implementación | `feat/w2-fe-pipeline` |

**Ola 3 — Experiencia y calidad** (5 en paralelo)

| ID | Tarea | Agente | Rama |
|---|---|---|---|
| T3.1 | Frontend: **Mi semana** (plan de 20+, progreso, checklist) y vista de cartera/rotación/reasignación | Agente de implementación | `feat/w3-fe-my-week` |
| T3.2 | Frontend: tablero con Recharts + citas y contratos | Agente de implementación | `feat/w3-fe-dashboard` |
| T3.3 | Tests de integración contra SQL Server real (contenedor) y E2E con Playwright de los flujos clave | Agente de implementación | `feat/w3-tests` |
| T3.4 | Revisión de seguridad (authz por cartera, inyección, secretos, rate limit) y de arquitectura (fugas de capas) | **Agente principal** | `chore/w3-security-review` |
| T3.5 | Documentación: README, guía de despliegue, OpenAPI/Swagger, manual de usuario corto | Agente de tareas mecánicas | `docs/w3-docs` |

**Ola 4 — Cierre** (secuencial)

| ID | Tarea | Agente |
|---|---|---|
| T4.1 | Importación real de las 127 197 filas en entorno QA, verificación de conteos e índices, prueba de rendimiento de listados y tablero | Agente principal |
| T4.2 | Corrección de hallazgos, *release* `v1.0.0`, etiqueta Git, CHANGELOG | Agente de implementación (+ tareas mecánicas para CHANGELOG) |

### 5.4 Propiedad de archivos (evitar conflictos entre agentes paralelos)

| Archivo/área compartida | Quién lo toca | Cómo |
|---|---|---|
| `backend/prisma/schema.prisma` y `migrations/` | Solo el agente de Ola 0; después, **un único agente designado por ola** | Si otra tarea necesita un cambio, lo anota en su PR y el integrador crea la migración en `main` |
| `backend/src/app.module.ts` | Cada agente añade **una línea** (su import) | Conflicto trivial; se resuelve en el *rebase* |
| `frontend/src/app/router.tsx` y menú lateral | Cada agente añade sus rutas | Igual que arriba |
| `packages/contracts` | Cada módulo en su propio archivo (`contracts/src/<modulo>.ts`) + `index.ts` | Solo se añaden exportaciones |
| `bun.lock` | Se regenera tras el *rebase* (`bun install`) | Nunca se resuelve a mano |

---

## 6. Calidad y pruebas

| Capa | Herramienta | Qué se prueba |
|---|---|---|
| Dominio | `bun test` | Transiciones de estado, reglas de rotación, priorización, value objects (sin base de datos, sin Nest) |
| Aplicación | `bun test` + repositorios en memoria | Casos de uso completos |
| Infraestructura | `bun test` + SQL Server en Docker | Repositorios Prisma, migraciones, importación con un Excel de muestra (200 filas sintéticas, **no datos reales**) |
| API | `@nestjs/testing` + supertest | Controladores, guards, códigos de error |
| Frontend | `bun test` + Testing Library + happy-dom | Componentes y hooks |
| E2E | Playwright | Login → Mi semana → registrar contacto → mover en kanban → agendar cita → contrato activo |

Criterio para fusionar a `main`: lint ✅ typecheck ✅ tests ✅ gitleaks ✅ dependency-cruiser ✅.

---

## 7. Riesgos y decisiones abiertas

| Riesgo / decisión | Mitigación / propuesta |
|---|---|
| NestJS sobre Bun: compatibilidad de algunos paquetes | Validarlo en T0.2 antes de construir nada; si un paquete falla, se cambia por una alternativa compatible. Se usa `@nestjs/platform-express` |
| Versiones de Prisma (configuración y *driver adapter* para SQL Server cambian entre versiones mayores) | T0.2 fija la última versión estable y lo documenta en un ADR |
| Proyecto dentro de OneDrive | Moverlo a `C:\dev\axiom-crm` antes de la Ola 0 |
| Datos personales del Excel | Fuera de Git, acceso a cédulas restringido a `ADMIN`/`SUPERVISOR` en la API |
| ¿Estado `DESCARTADO`? | Propuesto; confirmar |
| ¿Cuántos ejecutivos habrá? | Define cuántas empresas entran en rotación (60 × ejecutivos); el resto queda en el pool |
| ¿Repositorio remoto (GitHub)? | Necesario para PRs, CI y protección de `main`; si no, se usa el flujo de merge local de §5.2 |

---

## 8. Resumen de entregables por ola

| Ola | Resultado visible |
|---|---|
| 0 | Repo listo, base de datos creada con migraciones, CI en verde |
| 1 | Se pueden importar las 127 k empresas, iniciar sesión, buscar empresas y cambiar estados por API |
| 2 | Carteras y plan semanal automático funcionando; kanban y ficha de empresa en el frontend |
| 3 | "Mi semana", tablero visual, pruebas E2E y revisión de seguridad |
| 4 | Versión `v1.0.0` con datos reales en QA |

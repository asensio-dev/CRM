# ADR 0005 — Cartera rotativa: ciclos, plan semanal, avance y control de acceso

- **Estado:** aceptado (2026-10-25)
- **Código:** `backend/src/modules/portfolio`, puerto `CompanyAccessPolicy` en `backend/src/modules/pipeline/application/ports`

## Contexto

PLAN §1.2: cada EJECUTIVO trabaja una cartera de `ROTATION_CYCLE_WEEKS × WEEKLY_CONTACT_QUOTA` (3 × 20 = 60) empresas,
con un plan semanal de ≥ 20 contactos y ciclos de 3 semanas al final de los cuales las empresas estancadas vuelven al pool.
Faltaba además el control "un ejecutivo solo opera empresas de su cartera" (pendiente de la ola 1).

## Decisión

### 1. Calendario

- Fechas de negocio = `LocalDate` (`YYYY-MM-DD`) en la zona del parámetro `TIMEZONE` (America/Managua, UTC−6 sin horario
  de verano). Se convierten con `Intl`, así que otra zona (con DST) también funciona. Las columnas `DATE` guardan la
  medianoche UTC de la fecha local.
- Semanas de lunes a domingo. Un ciclo empieza en lunes y dura N semanas (`endDate` = domingo, inclusive). Cada ciclo
  guarda sus fechas: cambiar `ROTATION_CYCLE_WEEKS` solo afecta a los ciclos siguientes.
- El siguiente ciclo empieza el lunes posterior al anterior; si el job no corrió durante semanas, empieza el lunes actual.
- Semana k = ⌊(fecha − inicio) / 7⌋ + 1, acotada a 1..N. Las ventanas de consulta son `[lunes 00:00 local, lunes siguiente 00:00)`.

### 2. Plan semanal (Strategy `PortfolioPrioritizationStrategy`, `DefaultPrioritizationStrategy`)

1. **SEGUIMIENTO**: interacciones con `nextFollowUpAt` dentro de la semana o citas `PROGRAMADA/REPROGRAMADA` esa semana
   (por fecha del compromiso). Entran siempre, aunque superen la cuota.
2. El resto se ordena primero por **cobertura** (las NO contactadas dentro del ciclo actual van antes) y después:
   **NUEVA** (`POR_CONTACTAR` sin `lastContactAt`; más empleados primero) → **REINTENTO** (`SIN_RESPUESTA`; último
   intento más antiguo primero) → **ROTACION** (`lastContactAt` asc, nulos primero; `employeeCount` desc).
3. Tamaño = `max(cuota, seguimientos, ⌈pendientes de cubrir / semanas restantes⌉)`, acotado al tamaño de la cartera.
   Con 60 empresas y cuota 20 sale 20/20/20; si en la semana 1 solo se contactaron 10, la semana 2 pide 25 y la 3 lo que
   falte, de modo que el objetivo "toda la cartera contactada al menos una vez por ciclo" sigue siendo alcanzable.
4. "Contactada en el ciclo" = al menos una interacción (de cualquier usuario) con `occurredAt` dentro del ciclo.
5. Idempotente: índice único `(userId, weekStart)`; el plan + ítems se crea en una sola sentencia anidada y un choque
   con el índice se interpreta como "ya existía". Ejecutivos sin cartera no reciben plan vacío.

### 3. Pool y reparto (Strategy `PoolSelectionStrategy`, `DefaultPoolSelectionStrategy`)

- **Pool** = empresas sin asignación activa, con teléfono no vacío y estado distinto de `CONTRATO_ACTIVO`/`DESCARTADO`.
  Las empresas sin teléfono nunca se asignan automáticamente (la reasignación manual sí puede).
- Candidatos: las recicladas (última asignación liberada por `SIN_AVANCE`) + el TOP N por empleados. Orden: recicladas
  primero, después más empleados. Reparto **round-robin** (elige primero quien más hueco tiene) para no concentrar las
  mejores empresas, y **nunca** se devuelve una empresa a su ejecutivo anterior si hay otra candidata.
- Las carteras de usuarios desactivados o que dejaron de ser EJECUTIVO se liberan (`REASIGNACION_MANUAL`) en el job.

### 4. Definición de "avance" y cierre de ciclo

Una asignación **avanzó** en el ciclo si, dentro de la ventana `[inicio, fin]` del ciclo:

- (a) hay al menos una fila de `status_history` con `toStatus ∈ {CON_RESPUESTA, AGENDANDO_CITA, EN_PROCESO_CONTRATO, CONTRATO_ACTIVO}`, **o**
- (b) la empresa ya está en uno de esos estados y tuvo al menos una interacción en el ciclo (una negociación viva no es estancamiento).

No es avance: ninguna gestión, ni el bucle `POR_CONTACTAR → CONTACTADO ⇄ SIN_RESPUESTA` por muchos intentos que haya.

Al cerrar: con avance `cyclesWithoutProgress = 0` (cuenta ciclos **consecutivos**); sin avance `+1`, y al llegar a
`MAX_CYCLES_WITHOUT_PROGRESS` se libera (`releasedAt`, `releaseReason = SIN_AVANCE`). No se evalúan las asignaciones
hechas durante la última semana del ciclo (no tuvieron tiempo). Después se rellenan las carteras (punto 3).

### 5. Job semanal

`RunWeeklyRotationUseCase`: cerrar el ciclo si terminó → abrir el siguiente si no hay abierto → rellenar → generar
planes. Cron `0 6 * * 1` en America/Managua (`@nestjs/schedule`, `ScheduleModule.forRoot()` en `app.module`) y
`POST /api/portfolio/run-weekly` (ADMIN). Es idempotente (segunda ejecución = sin cambios) y dos llamadas simultáneas en
el mismo proceso comparten la ejecución; entre procesos lo protegen los índices únicos (`rotation_cycles.number`,
`weekly_plans(userId, weekStart)`, asignación activa única por empresa).

### 6. Reacciones al pipeline (Observer, `@OnEvent`)

- `pipeline.interaction-registered`: con `planItemId` se marca ese ítem (si es de la misma empresa); si no, los ítems
  de esa empresa en los planes de la semana local en que ocurrió la interacción. Solo se marca la primera vez.
- `pipeline.company-status-changed` a `CONTRATO_ACTIVO` / `DESCARTADO` → se libera la asignación con ese motivo.
- Los suscriptores registran y absorben sus errores: la operación del pipeline ya está confirmada.

### 7. Control de acceso del pipeline

- Puerto `CompanyAccessPolicy.canOperate(actor, companyId)` + token `COMPANY_ACCESS_POLICY` en la capa de aplicación de
  `pipeline` (exportados por su `index.ts`). `ChangeCompanyStatusUseCase` y `RegisterInteractionUseCase` lo consultan
  antes de la transacción; denegado → `403 PORTFOLIO_COMPANY_NOT_ASSIGNED`.
- El pipeline inyecta el puerto con `@Optional()` y, si nadie lo registra, usa `AllowAllCompanyAccessPolicy`.
- `PortfolioModule` es `@Global` y exporta `COMPANY_ACCESS_POLICY` → `PortfolioCompanyAccessPolicy`
  (ADMIN/SUPERVISOR: todo; EJECUTIVO: solo con asignación activa).

Por qué así: `portfolio` depende de `pipeline` (eventos, puerto) y `pipeline` no conoce `portfolio`, así que no hay ciclo
de módulos ni de archivos (dependency-cruiser en verde). Alternativas descartadas: `PipelineModule.forRoot({policy})`
(si otro módulo, p. ej. contracts, importase `PipelineModule` "a secas" habría dos instancias, rutas duplicadas y una sin
control) y un token en `shared` (el puerto pertenece al pipeline). Riesgo aceptado: si se quita `PortfolioModule` de la
app el control desaparece en silencio; lo cubre el test `wiring.test.ts`.

### 8. Asignación manual

ADMIN/SUPERVISOR (comprobado con `@Roles` y otra vez en el caso de uso): reasignar (`REASIGNACION_MANUAL` de la previa;
se omiten las que ya son del destino, inexistentes o fuera de rotación), asignación masiva desde el pool por
sector/actividad/empleados (más empleados primero; no limitada al tamaño de cartera) y liberar una asignación.

## Consecuencias

- Sin migración nueva: los índices existentes bastan (BD local, 103 657 empresas: pool de 1 250 candidatos ~350 ms,
  rotación completa de 9 ejecutivos ~2 s, `my-week` ~50 ms, `cycles/current` ~40 ms).
- La zona del cron es fija (valor por defecto de `TIMEZONE`); el cálculo de semanas sí lee el parámetro.
- Cambiar prioridades o reparto = otra implementación de la estrategia y cambiar el proveedor en `PortfolioModule`.

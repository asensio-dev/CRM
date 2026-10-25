# ADR 0005 — Citas y contratos de venta

- **Estado:** aceptado (2026-10-25)
- **Código:** `backend/src/modules/appointments`, `backend/src/modules/contracts`, contratos en `packages/contracts/src/appointments.ts` y `sales-contracts.ts`

## Contexto

Las citas y los contratos empujan a la empresa por el tramo final del pipeline (`CON_RESPUESTA → AGENDANDO_CITA → EN_PROCESO_CONTRATO → CONTRATO_ACTIVO`). Solo el módulo `pipeline` escribe `companies.status` (ADR 0003): estos módulos lo mueven únicamente a través de `ChangeCompanyStatusUseCase` (API pública).

## Decisión

### Integración con el pipeline

La API pública de `pipeline` no expone una lectura del estado, así que cada módulo tiene un puerto `CompanyPipelineGateway` (adaptador `PipelineStatusGateway`) que **intenta la transición** y interpreta el rechazo: `PIPELINE_INVALID_TRANSITION` con `details.from` en la lista de estados tolerados = "ya estaba ahí" (sin cambio, sin error); desde cualquier otro estado se lanza un `RULE` (422) propio con `{from, to, allowed}`. Errores 404/403/409 del pipeline se propagan sin cambios. La operación del módulo y el cambio de estado van en **una transacción** (`UnitOfWork`, anidada = misma transacción): si el pipeline rechaza, no se crea/cambia nada. Los eventos del pipeline (y de cualquier caso de uso anidado) se difieren hasta que confirma la transacción más externa y se descartan si hace rollback (`PrismaService.afterCommit` usado por `NestEventBus`).

| Operación | Destino | Estados tolerados (sin cambio) | Resto de estados |
|---|---|---|---|
| Agendar cita | `AGENDANDO_CITA` | `AGENDANDO_CITA`, `EN_PROCESO_CONTRATO`, `CONTRATO_ACTIVO` | 422 `APPOINTMENT_COMPANY_NOT_READY` (`POR_CONTACTAR`, `CONTACTADO`, `SIN_RESPUESTA`, `DESCARTADO`) |
| Crear contrato / marcarlo `ENVIADO` | `EN_PROCESO_CONTRATO` | `EN_PROCESO_CONTRATO`, `CONTRATO_ACTIVO` | 422 `CONTRACT_COMPANY_NOT_READY` |
| Contrato `ACTIVO` | `CONTRATO_ACTIVO` | `CONTRATO_ACTIVO` | 422 `CONTRACT_COMPANY_NOT_READY` |
| Reprogramar, completar, cancelar cita; `FIRMADO`/`CANCELADO` de contrato | — | no tocan el pipeline | — |

Decisión: **no se permite agendar sin respuesta previa** (rechazo en lugar de "cita sin transición"): una cita solo tiene sentido tras una conversación. Cancelar una cita o un contrato no retrocede el pipeline; el usuario lo mueve en el tablero (evita retrocesos automáticos sorpresivos).

### Citas

`PROGRAMADA → REALIZADA | CANCELADA | REPROGRAMADA` (los tres finales). `scheduledAt` debe ser futura al crear/reprogramar; `PRESENCIAL` exige `location`. **Reprogramar** deja la cita original intacta en `REPROGRAMADA` (histórico) y **crea una cita nueva `PROGRAMADA`** (mismo dueño y empresa; modo/lugar/notas heredados salvo que se indiquen); responde `{previous, appointment}`. Completar exige un resultado y lo anexa a `notes` (`Resultado: …`); cancelar anexa `Cancelación: …` si hay motivo; el total de `notes` no puede pasar de 2000. Permisos: `EJECUTIVO` solo sus citas (otro `userId` → 403 `APPOINTMENT_FORBIDDEN`); `SUPERVISOR`/`ADMIN` todas y pueden agendar para otro usuario. La agenda (`GET /api/appointments/agenda?from&to&userId`) es el rango `[from, to)` (máx. 62 días, 500 filas) ordenado por fecha.

### Contratos

- `code` = `CT-AAAA-NNNNNN` derivado del id identity (único por construcción): se inserta con un código temporal y se reemplaza en la misma transacción. Año = año UTC de creación.
- Dinero: `amount` es siempre `string` decimal con 2 decimales (`"1500.50"`) en API y dominio; la BD es `DECIMAL(18,2)` (Prisma `Decimal`, solo `toFixed(2)`). Nunca aritmética flotante. Moneda `NIO | USD`.
- Fechas `startDate`/`endDate` son fechas calendario (`YYYY-MM-DD`, columnas `DATE`); `endDate >= startDate`, `endDate` opcional. "Hoy" se calcula en hora de Nicaragua (UTC-6).
- Estados: `BORRADOR → ENVIADO → FIRMADO → ACTIVO`; `CANCELADO` desde cualquier estado no final. Solo `BORRADOR` es editable (`PATCH`, 422 `CONTRACT_NOT_DRAFT`).
- **`VENCIDO` es una regla de consulta**: un contrato `ACTIVO` con `endDate < hoy` se *presenta* como `VENCIDO` (DTO y filtros `status=VENCIDO|ACTIVO` lo evalúan en SQL). No se persiste (no hace falta job y no hay estados desfasados); `VENCIDO` no se puede solicitar manualmente y es final; no se puede activar un contrato ya vencido. Si un reporte futuro necesita el valor persistido, un job diario puede materializarlo con `UPDATE … WHERE status='ACTIVO' AND endDate < hoy` sin cambiar la API.
- Permisos: `EJECUTIVO` ve y gestiona los contratos que creó; `SUPERVISOR`/`ADMIN` todos.

## Consecuencias / cambios de esquema sugeridos (no aplicados, dueño del esquema = otro agente)

- `appointments.rescheduledFromId INT NULL` (FK a sí misma) para enlazar la cadena de reprogramaciones; hoy el enlace es implícito.
- Índice `contracts(status, endDate)` si el filtro `VENCIDO/ACTIVO` se vuelve frecuente en tablas grandes.
- Un `CHECK (endDate IS NULL OR endDate >= startDate)` en `contracts` y `currency IN ('NIO','USD')` (nueva migración + `schema-consistency`).

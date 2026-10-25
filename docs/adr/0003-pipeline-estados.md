# ADR 0003 — Máquina de estados del pipeline y política de resultados

- **Estado:** aceptado (2026-10-24)
- **Código:** `backend/src/modules/pipeline/domain`

## Contexto

Cada empresa avanza por un pipeline comercial. Las transiciones se validan en el dominio (no en el controlador ni en el frontend) y cada interacción registrada puede mover el estado automáticamente. El módulo `pipeline` es el **único** que escribe `companies.status`, `companies.version`, `companies.lastContactAt` y las tablas `interactions` y `status_history`; `companies` solo los lee.

## Decisión

### 1. Máquina de estados (patrón State)

`PipelineStatus` (value object) delega en una clase por estado que conoce sus salidas:

| Desde | Hacia |
|---|---|
| `POR_CONTACTAR` | `CONTACTADO` |
| `CONTACTADO` | `SIN_RESPUESTA`, `CON_RESPUESTA` |
| `SIN_RESPUESTA` | `CONTACTADO` (reintento) |
| `CON_RESPUESTA` | `AGENDANDO_CITA`, `SIN_RESPUESTA` |
| `AGENDANDO_CITA` | `EN_PROCESO_CONTRATO`, `CON_RESPUESTA` |
| `EN_PROCESO_CONTRATO` | `CONTRATO_ACTIVO`, `AGENDANDO_CITA` |
| `CONTRATO_ACTIVO` | — (terminal) |
| cualquier no terminal | `DESCARTADO` (nota obligatoria) |
| `DESCARTADO` | `POR_CONTACTAR` (reactivación, solo `ADMIN` / `SUPERVISOR`) |

Errores: transición no listada → `RULE PIPELINE_INVALID_TRANSITION` con `{from, to, allowed}` (HTTP 422); reactivar sin rol → `FORBIDDEN PIPELINE_REACTIVATION_FORBIDDEN` (403); `DESCARTADO` sin nota → `VALIDATION PIPELINE_NOTE_REQUIRED` (400). El frontend no duplica la tabla: recibe `allowedNextStatuses` (ya filtrado por rol) en `GET /api/pipeline/companies/:id`.

### 2. Política de resultados (patrón Strategy)

`OutcomePolicy` propone pasos; el agregado valida **todo el camino antes de mutar** (todo o nada). `DefaultOutcomePolicy`:

1. Desde `POR_CONTACTAR` o `SIN_RESPUESTA`, toda interacción es un intento → `CONTACTADO`.
2. Si (tras el paso 1) está en `CONTACTADO`:
   - `NO_CONTESTO`, `NUMERO_EQUIVOCADO` → `SIN_RESPUESTA`
   - `CONTESTO`, `INTERESADO`, `VOLVER_A_LLAMAR` → `CON_RESPUESTA`
   - `NO_INTERESADO` → sin cambio (descartar lo decide el usuario, con motivo)
3. `CON_RESPUESTA` en adelante, `CONTRATO_ACTIVO` y `DESCARTADO`: se registra sin transiciones automáticas.
4. Si el cliente envía `targetStatus` distinto del estado alcanzado, se aplica **después** de los pasos automáticos y lo valida la máquina de estados (nota: `statusNote` o, si falta, `notes`). Ej.: `POR_CONTACTAR` + `INTERESADO` + `targetStatus=AGENDANDO_CITA` → 3 transiciones.

Cada paso deja una fila en `status_history` (los automáticos con nota `Automático: <canal> / <resultado>`) y un evento `pipeline.company-status-changed`. Toda interacción actualiza `lastContactAt` (sin retroceder si se registra un contacto pasado) y emite `pipeline.interaction-registered` (incluye `planItemId` para que `portfolio` marque el ítem del plan).

### 3. Consistencia

- Interacción + historial + `UPDATE companies` en una transacción (`UnitOfWork.run`).
- **Bloqueo optimista**: `UPDATE … WHERE id = ? AND version = ?` y `version + 1` en **cada** escritura del pipeline (también al registrar una interacción sin cambio de estado, porque cambia `lastContactAt`). 0 filas → `409 PIPELINE_CONCURRENT_UPDATE`. El cliente puede enviar `expectedVersion` (409 `PIPELINE_VERSION_MISMATCH` si no coincide).
- Los eventos se publican solo tras confirmar la transacción.

## Consecuencias

- Cambiar la política (p. ej. que `NO_INTERESADO` descarte) es añadir otra implementación de `OutcomePolicy` y cambiar el proveedor `OUTCOME_POLICY`, sin tocar casos de uso.
- Añadir un estado exige: contracts + `CHECK` en migración nueva + una clase de estado + actualizar la matriz de tests.
- El tablero (`GET /api/pipeline/board`) es una sola consulta parametrizada con dos planes: sin texto, `GROUP BY status` + `CROSS APPLY TOP N` por estado (~260 ms en caliente con 94 k filas); con `q`, `ROW_NUMBER()/COUNT(*) OVER (PARTITION BY status)` para evaluar el `LIKE` una sola vez. Se recomienda el índice `companies(status, lastContactAt, employeeCount DESC, id) INCLUDE (legalName, tradeName, phone)` para que el `TOP N` sea un seek.

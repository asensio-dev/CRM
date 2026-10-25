# API REST de AXIOM CRM

Referencia de los endpoints del backend. Se deriva de los controladores (`backend/src/modules/*/infrastructure/http/*.controller.ts`) y de los esquemas Zod de `packages/contracts/src`. Si este documento y el código no coinciden, manda el código.

- **Base URL:** `http://localhost:3000/api` en desarrollo (todas las rutas llevan el prefijo `/api`).
- **Documentación interactiva (Swagger UI):** `http://localhost:3000/api/docs` y JSON OpenAPI en `/api/docs-json`. Solo se sirve cuando `NODE_ENV` **no** es `production`. Las peticiones con body se validan con Zod, así que Swagger muestra rutas, etiquetas y autenticación, pero no un esquema detallado de cada campo; este documento es la referencia de los campos.
- **Formato:** JSON en UTF-8. Fechas en ISO 8601 (`2026-10-24T15:00:00-06:00`) salvo las fechas de negocio (`YYYY-MM-DD`, hora de Managua). Importes como texto decimal (`"1500.00"`).

## 1. Autenticación y sesión

El guard global (`JwtAuthGuard`, módulo `identity`) exige un access token en todas las rutas salvo las marcadas como públicas (`@Public()`).

1. `POST /api/auth/login` con email y contraseña devuelve `accessToken` y `user`. Además fija la cookie `refresh_token`.
2. El frontend guarda el **access token solo en memoria** (nunca en `localStorage`) y lo envía en cada petición:
   `Authorization: Bearer <accessToken>`. Su vida es `JWT_ACCESS_TTL` (15 min por defecto).
3. La cookie `refresh_token` es `httpOnly`, `SameSite=Strict`, con `Path=/api/auth` (solo viaja a rutas de autenticación) y `Secure` cuando `NODE_ENV=production`. Su vida es `JWT_REFRESH_TTL` (7 días por defecto).
4. Cuando una petición responde `401`, el cliente llama a `POST /api/auth/refresh`. El servidor valida la cookie, **rota** el refresh token (emite una cookie nueva) y devuelve un access token nuevo. Si la sesión ya no es válida, responde `401` y borra la cookie.
5. `POST /api/auth/logout` revoca el refresh token y borra la cookie (`204`).

Límites de intentos (`@nestjs/throttler`, por IP): login, 5 peticiones por minuto; refresh, 30 por minuto. Al superarlo, la respuesta es `429`.

Roles: `ADMIN`, `SUPERVISOR`, `EJECUTIVO`. En este documento, «Autenticado» significa cualquier rol; «Todos» se refiere a los tres roles.

## 2. Formato de errores

Todos los errores tienen la misma forma (`ApiError`):

```json
{
  "statusCode": 422,
  "code": "PIPELINE_INVALID_TRANSITION",
  "message": "Transición no permitida",
  "details": { "from": "POR_CONTACTAR", "to": "CONTRATO_ACTIVO", "allowed": ["CONTACTADO"] }
}
```

- `code` es estable y pensado para que el cliente lo trate; `message` es texto en español para mostrar.
- `details` aparece cuando aporta contexto. En los errores de validación (`INVALID_INPUT`) contiene la lista de problemas de Zod. Los mensajes no incluyen datos personales.
- Los errores de dominio se traducen por su tipo: `VALIDATION` → 400, `NOT_FOUND` → 404, `CONFLICT` → 409, `FORBIDDEN` → 403, `RULE` → 422. Los errores inesperados devuelven `500` con `INTERNAL_ERROR` y sin detalles técnicos.
- Errores genéricos de framework: `400 INVALID_INPUT` (body, query o params no válidos), `400 BAD_REQUEST` (parámetro numérico mal formado), `401 UNAUTHORIZED`, `403 FORBIDDEN` (rol insuficiente), `404 NOT_FOUND` (ruta inexistente), `429 TOO_MANY_REQUESTS`.

## 3. Paginación

Las listas paginadas aceptan `page` (≥ 1, por defecto 1) y `pageSize` (1–100, por defecto 25) y devuelven:

```json
{ "items": [], "page": 1, "pageSize": 25, "total": 0 }
```

## 4. Endpoints por módulo

### 4.1 Salud (`health`)

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/health` | Pública | — | `{ status: "ok", database: "up" }` | 500 si no hay conexión con la base |

### 4.2 Autenticación (`identity`, `auth`)

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | Pública (límite 5/min) | Body `LoginRequest`: `email` (email válido, ≤ 150), `password` (8–200 caracteres) | `200` `LoginResponse`: `accessToken`, `user` (`AuthUser`: `id`, `email`, `fullName`, `role`). Fija cookie `refresh_token` | `400 INVALID_INPUT`; `401` «Credenciales inválidas» (no distingue usuario de contraseña); `429` |
| POST | `/api/auth/refresh` | Pública (cookie) | Cookie `refresh_token` | `200` `LoginResponse` nuevo; rota la cookie | `401` «Sesión inválida o expirada» (borra la cookie); `429` |
| POST | `/api/auth/logout` | Pública | Cookie `refresh_token` (opcional) | `204`; revoca el refresh token y borra la cookie | — |
| GET | `/api/auth/me` | Autenticado | — | `200` `AuthUser` | `401` |

### 4.3 Usuarios (`identity`, `users`)

Solo `ADMIN`. Los usuarios no se borran: se desactivan.

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/users` | ADMIN | Query `page`, `pageSize` | `200` `Paginated<UserDto>` (`id`, `email`, `fullName`, `role`, `isActive`, `createdAt`) | `403` |
| POST | `/api/users` | ADMIN | Body `CreateUser`: `email` (≤ 150), `fullName` (1–150, se recorta), `password` (8–200), `role` (`ADMIN`, `SUPERVISOR`, `EJECUTIVO`) | `201` `UserDto` | `400 INVALID_INPUT`, `400 INVALID_EMAIL`, `400 INVALID_NAME`, `409 EMAIL_TAKEN` |
| PATCH | `/api/users/:id` | ADMIN | Params `id` (entero). Body `UpdateUser`: al menos uno de `fullName`, `role`, `isActive` | `200` `UserDto` | `404 USER_NOT_FOUND`, `422 CANNOT_DEACTIVATE_SELF`, `422 LAST_ADMIN` (no puede quedar sin ningún administrador activo) |
| POST | `/api/users/:id/reset-password` | ADMIN | Body `ResetPassword`: `newPassword` (8–200) | `204` | `404 USER_NOT_FOUND` |

### 4.4 Catálogos (`catalogs`)

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/catalogs/sectors` | Autenticado | — | `200` `CatalogItem[]` (`id`, `name`) | — |
| GET | `/api/catalogs/activities` | Autenticado | Query `q` (texto, ≤ 100, opcional) | `200` `CatalogItem[]` | `400 INVALID_INPUT` |

### 4.5 Empresas (`companies`)

Ninguna ruta de este módulo restringe por rol: cualquier usuario autenticado puede consultar y editar empresas. La cédula del representante legal (`legalRepIdNumber`) solo se incluye en la respuesta para `ADMIN` y `SUPERVISOR`.

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/companies` | Autenticado | Query `CompanySearchQuery` (ver abajo) | `200` `Paginated<CompanyListItem>` | `400 INVALID_INPUT` |
| GET | `/api/companies/:id` | Autenticado | Params `id` | `200` `CompanyDetail` | `404 COMPANY_NOT_FOUND` |
| POST | `/api/companies` | Autenticado | Body `CreateCompany` (ver abajo) | `201` `CompanyDetail` (estado `POR_CONTACTAR`, origen `MANUAL`) | `400 COMPANY_RUC_INVALID`, `400 COMPANY_FIELD_REQUIRED`, `400 COMPANY_FIELD_TOO_LONG`, `400 COMPANY_EMPLOYEE_COUNT_INVALID`, `400 COMPANY_PHONE_INVALID`, `400 COMPANY_SECTOR_NOT_FOUND`, `400 COMPANY_ACTIVITY_NOT_FOUND`, `409 COMPANY_RUC_DUPLICATED` |
| PATCH | `/api/companies/:id` | Autenticado | Body `UpdateCompany` (parcial, sin campos extra). No cambia el RUC ni el estado | `200` `CompanyDetail` | Los de creación (sin RUC) y `404 COMPANY_NOT_FOUND` |
| POST | `/api/companies/:id/branches` | Autenticado | Body `CreateBranch`: `tradeName`, `address` (≤ 300), `phone`, `employeeCount` (entero 0–10 000 000, por defecto 0) | `201` `CompanyDetail` (incluye la sucursal) | `404 COMPANY_NOT_FOUND`, `400 INVALID_INPUT` |

**Query `CompanySearchQuery` (`GET /api/companies`):**

| Parámetro | Tipo y restricciones | Por defecto |
|---|---|---|
| `page`, `pageSize` | entero ≥ 1; `pageSize` ≤ 100 | 1, 25 |
| `q` | texto ≤ 100; busca en RUC, razón social y nombre comercial (ignora tildes y mayúsculas) | — |
| `status` | estado del pipeline; se puede repetir (`status=A&status=B`) o separar por comas (`status=A,B`) | — |
| `sectorId`, `activityId` | entero ≥ 1 | — |
| `minEmployees`, `maxEmployees` | entero ≥ 0; `minEmployees` ≤ `maxEmployees` | — |
| `hasPhone` | `true`/`false`/`1`/`0` | — |
| `sortBy` | `legalName`, `employeeCount`, `lastContactAt`, `createdAt` | `legalName` |
| `sortDir` | `asc`, `desc` | `asc` |

**Body `CreateCompany`:** `ruc` (obligatorio; se normaliza a mayúsculas sin espacios ni guiones, ≤ 20), `legalName` (1–200, obligatorio), `tradeName` (≤ 200), `legalRepName` (≤ 100), `legalRepIdNumber` (≤ 20), `employeeCount` (0–10 000 000, por defecto 0), `phone` (≤ 30), `shippingAddress` (≤ 300), `particularAddress` (≤ 300), `activityId` y `sectorId` (entero ≥ 1 o `null`). Los textos opcionales admiten `null` o cadena vacía para borrar el valor.

**Respuestas:** `CompanyListItem` contiene `id`, `ruc`, `legalName`, `tradeName`, `employeeCount`, `phone`, `status`, `sectorId`/`sectorName`, `activityId`/`activityName`, `lastContactAt`, `createdAt` (sin datos personales). `CompanyDetail` añade `legalRepName`, `legalRepIdNumber` (solo ADMIN/SUPERVISOR), `shippingAddress`, `particularAddress`, `source` (`EXCEL` | `MANUAL`), `version`, `updatedAt` y `branches` (`CompanyBranchDto`: `id`, `tradeName`, `address`, `phone`, `employeeCount`, `createdAt`).

### 4.6 Pipeline (`pipeline`)

Estados válidos: `POR_CONTACTAR`, `CONTACTADO`, `SIN_RESPUESTA`, `CON_RESPUESTA`, `AGENDANDO_CITA`, `EN_PROCESO_CONTRATO`, `CONTRATO_ACTIVO`, `DESCARTADO`. Canales: `LLAMADA`, `WHATSAPP`, `CORREO`, `VISITA`, `OTRO`. Resultados: `CONTESTO`, `NO_CONTESTO`, `NUMERO_EQUIVOCADO`, `INTERESADO`, `NO_INTERESADO`, `VOLVER_A_LLAMAR`. La máquina de estados y la política automática de resultados están en el [ADR 0003](adr/0003-pipeline-estados.md).

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/pipeline/board` | Autenticado | Query `BoardQuery`: `sectorId`, `activityId` (enteros ≥ 1), `q` (1–100), `limitPerColumn` (1–100, por defecto 20) | `200` `BoardDto`: `columns[]` con `status`, `count` (total, no solo tarjetas) y `cards[]` (`id`, `legalName`, `tradeName`, `phone`, `employeeCount`, `lastContactAt`) | `400 INVALID_INPUT` |
| GET | `/api/pipeline/companies/:id` | Autenticado | Params `id` | `200` `PipelineStateDto`: `companyId`, `status`, `version`, `lastContactAt`, `allowedNextStatuses` (ya filtrados por rol) | `404 PIPELINE_COMPANY_NOT_FOUND`, `403 PORTFOLIO_COMPANY_NOT_ASSIGNED` |
| GET | `/api/pipeline/companies/:id/timeline` | Autenticado | Query `page`, `pageSize` | `200` `Paginated<TimelineEntryDto>`: entradas `INTERACTION` (canal, resultado, notas, `nextFollowUpAt`, `planItemId`) o `STATUS_CHANGE` (`fromStatus`, `toStatus`, `note`); ambas con `user` y `occurredAt` | `404 PIPELINE_COMPANY_NOT_FOUND` |
| POST | `/api/pipeline/companies/:id/status` | Autenticado (según reglas de transición y rol) | Body `ChangeStatusRequest`: `to` (estado), `note` (1–1000; **obligatoria** para `DESCARTADO`), `expectedVersion` (entero ≥ 0, opcional) | `200` `PipelineStateDto` | `422 PIPELINE_INVALID_TRANSITION` (`details`: `from`, `to`, `allowed`), `403 PIPELINE_REACTIVATION_FORBIDDEN` (reactivar desde `DESCARTADO` solo ADMIN/SUPERVISOR), `400 PIPELINE_NOTE_REQUIRED`, `409 PIPELINE_VERSION_MISMATCH`, `409 PIPELINE_CONCURRENT_UPDATE`, `403 PORTFOLIO_COMPANY_NOT_ASSIGNED` (ejecutivo fuera de su cartera), `404 PIPELINE_COMPANY_NOT_FOUND` |
| POST | `/api/pipeline/companies/:id/interactions` | Autenticado | Body `RegisterInteractionRequest`: `channel` (obligatorio), `outcome` (obligatorio), `notes` (1–2000), `occurredAt` (ISO con zona, por defecto ahora; no puede ser futuro), `nextFollowUpAt` (ISO; no antes del contacto), `planItemId` (entero ≥ 1), `targetStatus` (estado final deseado), `statusNote` (1–1000), `expectedVersion` (entero ≥ 0) | `201` `RegisterInteractionResultDto`: `state` (`PipelineStateDto`) y `transitions[]` (`from`, `to`) aplicadas, automáticas y explícita | `400 INTERACTION_IN_FUTURE`, `400 INTERACTION_FOLLOW_UP_BEFORE_CONTACT`, `400 INTERACTION_NOTES_TOO_LONG`, `422 PIPELINE_INVALID_TRANSITION`, `409 PIPELINE_VERSION_MISMATCH`, `409 PIPELINE_CONCURRENT_UPDATE`, `403 PORTFOLIO_COMPANY_NOT_ASSIGNED`, `404 PIPELINE_COMPANY_NOT_FOUND` |

Regla de acceso: un `EJECUTIVO` solo puede cambiar el estado o registrar interacciones de empresas con asignación activa en su cartera (`PORTFOLIO_COMPANY_NOT_ASSIGNED`). `ADMIN` y `SUPERVISOR` operan sobre cualquier empresa.

### 4.7 Importación (`import`)

Solo `ADMIN`. El procesamiento es asíncrono: el cliente consulta el job hasta `COMPLETADO` o `FALLIDO`. Los detalles del proceso están en [despliegue.md](despliegue.md) y en el ADR 0002.

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| POST | `/api/import` | ADMIN | `multipart/form-data`, campo `file` con un `.xlsx` (≤ 50 MB) | `202` `{ jobId }` | `400` si falta el archivo o no es `.xlsx`; `413` si supera 50 MB; `403` |
| GET | `/api/import/:id` | ADMIN | Params `id` | `200` `ImportJobDto`: `id`, `fileName`, `status` (`PENDIENTE`, `PROCESANDO`, `COMPLETADO`, `FALLIDO`), `totalRows`, `insertedCount`, `updatedCount`, `branchCount`, `rejectedCount`, `errorMessage`, `startedAt`, `finishedAt` | `404 IMPORT_JOB_NOT_FOUND` |
| GET | `/api/import/:id/rejections` | ADMIN | Query `page`, `pageSize` | `200` `Paginated<ImportRejectionDto>` (`id`, `rowNumber`, `reason`). Nunca incluye los datos de la fila | `404 IMPORT_JOB_NOT_FOUND` |

Un archivo sin las columnas esperadas hace fallar el job con `IMPORT_MISSING_COLUMNS` (visible en `errorMessage`).

### 4.8 Citas (`appointments`)

Estados: `PROGRAMADA`, `REALIZADA`, `CANCELADA`, `REPROGRAMADA`. Modalidades: `PRESENCIAL`, `VIRTUAL`, `TELEFONICA`. Reglas de estado de la empresa en el [ADR 0005](adr/0005-citas-y-contratos.md).

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/appointments` | Autenticado | Query: `page`, `pageSize`, `userId`, `companyId` (enteros), `status`, `from`, `to` (ISO con zona; `from` < `to`) | `200` `Paginated<AppointmentDto>` | `403 APPOINTMENT_FORBIDDEN` (ejecutivo pidiendo otro `userId`), `400 INVALID_INPUT` |
| GET | `/api/appointments/agenda` | Autenticado | Query obligatorias `from`, `to` (ISO con zona; rango `[from, to)`, máximo 62 días), `userId` opcional | `200` `AppointmentDto[]` ordenado por fecha (máx. 500) | `400 INVALID_INPUT` |
| POST | `/api/appointments` | Autenticado | Body: `companyId`, `scheduledAt` (futuro), `mode` (obligatorio), `location` (1–300; obligatoria si `PRESENCIAL`), `notes` (1–2000), `userId` (solo ADMIN/SUPERVISOR; por defecto, el usuario autenticado) | `201` `AppointmentDto` | `400 APPOINTMENT_DATE_IN_PAST`, `400 APPOINTMENT_LOCATION_REQUIRED`, `400 APPOINTMENT_LOCATION_TOO_LONG`, `400 APPOINTMENT_NOTES_TOO_LONG`, `422 APPOINTMENT_COMPANY_NOT_READY` (la empresa debe tener respuesta previa: `CON_RESPUESTA`, `AGENDANDO_CITA` u otros estados posteriores), `403 APPOINTMENT_FORBIDDEN`, `400 APPOINTMENT_REFERENCE_NOT_FOUND` |
| POST | `/api/appointments/:id/reschedule` | Autenticado | Body: `scheduledAt` (futuro), `mode`, `location`, `notes` (opcionales; se heredan los que no se indiquen) | `200` `RescheduleResultDto`: `previous` (la original, en `REPROGRAMADA`) y `appointment` (nueva, `PROGRAMADA`) | `404 APPOINTMENT_NOT_FOUND`, `422 APPOINTMENT_NOT_SCHEDULED`, `403 APPOINTMENT_FORBIDDEN`, `409 APPOINTMENT_CONCURRENT_UPDATE` |
| POST | `/api/appointments/:id/complete` | Autenticado | Body: `outcome` (1–1500, obligatorio) | `200` `AppointmentDto` (`REALIZADA`; el resultado queda anexado a `notes`) | `422 APPOINTMENT_NOT_SCHEDULED`, `400 APPOINTMENT_OUTCOME_REQUIRED`, `404`, `403`, `409` |
| POST | `/api/appointments/:id/cancel` | Autenticado | Body: `reason` (1–1000, opcional) | `200` `AppointmentDto` (`CANCELADA`; no retrocede el pipeline) | `422 APPOINTMENT_NOT_SCHEDULED`, `404`, `403`, `409` |

Un `EJECUTIVO` solo gestiona sus propias citas; `SUPERVISOR` y `ADMIN` gestionan todas.

### 4.9 Contratos de venta (`contracts`)

Estados: `BORRADOR`, `ENVIADO`, `FIRMADO`, `ACTIVO`, `CANCELADO`, `VENCIDO`. `VENCIDO` lo calcula el sistema: un contrato `ACTIVO` con `endDate` anterior a hoy se muestra como `VENCIDO`; no se puede solicitar. Monedas: `NIO`, `USD`. Reglas en el [ADR 0005](adr/0005-citas-y-contratos.md).

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/contracts` | Autenticado (ejecutivo: solo los que creó) | Query: `page`, `pageSize`, `status`, `companyId`, `startFrom`, `startTo` (fechas `YYYY-MM-DD`, inclusive) | `200` `Paginated<ContractDto>` | `400 INVALID_INPUT` |
| GET | `/api/contracts/:id` | Autenticado (ejecutivo: solo los que creó) | Params `id` | `200` `ContractDto` | `404 CONTRACT_NOT_FOUND`, `403 CONTRACT_FORBIDDEN` |
| POST | `/api/contracts` | Autenticado | Body `CreateContractRequest`: `companyId`, `startDate` (`YYYY-MM-DD`), `endDate` (opcional, ≥ `startDate`), `amount` (decimal no negativo, hasta 2 decimales, texto), `currency` (`NIO` por defecto, o `USD`), `notes` (1–2000) | `201` `ContractDto` (código `CT-AAAA-NNNNNN`, estado `BORRADOR`) | `400 CONTRACT_INVALID_AMOUNT`, `400 CONTRACT_INVALID_DATES`, `400 CONTRACT_NOTES_TOO_LONG`, `400 CONTRACT_REFERENCE_NOT_FOUND`, `422 CONTRACT_COMPANY_NOT_READY` |
| PATCH | `/api/contracts/:id` | Autenticado | Body parcial: `startDate`, `endDate` (`null` la quita), `amount`, `currency`, `notes` (`null` la borra); al menos un campo | `200` `ContractDto` | `422 CONTRACT_NOT_DRAFT` (solo se edita en `BORRADOR`), `400`, `404`, `403` |
| POST | `/api/contracts/:id/status` | Autenticado | Body `ChangeContractStatusRequest`: `to` (`ENVIADO`, `FIRMADO`, `ACTIVO`, `CANCELADO`; no `VENCIDO`) | `200` `ContractDto` | `422 CONTRACT_INVALID_TRANSITION`, `422 CONTRACT_STATUS_SYSTEM_MANAGED` (si se pide `VENCIDO`), `422 CONTRACT_ALREADY_EXPIRED`, `422 CONTRACT_COMPANY_NOT_READY`, `422 PIPELINE_INVALID_TRANSITION`, `409 CONTRACT_CONCURRENT_UPDATE`, `404`, `403` |

Importes: `amount` es siempre texto decimal con dos decimales (`"1500.00"`); nunca se usan números de coma flotante. Un contrato `ACTIVO` lleva la empresa a `CONTRATO_ACTIVO` en el pipeline.

### 4.10 Cartera y rotación (`portfolio`)

Ciclos de 3 semanas (lunes a domingo, zona America/Managua), cartera de 60 empresas por ejecutivo y plan semanal de al menos 20 contactos. Ver [ADR 0006](adr/0006-cartera-rotativa.md) y el plan, §1.2.

| Método | Ruta | Roles | Entrada | Respuesta | Errores |
|---|---|---|---|---|---|
| GET | `/api/portfolio/my-week` | Autenticado | Query `userId` opcional (solo ADMIN/SUPERVISOR pueden pedir a otro usuario) | `200` `MyWeekDto`: `week` (ciclo y semana actual, o `null`), `planId`, `quota`, `contactedCount`, `totalItems`, `items[]` (empresa, `reason` `SEGUIMIENTO`/`NUEVA`/`REINTENTO`/`ROTACION`, `priority`, `contactedAt`, `nextFollowUpAt`) | `403 PORTFOLIO_FORBIDDEN` |
| GET | `/api/portfolio/cycles/current` | Autenticado | — | `200` `CurrentCycleDto`: `week` y `executives[]` con cobertura del ciclo (`assigned`, `contactedThisCycle`, `coveragePct`, plan). Un ejecutivo solo ve su fila | — |
| GET | `/api/portfolio/assignments` | Autenticado | Query `page`, `pageSize`, `userId` | `200` `Paginated<AssignmentDto>` (empresa, ejecutivo, `assignedAt`, `cyclesWithoutProgress`) | `400 INVALID_INPUT` |
| POST | `/api/portfolio/assignments/reassign` | ADMIN, SUPERVISOR | Body `ReassignRequest`: `companyIds` (1–500 enteros), `toUserId` | `200` `AssignmentChangeResultDto`: `assigned[]`, `released[]`, `skipped[]` | `422 PORTFOLIO_TARGET_NOT_EXECUTIVE`, `404 PORTFOLIO_USER_NOT_FOUND`, `403 PORTFOLIO_FORBIDDEN` |
| POST | `/api/portfolio/assignments/bulk` | ADMIN, SUPERVISOR | Body `BulkAssignRequest`: `toUserId`, `limit` (1–500, obligatorio); `filters` opcional (`sectorId`, `activityId`, `minEmployees`). Reparte empresas del pool | `200` `AssignmentChangeResultDto` | `422 PORTFOLIO_TARGET_NOT_EXECUTIVE`, `422 PORTFOLIO_NO_ACTIVE_CYCLE`, `404 PORTFOLIO_USER_NOT_FOUND` |
| POST | `/api/portfolio/assignments/:id/release` | ADMIN, SUPERVISOR | Body opcional `reason`: `SIN_AVANCE`, `REASIGNACION_MANUAL`, `CONTRATO_ACTIVO`, `DESCARTADO` (por defecto `{}`) | `200` `AssignmentChangeResultDto` | `404 PORTFOLIO_ASSIGNMENT_NOT_FOUND`, `422 PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED`, `403 PORTFOLIO_FORBIDDEN` |
| POST | `/api/portfolio/run-weekly` | ADMIN | — | `200` `RunWeeklyResultDto`: ciclo cerrado (si aplica), ciclo abierto, semana, reparto y planes generados | `403 PORTFOLIO_FORBIDDEN` |

`run-weekly` es la misma operación que ejecuta el cron del lunes 06:00 (ver [despliegue.md](despliegue.md)). Es idempotente: una segunda llamada en la misma semana no cambia nada.

### 4.11 Analítica (`analytics`)

Solo lectura. Las fechas `from` y `to` son `YYYY-MM-DD` (hora de Managua), `to` inclusiva. Un `EJECUTIVO` siempre ve sus propias cifras (su `userId` se fuerza); `SUPERVISOR` y `ADMIN` ven todo y pueden filtrar por `userId` o `sectorId`.

| Método | Ruta | Roles | Entrada | Respuesta |
|---|---|---|---|---|
| GET | `/api/analytics/summary` | Autenticado | `from`, `to`, `userId`, `sectorId` | `200` `SummaryDto`: empresas totales y en pipeline, contactos de la semana, cumplimiento de cuota semanal (`compliancePct`), citas de la semana, contratos activos (con totales por moneda) y conversión `CONTACTADO` → `CONTRATO_ACTIVO` |
| GET | `/api/analytics/funnel` | Autenticado | `from`, `to`, `userId`, `sectorId` | `200` `FunnelDto`: una fila por estado con `current` (ahora), `reached` (alcanzado en el periodo) y `conversionPct` |
| GET | `/api/analytics/weekly-activity` | Autenticado | `from`, `to`, `userId`, `sectorId`, `weeks` (1–52, por defecto 12), `byExecutive` (`true`/`false`) | `200` `WeeklyActivityDto`: `weeks[]` con interacciones, empresas contactadas y desglose por resultado; con `byExecutive=true`, también por ejecutivo |
| GET | `/api/analytics/executives` | Autenticado | `from`, `to`, `userId`, `sectorId` | `200` `ExecutivesDto`: por ejecutivo, asignadas, contactadas esta semana, cuota, cobertura del ciclo, avances de estado, citas y contratos activos |
| GET | `/api/analytics/cycle-coverage` | Autenticado | `from`, `to`, `userId`, `sectorId` | `200` `CycleCoverageDto`: por ejecutivo, asignadas, contactadas, pendientes y `coveragePct`; totales del ciclo |

Errores: `400 INVALID_INPUT` si el formato de fecha o los filtros no son válidos.

### 4.12 Catálogos y otros

No hay más endpoints en la API. La lista de rutas se puede comprobar en la documentación Swagger (`/api/docs`).

## 5. Referencias

- Esquemas y tipos compartidos: `packages/contracts/src/*.ts` (`companies.ts`, `pipeline.ts`, `appointments.ts`, `sales-contracts.ts`, `portfolio.ts`, `analytics.ts`, `import.ts`, `identity.ts`, `common.ts`).
- Decisiones de arquitectura: [docs/adr/](adr/).

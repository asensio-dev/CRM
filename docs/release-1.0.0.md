# Release v1.0.0: checklist de despliegue

Guía operativa para publicar la versión 1.0.0 de AXIOM CRM. Complementa [despliegue.md](despliegue.md) (detalle de cada paso), [qa.md](qa.md) y [security-review.md](security-review.md). **No pegues valores de secretos en este documento ni en tickets**: solo nombres de variables.

La versión se lee de `package.json`: `GET /api/health` devuelve `version` (backend) y el pie de la barra lateral muestra `v1.0.0` (frontend).

## 1. Antes de desplegar

### 1.1 Código

- [ ] `main` contiene el merge de la Ola 4 y `bun run verify` pasa en limpio.
- [ ] `bun run test:integration` y `bun run test:e2e` pasan contra `AxiomCRM_Test`.
- [ ] El tag `v1.0.0` lo crea quien libera, después de verificar lo anterior.

### 1.2 Variables de entorno (solo nombres)

| Variable | Valor en producción |
|---|---|
| `NODE_ENV` | `production` (obligatoria en la práctica: cookie `Secure`, Swagger desactivado, scripts demo bloqueados) |
| `DATABASE_URL` | Login de aplicación con permisos mínimos (ver 1.3) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Distintos entre sí, ≥ 32 caracteres, generados para este entorno |
| `CORS_ORIGIN` | Origen público exacto del frontend (nunca `*`) |
| `TRUST_PROXY` | `1` (o subred del proxy) si hay proxy inverso; sin definir si la API se expone directamente. Nunca `true` |
| `SCHEDULER_ENABLED` | `true` en **exactamente una** instancia de la API; `false` en las demás |
| `PORT`, `TZ`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL` | Revisar; los valores por defecto son válidos |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Solo en la primera ejecución del seed; quitarlas después |
| `SEED_DEMO_PASSWORD`, `SHADOW_DATABASE_URL` | **No definir** en producción |

- [ ] HTTPS terminado en el proxy (la cookie de refresh es `Secure` y `SameSite=Strict`).
- [ ] El proxy envía `X-Forwarded-For` y el frontend se sirve en el mismo origen que `/api` (o `CORS_ORIGIN` coincide).
- [ ] Recomendado: límite de peticiones por IP en el proxy para los endpoints caros (S-12).

### 1.3 Base de datos y secretos

- [ ] Dos logins: uno de **migraciones** (DDL) y otro de **aplicación** con permisos mínimos (lectura/escritura de datos, sin `db_owner`). Ver [despliegue.md](despliegue.md) §2.2. El login de desarrollo (`db_owner` + `dbcreator`) no debe usarse (S-22).
- [ ] Secretos guardados en el gestor de secretos del servidor; rotación documentada ([despliegue.md](despliegue.md) §10).
- [ ] Copia de seguridad completa y probada antes de migrar ([despliegue.md](despliegue.md) §8).
- [ ] El Excel de empresas está fuera del repositorio y se borrará del servidor tras la carga.

## 2. Pasos de base de datos

```bash
# 1. Migraciones (login de migración). Nunca migrate dev / db push.
cd backend && bun run db:deploy
cd backend && bun run db:status          # debe indicar "up to date"

# 2. Datos iniciales (idempotente): parámetros, sectores y administrador
cd backend && bun run db:seed

# 3. Carga del Excel (una vez; ~127 k filas). También desde la pantalla Importación (ADMIN)
cd backend && bun run db:import "<ruta-al-xlsx>"
```

Esta versión **no añade migraciones** respecto a la última de la Ola 4 (`20261025200000_qa_performance_indexes`).

Después de la primera carga, el administrador inicia sesión, cambia su contraseña, crea los usuarios (supervisores y ejecutivos) y se ejecuta la primera rotación (lunes 06:00 automática, o `POST /api/portfolio/run-weekly` por un ADMIN).

## 3. Pruebas de humo tras el despliegue

Sustituye `$API` por la URL pública. Ninguna usa datos reales en el log.

- [ ] **Salud:** `GET $API/api/health` responde `200` con `{ "status": "ok", "database": "up", "version": "1.0.0" }`.
- [ ] **Swagger apagado:** `GET $API/api/docs` responde `404` (confirma `NODE_ENV=production`).
- [ ] **Login:** con el administrador, `POST /api/auth/login` devuelve `accessToken` y la cookie `refresh_token` con `Secure; HttpOnly; SameSite=Strict`. Una contraseña errónea devuelve `401`.
- [ ] **Frontend:** carga, inicia sesión y el pie de la barra lateral muestra `v1.0.0`.
- [ ] **Mi semana:** `GET /api/portfolio/my-week` (o la pantalla) responde con el plan o con `planId: null` si aún no hay rotación.
- [ ] **Tablero:** `GET /api/pipeline/board` devuelve las 8 columnas con sus conteos; la pantalla Tablero carga en menos de 1 s.
- [ ] **Empresas:** una búsqueda por razón social devuelve resultados.
- [ ] **Planificador:** en los logs de la instancia con `SCHEDULER_ENABLED=true` no hay errores al arrancar; en las demás no se registra actividad de jobs.

## 4. Rollback

- **Aplicación:** redespliega la versión anterior del backend y del frontend (artefactos conservados). `/api/health` mostrará la versión previa.
- **Esta versión no cambia el esquema**, así que volver atrás no exige revertir la base. Una migración aplicada en `main` nunca se edita; si una migración futura falla, se corrige con una migración nueva y, si hace falta, se restaura la copia tomada en 1.3.
- **Sesiones:** los tokens son compatibles entre versiones. Para forzar el cierre de todas las sesiones, rota `JWT_REFRESH_SECRET`.
- **Planificador:** para detener los jobs sin redesplegar código, pon `SCHEDULER_ENABLED=false` y reinicia. La rotación puede lanzarse a mano (`POST /api/portfolio/run-weekly`, ADMIN) y es idempotente.
- Si el despliegue ya cargó el Excel y debe repetirse, la importación es idempotente por RUC (no duplica empresas).

## 5. Limitaciones conocidas

De [rendimiento-qa.md](rendimiento-qa.md) §6:

- **Búsqueda `LIKE '%…%'`**: coste lineal con el número de empresas (~50 ms de CPU por búsqueda). Si la base supera ~300 k empresas o se nota lentitud, instalar Full-Text Search o un índice de n-gramas.
- **Un solo proceso de API** ≈ 150–180 req/s, suficiente para 10–20 personas. Escalar a varias instancias exige `SCHEDULER_ENABLED=false` en todas menos una y asumir lo indicado abajo sobre límites y sesiones por proceso.
- **Tablero sin filtro** cuenta todas las empresas por estado en cada carga (~30 ms de CPU); con mucho más volumen, valorar una vista indexada de conteos.
- **Páginas muy profundas** (`OFFSET`) cuestan 20–60 ms en las páginas 2 000–4 100; la interfaz no invita a llegar ahí.
- **Parámetros (`settings`)** se leen en cada petición (sin caché) para que un cambio surta efecto al instante.

De [security-review.md](security-review.md), aceptados o pendientes de despliegue:

- **S-06** `@azure/msal-node` (llega por `tedious`, flujo no usado) y `uuid` 8 (`exceljs`, solo `v4()`): avisos de `bun audit` aceptados; revisar en cada versión.
- **S-10** `NODE_ENV=production` y HTTPS son responsabilidad del despliegue (esta checklist).
- **S-11** La invalidación inmediata de sesiones y el límite de logins son **por proceso**: con varias instancias el corte de rol/estado tarda ≤ 30 s y un reset de contraseña deja vivo el access token (≤ 15 min) en las demás.
- **S-12** Sin límite global de peticiones para endpoints caros: ponerlo en el proxy.
- **S-13** Contraseñas: mínimo 8 caracteres, sin comprobación contra listas de filtraciones.
- **S-16** Todos los roles pueden leer cualquier empresa (decisión de producto); la cédula del representante se oculta al EJECUTIVO.
- **S-22** El usuario de la aplicación debe tener permisos mínimos en producción.
- **S-23** El candado de importación es por proceso; dos importaciones simultáneas en instancias distintas son idempotentes (solo coste).

Corregidas en esta versión: S-14 (mensaje de error de importación seguro) y S-15 (limpieza diaria de `refresh_tokens`).

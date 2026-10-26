# Guía de despliegue

Cómo poner AXIOM CRM en un servidor (QA o producción). Para desarrollo local, ver el [README](../README.md).

Piezas:

| Pieza | Qué es | Dónde corre |
|---|---|---|
| API | NestJS sobre Bun (`backend/src/main.ts`), puerto `PORT` (3000) | Un proceso Bun |
| Base de datos | SQL Server 2022, base `AxiomCRM` con collation `Modern_Spanish_CI_AS` | Servidor SQL |
| Frontend | SPA React compilada (`frontend/dist`) con archivos estáticos | Cualquier servidor web |
| Proxy inverso | Sirve el frontend y reenvía `/api` a la API en el mismo origen | Nginx, IIS, Caddy… |

El frontend llama a `/api` con rutas relativas, así que en producción **el frontend y la API deben compartir origen** detrás del proxy. Así la cookie `refresh_token` (httpOnly, `Path=/api/auth`) funciona sin CORS.

## 1. Variables de entorno

Se leen del entorno del proceso o de `backend/.env` (ignorado por git). **Solo se documentan los nombres**; los valores nunca van en el repositorio, en tickets ni en capturas.

Validadas al arrancar con Zod (`backend/src/shared/infrastructure/config/env.ts`). Si falta una obligatoria o un secreto es demasiado corto, la API no arranca y el mensaje indica solo el nombre de la variable.

| Variable | Obligatoria | Propósito |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión `sqlserver://…` del usuario de la aplicación (ver §2.2). Lo usan la API, los scripts y Prisma |
| `JWT_ACCESS_SECRET` | Sí (≥ 32 caracteres) | Clave de firma de los access tokens |
| `JWT_REFRESH_SECRET` | Sí (≥ 32 caracteres) | Clave de firma de los refresh tokens. Debe ser distinta de la anterior |
| `JWT_ACCESS_TTL` | No (`15m`) | Duración del access token (formato `30s`, `15m`, `12h`, `7d`) |
| `JWT_REFRESH_TTL` | No (`7d`) | Duración del refresh token (cookie) |
| `PORT` | No (`3000`) | Puerto HTTP de la API |
| `CORS_ORIGIN` | No (`http://localhost:5173`) | Origen permitido para CORS. En producción, el origen público del frontend |
| `TZ` | No (`America/Managua`) | Validada al arrancar. La zona de negocio real es el parámetro `TIMEZONE` de la tabla `settings` |
| `SCHEDULER_ENABLED` | No (`true`) | `true`/`false`. Activa los trabajos programados de la API (rotación semanal y limpieza diaria de refresh tokens). Con varias instancias, `true` en **exactamente una** y `false` en el resto (ver §7) |
| `TRUST_PROXY` | No (sin definir) | Detrás de un proxy inverso: saltos (`1`) o IPs/subredes de confianza (ver §5.1) |
| `NODE_ENV` | Recomendada: `production` | Con `production`: cookies `Secure`, Swagger desactivado y los scripts de datos demo se niegan a correr |
| `SHADOW_DATABASE_URL` | No | Base sombra de `prisma migrate dev`. Solo desarrollo; en producción no se usa |
| `SEED_ADMIN_EMAIL` | No | Email del administrador inicial que crea `db:seed`. Solo hace falta la primera vez |
| `SEED_ADMIN_PASSWORD` | No | Contraseña inicial de ese administrador (argon2id). Solo la primera vez |
| `SEED_DEMO_PASSWORD` | No | Contraseña de los usuarios demo de `db:seed:demo`. **Nunca en producción** |

Fuera de la API, `docker-compose.yml` lee `MSSQL_SA_PASSWORD` del entorno para el contenedor local de SQL Server. No forma parte del despliegue de la aplicación.

## 2. Base de datos (SQL Server 2022)

### 2.1 Creación de la base

La base debe crearse con la collation de la aplicación (los índices de búsqueda y los `CHECK` dependen de ella):

```sql
CREATE DATABASE [AxiomCRM] COLLATE Modern_Spanish_CI_AS;
```

`bun run db:bootstrap` hace lo mismo en local (ver README). En un servidor, lo ejecuta el DBA.

### 2.2 Dos logins: migraciones y aplicación

Usa dos cuentas distintas (mínimo privilegio):

| Login | Uso | Permisos sobre `AxiomCRM` |
|---|---|---|
| Login de **migración** | `prisma migrate deploy` (en el pipeline de despliegue o a mano) | `db_ddladmin`, `db_datareader`, `db_datawriter` |
| Login de **aplicación** | `DATABASE_URL` de la API | `db_datareader`, `db_datawriter` |

El login de la aplicación **no** debe ser `sa` ni tener `db_owner`. Ejemplo de creación (sustituye los nombres y pon una contraseña generada por tu gestor de secretos; no la guardes en el repositorio):

```sql
CREATE LOGIN [axiom_app] WITH PASSWORD = N'<generada-por-el-gestor-de-secretos>', CHECK_POLICY = ON;
USE [AxiomCRM];
CREATE USER [axiom_app] FOR LOGIN [axiom_app];
ALTER ROLE [db_datareader] ADD MEMBER [axiom_app];
ALTER ROLE [db_datawriter] ADD MEMBER [axiom_app];
```

Hace falta el mismo patrón para el login de migración, añadiendo `db_ddladmin`.

### 2.3 Cadena de conexión

Formato que usa Prisma con el adaptador de SQL Server:

```
sqlserver://<HOST>:<PUERTO>;database=AxiomCRM;user=<USUARIO>;password=<CONTRASEÑA>;encrypt=true;trustServerCertificate=false
```

- En producción usa `trustServerCertificate=false` con un certificado válido en el servidor. La opción `true` solo es aceptable en desarrollo local.
- Pool: el adaptador abre hasta 10 conexiones por proceso. Para dejarlo explícito añade `;connectionLimit=10;poolTimeout=15`. Con una instancia es suficiente (la API se satura por CPU antes; ver [rendimiento-qa.md](rendimiento-qa.md) §8).
- Entorno de QA tipo producción con los datos reales y prueba de carga: [qa.md](qa.md).
- La contraseña va en `DATABASE_URL` del entorno o de un gestor de secretos, nunca en un archivo versionado.

### 2.4 `QUOTED_IDENTIFIER` (ADR 0004)

La columna calculada `companies.searchText` es `PERSISTED` e indexada. SQL Server exige `QUOTED_IDENTIFIER ON` para escribir en `companies`. Prisma y tedious lo activan por defecto. Si escribes a mano con `sqlcmd`, usa **siempre `-I`**; sin él, los `INSERT`/`UPDATE` sobre `companies` fallan. No escribas en `searchText` (es de solo lectura).

## 3. Migraciones

Las migraciones están versionadas en `backend/prisma/migrations`. A fecha de este documento son:

- `20261025035605_init`
- `20261025045006_search_and_board_indexes`
- `20261025145733_analytics_and_contract_indexes`
- `20261025154934_refresh_token_replaced_at`
- `20261025200000_qa_performance_indexes` (índices de la prueba de carga, ver [rendimiento-qa.md](rendimiento-qa.md))

En QA y producción se aplican con `migrate deploy`, **nunca** con `migrate dev` ni `db push`:

```bash
cd backend && bun run db:deploy
```

`db:deploy` ejecuta `prisma migrate deploy` con `DATABASE_URL` del entorno (el login de migración). Después, comprueba el estado:

```bash
cd backend && bun run db:status
```

En CI/CD, el paso va **antes** de arrancar la nueva versión de la API. Una migración aplicada en `main` nunca se edita: un cambio = una migración nueva.

Datos iniciales: `cd backend && bun run db:seed` es idempotente (parámetros, sectores y, si están `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`, el administrador). Si el administrador ya existe, no cambia su contraseña. Después de la primera ejecución puedes quitar `SEED_ADMIN_PASSWORD` del entorno.

Importación del Excel: el archivo contiene datos personales. Se carga desde el CLI (`cd backend && bun run db:import "<ruta-al-xlsx>"`) o desde la pantalla de importación (solo ADMIN). Guárdalo fuera del repositorio y bórralo del servidor cuando termine la carga, según la política de datos de la organización.

## 4. Frontend

```bash
bun install
bun run --filter @axiom/frontend build
```

El build comprueba tipos (`tsc --noEmit`) y genera `frontend/dist/` con `vite build`. Sirve ese directorio como estáticos. Las rutas de la SPA deben caer en `index.html` (fallback), para que recargar `/pipeline` no devuelva 404.

## 5. Proxy inverso

El proxy:

1. Sirve `frontend/dist` en `/`, con fallback a `index.html`.
2. Reenvía `/api/` a la API (`http://127.0.0.1:3000`) **sin** cambiar la ruta.
3. Termina TLS (HTTPS) y pasa la IP del cliente y el protocolo.

Ejemplo de Nginx (adapta rutas y dominio):

```nginx
server {
    listen 443 ssl;
    server_name crm.ejemplo.org;

    root /srv/axiom/frontend/dist;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 55m;   # importación: límite de 50 MB + margen
    }

    location / {
        try_files $uri /index.html;
    }
}
```

### 5.1 Requisitos del proxy que la API necesita

- **HTTPS:** la cookie `refresh_token` se marca `Secure` cuando `NODE_ENV=production`. Sin HTTPS el navegador no la guardará.
- **`TRUST_PROXY`:** la limitación de intentos de login (`@nestjs/throttler`, 5 por minuto por IP y 10 cada 15 min por cuenta) usa la IP del cliente. Detrás de un proxy define `TRUST_PROXY=1` (o la subred del proxy) para que `main.ts` configure `trust proxy` en Express; si no, los 5 intentos por IP se comparten entre todos los usuarios.
- **Tamaño de subida:** `client_max_body_size` (o el equivalente de tu proxy) debe permitir al menos 50 MB para la importación.
- **Swagger:** no se sirve en producción. Comprueba que `/api/docs` devuelve `404` tras el despliegue.

## 6. Ejecutar la API con Bun

Con las variables definidas (`NODE_ENV=production`), desde `backend/`:

```bash
bun install --frozen-lockfile
bun run db:deploy
bun src/main.ts
```

`bun install` ejecuta `prisma generate` (postinstall), que genera el cliente en `backend/src/generated`. Ese directorio no está en git, así que el paso de instalación es obligatorio en cada servidor.

Opciones para dejarla como servicio:

- **Windows:** un servicio con NSSM apuntando a `bun.exe` con argumentos `src/main.ts` y directorio de trabajo `backend`. Configura las variables en el servicio, no en un archivo accesible a otros usuarios.
- **Linux o Windows con gestor de procesos:** PM2 admite Bun con `--interpreter bun`, por ejemplo `pm2 start src/main.ts --interpreter bun --name axiom-api` desde `backend/`.
- **Docker (esquema):** imagen basada en `oven/bun:1.4`, copia del monorepo, `bun install --frozen-lockfile`, `WORKDIR /app/backend`, `CMD ["bun", "src/main.ts"]`. Las variables se pasan al contenedor con `--env-file` o un gestor de secretos, nunca dentro de la imagen.

Comprobación tras arrancar: `GET /api/health` debe responder `200` con `{ "status": "ok", "database": "up", "version": "1.0.0" }`.

## 7. Job semanal de rotación: una sola instancia

La rotación de carteras (`POST` manual o cron) corre **dentro del proceso de la API**: `@nestjs/schedule` ejecuta el cron `0 6 * * 1` (lunes 06:00, zona `America/Managua`) en cada instancia que arranca.

> **Ejecuta exactamente una instancia de la API con `SCHEDULER_ENABLED=true`** (valor por defecto). En las demás réplicas define `SCHEDULER_ENABLED=false`: sus crons (rotación semanal y limpieza diaria de `refresh_tokens`, 03:30) no hacen nada. El código además tiene protección (índices únicos e idempotencia del caso de uso) por si coincidieran, pero el objetivo es que solo corra una vez. El endpoint manual `POST /api/portfolio/run-weekly` sigue disponible en todas las instancias.

Notas operativas:

- Si el proceso estaba apagado el lunes a las 06:00, el job no se recupera solo a esa hora. Al volver a arrancar, la siguiente ejecución (o `POST /api/portfolio/run-weekly` por un ADMIN) abre el ciclo y reparte las carteras de la semana actual.
- La ejecución semanal deja en el log un resumen con cifras (ciclo, semana, liberadas, asignadas, planes). No registra datos de empresas.
- Límite de intentos y estado de sesión: el limitador de peticiones guarda los contadores **en memoria** del proceso.

## 8. Copias de seguridad

- **Base de datos:** copia completa diaria y copias de registro (log) frecuentes si la base usa el modelo de recuperación `FULL`. Ejemplo de copia completa:

  ```sql
  BACKUP DATABASE [AxiomCRM] TO DISK = N'D:\backups\AxiomCRM_full.bak' WITH CHECKSUM, COMPRESSION, INIT;
  ```

- **Restauraciones de prueba:** restaura una copia en otro servidor al menos una vez al mes y ejecuta `db:status` para verificar las migraciones.
- **Las copias contienen datos personales** (cédulas y nombres de representantes legales). Trátalas con el mismo cuidado que la base: cifrado en reposo, acceso restringido y retención definida.
- **Secretos:** guarda las claves JWT y las cadenas de conexión en el gestor de secretos del servidor. Si se pierden, las sesiones se pueden regenerar, pero no la conexión a la base.

## 9. Logs y datos personales

- El backend no registra cuerpos de petición. Los errores de validación (`INVALID_INPUT` y similares) se devuelven al cliente y no se escriben en el log.
- Los errores inesperados se registran con su traza (`DomainExceptionFilter`). Revisa los logs de un error nuevo antes de compartirlos.
- La importación registra el identificador del job y el mensaje de error; las filas rechazadas se guardan en la base junto con la fila original, y la API solo expone número de fila y motivo.
- No añadas registros de cuerpos de petición ni de respuestas sin revisar qué datos contienen. Las cédulas, teléfonos y nombres de representantes son datos personales.
- Centraliza los logs en el servidor con rotación y retención acordadas; no los copies a canales de chat.

## 10. Rotación de secretos

| Secreto | Cómo rotarlo | Efecto |
|---|---|---|
| `JWT_ACCESS_SECRET` | Cambia el valor y reinicia la API | Todos los access tokens dejan de ser válidos; los usuarios vuelven a iniciar sesión |
| `JWT_REFRESH_SECRET` | Cambia el valor y reinicia la API | Todas las sesiones caducan; los usuarios vuelven a iniciar sesión |
| Contraseña del login de aplicación | Cambia la contraseña en SQL Server, actualiza `DATABASE_URL`, reinicia la API | Ninguno si el orden es ese |
| Contraseña de migración | Igual, con el login de migración | Ninguno en la API en marcha |
| Contraseña de un usuario | Desde Usuarios → restablecer contraseña (ADMIN) | Ese usuario debe volver a iniciar sesión |

- Genera los secretos con un generador criptográfico (por ejemplo, `crypto.randomUUID()` concatenado dos veces, como indica `.env.example`, o un gestor de secretos).
- Si un secreto se filtra (aparece en un commit, un ticket o un log), **rótalo de inmediato**. Reescribir el historial de git no basta: el valor puede estar en clones o en el CI.
- `secretlint` (hook de git) y `gitleaks` (CI) bloquean commits con secretos. Un bloqueo es una señal para revisar, no para saltarlo.
- Las variables de `SEED_*` solo hacen falta en la primera ejecución: quítalas del entorno después.

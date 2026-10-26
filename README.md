# AXIOM CRM

CRM de seguimiento comercial sobre unas 127 000 empresas de Nicaragua. Organiza el trabajo de los ejecutivos en **carteras rotativas**: cada ejecutivo gestiona unas 60 empresas en ciclos de 3 semanas, con un mínimo de 20 contactos por semana, y las empresas sin avance vuelven al pool.

## Qué incluye

- **Empresas:** listado con búsqueda (RUC, razón social, nombre comercial, ignora tildes), filtros, ficha con sucursales, alta y edición.
- **Importación del Excel** en segundo plano, con reporte de filas rechazadas.
- **Pipeline comercial** de 8 estados con reglas automáticas según el resultado de cada contacto, historial de cambios y tablero kanban.
- **Cartera rotativa:** ciclos de 3 semanas, plan semanal de contactos, liberación de empresas sin avance y reasignación manual.
- **Citas** y **contratos de venta**, que mueven la empresa por el tramo final del pipeline.
- **Tablero** de indicadores: embudo, cumplimiento de cuota, cobertura del ciclo y conversión.
- **Roles:** Administrador, Supervisor y Ejecutivo, con permisos por rol y acceso a cada cartera.
- **API documentada** con Swagger UI en desarrollo.

Estado del proyecto y olas de trabajo: [PLAN_IMPLEMENTACION.md](PLAN_IMPLEMENTACION.md).

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Bun 1.4 |
| Backend | NestJS 12 (ESM), arquitectura hexagonal por módulo |
| Datos | Prisma 7 con `@prisma/adapter-mssql`, SQL Server 2022 |
| Frontend | React 19, Vite 7, Tailwind CSS 4 |
| Calidad | Biome, TypeScript 6, dependency-cruiser, Bun test, secretlint, lefthook |

## Estructura

| Carpeta | Contenido |
|---|---|
| `backend/` | API NestJS, Prisma (`prisma/`), scripts de datos (`scripts/`) |
| `frontend/` | Aplicación React |
| `packages/contracts/` | Esquemas Zod y tipos compartidos entre backend y frontend |
| `data/` | Excel fuente. **Ignorada por git:** contiene datos personales |
| `docs/` | Guía de agentes, ADRs, API, despliegue y manual de usuario |

## Requisitos

- [Bun](https://bun.sh) 1.4 o superior.
- SQL Server 2022, instalado en local, **o** Docker para levantar el contenedor de `docker-compose.yml`.
- `sqlcmd` en el PATH (lo usa el script de creación de la base local).

## Puesta en marcha (primera vez)

Estos pasos crean la base local, cargan los datos iniciales y arrancan la aplicación.

**1. Instalar dependencias** desde la raíz del repositorio:

```bash
bun install
```

**2. Crear la base de datos local.** Crea la base `AxiomCRM`, un login de desarrollo y el archivo `backend/.env`:

```bash
cd backend && bun run db:bootstrap
```

El script usa autenticación de Windows y genera las credenciales al azar. Ninguna credencial aparece en consola ni en el repositorio: quedan en `backend/.env`, que está ignorado por git. Si ya existe, no lo modifica (usa `--force` solo si quieres regenerarlo).

**3. Aplicar las migraciones:**

```bash
cd backend && bun run db:migrate
```

**4. Cargar los datos iniciales** (parámetros, sectores y el usuario administrador definido en `backend/.env`):

```bash
cd backend && bun run db:seed
```

**5. Importar las empresas** (opcional, requiere el Excel en `data/`):

```bash
cd backend && bun run db:import "../data/Empresas Nicaragua.xlsx"
```

**6. Datos de demostración** (opcional, solo desarrollo). Antes, añade a `backend/.env` la variable `SEED_DEMO_PASSWORD` con la contraseña que quieras para los usuarios de demo. El script se niega a correr con `NODE_ENV=production`.

```bash
cd backend && bun run db:seed:demo
```

**7. Actividad simulada** (opcional, solo desarrollo). Genera semanas de interacciones para que el tablero tenga datos:

```bash
cd backend && bun run db:seed:activity
```

Puedes ver las opciones con `--weeks`, `--companies` y `--force` en el encabezado de `backend/scripts/seed-activity.ts`.

## Ejecutar en desarrollo

Desde la raíz, un solo comando levanta la API y el frontend a la vez:

```bash
bun run dev
```

- API en modo *watch*: `http://localhost:3000/api`
- Frontend: `http://localhost:5173`, con proxy de `/api` hacia la API

Para detener ambos, `Ctrl+C`. Si prefieres cada servicio en su propia terminal:

API en modo *watch* (`http://localhost:3000/api`):

```bash
bun run --filter @axiom/backend dev
```

Comprueba que responde en `http://localhost:3000/api/health`. La documentación interactiva está en `http://localhost:3000/api/docs`.

Frontend (`http://localhost:5173`, con proxy de `/api` hacia la API):

```bash
bun run --filter @axiom/frontend dev
```

## Calidad

Antes de integrar cualquier cambio, ejecuta la verificación completa desde la raíz:

```bash
bun run verify
```

Ejecuta Biome (lint y formato), typecheck de todos los paquetes, reglas de arquitectura con dependency-cruiser, tests y secretlint. Los hooks de git (lefthook) bloquean secretos, archivos `.env`, el Excel y mensajes de commit fuera de Conventional Commits.

Otros comandos útiles:

```bash
cd backend && bun run db:status
```

Muestra el estado de las migraciones.

## Configuración y secretos

- Las variables de entorno de la API están en `backend/.env` (ignorado por git). La plantilla con los **nombres** de las variables es [`.env.example`](.env.example).
- Nunca escribas ni muestres valores de secretos en el código, en los commits ni en la documentación.
- La API no arranca si falta una variable obligatoria o un secreto es demasiado corto.

## Documentación

- [API REST](docs/api.md): endpoints por módulo, roles, parámetros, respuestas y códigos de error.
- [Despliegue](docs/despliegue.md): variables de entorno, SQL Server en producción, migraciones, frontend, proxy inverso, servicio y copias de seguridad.
- [Manual de usuario](docs/manual-usuario.md): guía por rol y reglas del negocio.
- [Reglas para agentes](docs/AGENTS.md) y [decisiones de arquitectura (ADR)](docs/adr/).
- [Plan de implementación](PLAN_IMPLEMENTACION.md).

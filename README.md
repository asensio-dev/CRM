# AXIOM CRM

Seguimiento comercial de empresas con cartera rotativa, pipeline de estados y tablero visual.

## Requisitos

- [Bun](https://bun.sh) 1.4+ (`npm i -g bun` o el instalador oficial)
- SQL Server 2022 (local) **o** Docker (`docker compose up -d`, ver `docker-compose.yml`)
- `sqlcmd` (para el script de arranque de la base local)

## Puesta en marcha

```bash
bun install
```

```bash
cd backend && bun run db:bootstrap
```

Crea la base `AxiomCRM`, un login `axiom_dev` con contraseña aleatoria y `backend/.env` (ignorado por git) usando autenticación de Windows. Ninguna credencial aparece en consola ni en el repositorio.

```bash
cd backend && bun run db:migrate && bun run db:seed
```

```bash
bun run --filter @axiom/backend dev
```

Comprueba `http://localhost:3000/api/health`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `backend/` | API NestJS hexagonal + Prisma (migraciones en `backend/prisma/migrations`) |
| `frontend/` | React + Tailwind (Ola 1) |
| `packages/contracts/` | Esquemas Zod y tipos compartidos entre backend y frontend |
| `data/` | Excel fuente — **ignorado por git** (contiene datos personales) |
| `docs/` | Guía de agentes y ADRs |

## Calidad

```bash
bun run verify
```

Ejecuta Biome, typecheck, reglas de arquitectura (dependency-cruiser), tests y secretlint. Los hooks de git (lefthook) bloquean secretos, archivos `.env`/Excel y mensajes de commit fuera de Conventional Commits.

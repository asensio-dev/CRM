# Guía para sub-agentes

Lee esto completo antes de tocar código. El plan general está en [PLAN_IMPLEMENTACION.md](../PLAN_IMPLEMENTACION.md).

## 1. Reglas que no se negocian

1. **Nunca escribas secretos** (contraseñas, URLs con contraseña, tokens, claves JWT) en código, tests, commits, PRs ni documentación. En tests genera valores al vuelo. El hook `secretlint` y gitleaks en CI bloquean el commit.
2. **Nunca versiones** `.env`, el Excel ni ningún archivo de `data/`. Usa `.env.example` solo con nombres de variables.
3. **Arquitectura hexagonal** (la verifica `bun run arch`):
   - `domain/` no importa `@nestjs/*`, `@prisma/*`, `src/generated` ni `application/`/`infrastructure/`.
   - `application/` depende de puertos (interfaces + `Symbol` tokens), nunca de adaptadores ni de Prisma.
   - Un módulo solo usa de otro lo que exporta su `index.ts`.
4. **Esquema y migraciones**: solo el agente designado de la ola puede modificar `backend/prisma/schema.prisma` o crear migraciones. Si necesitas un cambio, descríbelo en tu PR / mensaje final; no lo hagas tú.
5. **Una migración fusionada a `main` nunca se edita**. Cambio = migración nueva.
6. Si cambias valores permitidos (estados, roles, canales…) actualiza **a la vez** `packages/contracts` y el `CHECK` en una migración nueva. `schema-consistency.test.ts` lo verifica.

## 2. Estructura de un módulo

```
backend/src/modules/<modulo>/
├── domain/            entidades, value objects, eventos, servicios de dominio, puertos (interfaces)
├── application/       use-cases/ (una clase por caso de uso, método execute), dtos/, queries/
├── infrastructure/    persistence/ (Prisma*Repository + mappers), http/ (controllers)
├── <modulo>.module.ts cablea puertos ⇄ adaptadores: { provide: COMPANY_REPOSITORY, useClass: PrismaCompanyRepository }
└── index.ts           API pública del módulo (lo que otros módulos pueden importar)
```

Piezas compartidas ya disponibles (`backend/src/shared`):

| Pieza | Uso |
|---|---|
| `AggregateRoot`, `Entity`, `ValueObject`, `DomainError`, `Result` | Base del dominio |
| `UseCase`, `UNIT_OF_WORK`, `EVENT_BUS`, `CLOCK` | Puertos de aplicación |
| `PrismaService.db` | Cliente a usar en repositorios (participa automáticamente en la transacción de `UnitOfWork.run`) |
| `ZodValidationPipe` | Valida entrada con esquemas de `@axiom/contracts` |
| `DomainExceptionFilter` | Mapea `DomainError.kind` → HTTP (VALIDATION 400, NOT_FOUND 404, CONFLICT 409, FORBIDDEN 403, RULE 422) |

Patrón de un caso de uso que escribe:

```ts
await this.uow.run(async () => {
  const company = await this.companies.findById(id);   // repositorio vía puerto
  company.changeStatus(next, userId);                  // regla en el dominio
  await this.companies.save(company);
});
await this.events.publishAll(company.pullEvents());    // tras confirmar la transacción
```

## 3. Flujo de Git

```bash
# 1. Rama + worktree propios (desde la raíz del repo)
git worktree add ../axiom-wt/<slug> -b feat/<ola>-<slug> main
cd ../axiom-wt/<slug> && bun install

# 2. Commits pequeños, Conventional Commits (lo valida el hook commit-msg)
git commit -m "feat(companies): add paginated search use case"

# 3. Antes de integrar
git fetch origin 2>/dev/null; git rebase main
bun install && bun run verify

# 4. Integrar (una rama a la vez; si main avanzó mientras tanto, vuelve al paso 3)
git switch main && git merge --no-ff feat/<ola>-<slug>

# 5. Limpiar
git worktree remove ../axiom-wt/<slug> && git branch -d feat/<ola>-<slug>
```

Archivos compartidos: en `backend/src/app.module.ts` y en el router/menú del frontend cada agente añade **solo sus líneas**. `bun.lock` nunca se resuelve a mano: tras el rebase, `bun install`.

## 4. Comandos

| Comando | Qué hace |
|---|---|
| `bun run verify` | lint + typecheck + arquitectura + tests + secretos (obligatorio antes de integrar) |
| `bun run --filter @axiom/backend dev` | API en modo watch (http://localhost:3000/api) |
| `cd backend && bun run db:migrate` | Aplica migraciones pendientes en local |
| `cd backend && bun run db:seed` | Datos iniciales idempotentes |
| `cd backend && bun run db:status` | Estado de migraciones |

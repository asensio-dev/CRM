/**
 * SOLO DESARROLLO. Simula actividad comercial realista de las últimas N semanas para que el
 * tablero (módulo analytics) tenga datos. Todo pasa por los casos de uso PÚBLICOS del módulo
 * pipeline (RegisterInteractionUseCase / ChangeCompanyStatusUseCase); nunca se escribe
 * companies.status directamente. Para fechar el historial en el pasado se sustituye el reloj
 * del proceso (CLOCK) por uno simulado mientras dura el script.
 *
 * Uso: bun run db:seed:activity [--weeks 8] [--seed 1] [--companies 1500]
 *                               [--demo-executives 0] [--force]
 *  - Con carteras activas (portfolio_assignments) de ejecutivos activos usa esas parejas
 *    (empresa, ejecutivo); si no, toma una muestra determinista de empresas POR_CONTACTAR
 *    y las reparte entre los ejecutivos activos (o, si no hay, entre usuarios activos de cualquier rol).
 *  - --demo-executives N crea hasta N ejecutivos de demostración (contraseña aleatoria, no se muestra).
 *  - Idempotencia: se niega a correr si ya existen interacciones, salvo --force.
 * Imprime solo cifras agregadas.
 */
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import {
  type InteractionChannel,
  type InteractionOutcome,
  type PipelineStatus,
  type UserRole,
} from '@axiom/contracts';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Prisma } from '../src/generated/prisma/client';
import {
  ChangeCompanyStatusUseCase,
  PipelineModule,
  RegisterInteractionUseCase,
} from '../src/modules/pipeline';
import { CLOCK } from '../src/shared/application';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { SharedModule } from '../src/shared/infrastructure/shared.module';

const { values: args } = parseArgs({
  options: {
    weeks: { type: 'string', default: '8' },
    seed: { type: 'string', default: '1' },
    companies: { type: 'string', default: '1500' },
    'demo-executives': { type: 'string', default: '0' },
    force: { type: 'boolean', default: false },
  },
});
const WEEKS = Math.max(1, Number.parseInt(args.weeks as string, 10) || 8);
const SEED = Number.parseInt(args.seed as string, 10) || 1;
const MAX_COMPANIES = Math.max(1, Number.parseInt(args.companies as string, 10) || 1500);
const DEMO_EXECUTIVES = Math.max(0, Number.parseInt(args['demo-executives'] as string, 10) || 0);

/** PRNG determinista (mulberry32). */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(SEED);
const pick = <T>(weighted: readonly (readonly [T, number])[]): T => {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of weighted) {
    r -= w;
    if (r < 0) return v;
  }
  return (weighted.at(-1) as readonly [T, number])[0];
};

const FIRST_OUTCOMES: readonly (readonly [InteractionOutcome, number])[] = [
  ['NO_CONTESTO', 38],
  ['CONTESTO', 22],
  ['NUMERO_EQUIVOCADO', 6],
  ['INTERESADO', 10],
  ['NO_INTERESADO', 12],
  ['VOLVER_A_LLAMAR', 12],
];
const RETRY_OUTCOMES: readonly (readonly [InteractionOutcome, number])[] = [
  ['NO_CONTESTO', 30],
  ['CONTESTO', 35],
  ['NUMERO_EQUIVOCADO', 5],
  ['INTERESADO', 15],
  ['NO_INTERESADO', 8],
  ['VOLVER_A_LLAMAR', 7],
];
const ANSWERED_OUTCOMES: readonly (readonly [InteractionOutcome, number])[] = [
  ['INTERESADO', 60],
  ['CONTESTO', 25],
  ['VOLVER_A_LLAMAR', 15],
];
const CHANNELS: readonly (readonly [InteractionChannel, number])[] = [
  ['LLAMADA', 55],
  ['WHATSAPP', 25],
  ['CORREO', 10],
  ['VISITA', 5],
  ['OTRO', 5],
];

const MANAGUA_OFFSET_MS = -6 * 3_600_000;
const DAY_MS = 86_400_000;

/** Hora laboral (8:00–16:59 Managua) de un día lunes–viernes; fines de semana pasan al lunes. */
function businessInstant(dayStartUtcMs: number): number {
  let day = dayStartUtcMs;
  const dow = (d: number) => new Date(d + MANAGUA_OFFSET_MS).getUTCDay();
  while (dow(day) === 0 || dow(day) === 6) day += DAY_MS;
  const minutes = 8 * 60 + Math.floor(rng() * 9 * 60);
  return day + minutes * 60_000;
}
/** Medianoche de Managua (en UTC ms) del día que contiene `ms`. */
const managuaMidnight = (ms: number) =>
  Math.floor((ms + MANAGUA_OFFSET_MS) / DAY_MS) * DAY_MS - MANAGUA_OFFSET_MS;

@Module({ imports: [EventEmitterModule.forRoot(), SharedModule, PipelineModule] })
class SeedActivityModule {}

interface Assignee {
  companyId: number;
  userId: number;
  role: UserRole;
}

const app = await NestFactory.createApplicationContext(SeedActivityModule, { logger: ['error'] });
let exitCode = 0;
try {
  const prisma = app.get(PrismaService);
  const db = prisma.client;
  const register = app.get(RegisterInteractionUseCase);
  const change = app.get(ChangeCompanyStatusUseCase);
  const clock = app.get(CLOCK) as { now(): Date };

  const count = async (query: Prisma.Sql): Promise<number> => {
    const rows = await db.$queryRaw<{ n: number }[]>(query);
    return Number(rows[0]?.n ?? 0);
  };
  const existing = await count(Prisma.sql`SELECT COUNT(*) AS n FROM [dbo].[interactions]`);
  if (existing > 0 && !args.force) {
    console.error('Ya existen interacciones; no se simula de nuevo. Usa --force para añadir más.');
    exitCode = 1;
  } else {
    // 1) Ejecutivos de demostración opcionales (hash aleatorio; la contraseña nunca se muestra).
    if (DEMO_EXECUTIVES > 0) {
      for (let i = 1; i <= DEMO_EXECUTIVES; i++) {
        const email = `demo.ejecutivo${i}@axiom.test`;
        const passwordHash = await Bun.password.hash(crypto.randomUUID(), {
          algorithm: 'argon2id',
        });
        await db.user.upsert({
          where: { email },
          create: { email, fullName: `Ejecutivo Demo ${i}`, role: 'EJECUTIVO', passwordHash },
          update: { isActive: true },
        });
      }
    }

    // 2) Actores: ejecutivos activos; si no hay, usuarios activos de cualquier rol.
    let actors = await db.user.findMany({
      where: { isActive: true, role: 'EJECUTIVO' },
      select: { id: true, role: true },
      orderBy: { id: 'asc' },
    });
    if (actors.length === 0) {
      actors = await db.user.findMany({
        where: { isActive: true },
        select: { id: true, role: true },
        orderBy: { id: 'asc' },
      });
    }
    if (actors.length === 0) throw new Error('No hay usuarios activos para atribuir la actividad.');
    const roleOf = new Map(actors.map((a) => [a.id, a.role as UserRole]));

    // 3) Pares (empresa, ejecutivo): carteras activas si existen; si no, muestra determinista.
    const actorIds = actors.map((a) => a.id);
    let assignees: Assignee[] = [];
    const portfolio = await db.$queryRaw<{ companyId: number; userId: number }[]>(Prisma.sql`
      SELECT pa.[companyId], pa.[userId]
      FROM [dbo].[portfolio_assignments] pa
      INNER JOIN [dbo].[companies] c ON c.[id] = pa.[companyId]
      WHERE pa.[releasedAt] IS NULL AND c.[status] = ${'POR_CONTACTAR'}
        AND pa.[userId] IN (${Prisma.join(actorIds)})
      ORDER BY pa.[companyId]`);
    let source: 'cartera' | 'muestra';
    if (portfolio.length > 0) {
      source = 'cartera';
      const stride = Math.max(1, Math.floor(portfolio.length / MAX_COMPANIES));
      assignees = portfolio
        .filter((_, i) => i % stride === 0)
        .slice(0, MAX_COMPANIES)
        .map((p) => ({ ...p, role: roleOf.get(p.userId) as UserRole }));
    } else {
      source = 'muestra';
      const total = await count(
        Prisma.sql`SELECT COUNT(*) AS n FROM [dbo].[companies] WHERE [status] = ${'POR_CONTACTAR'}`,
      );
      const stride = Math.max(1, Math.floor(total / MAX_COMPANIES));
      const offset = SEED % stride;
      const rows = await db.$queryRaw<{ id: number }[]>(Prisma.sql`
        SELECT TOP (${MAX_COMPANIES}) [id] FROM [dbo].[companies]
        WHERE [status] = ${'POR_CONTACTAR'} AND [id] % ${stride} = ${offset}
        ORDER BY [id]`);
      // Productividad desigual por ejecutivo (0.5–1.3) para que el cumplimiento de cuota varíe.
      const weights = actorIds.map((id) => [id, 0.5 + rng() * 0.8] as const);
      assignees = rows.map((r) => {
        const userId = pick(weights);
        return { companyId: r.id, userId, role: roleOf.get(userId) as UserRole };
      });
    }

    // 4) Simulación empresa a empresa (cronológica dentro de cada una).
    const nowMs = Date.now();
    const windowStart = managuaMidnight(nowMs) - (WEEKS * 7 - 1) * DAY_MS;
    const stats = {
      companies: 0,
      interactions: 0,
      statusChanges: 0,
      errors: 0,
      finalStatus: {} as Record<string, number>,
    };
    const errorCodes: Record<string, number> = {};
    const fail = (e: unknown) => {
      stats.errors++;
      const code = (e as { code?: string }).code ?? (e as Error).name ?? 'ERROR';
      errorCodes[code] = (errorCodes[code] ?? 0) + 1;
    };

    for (const a of assignees) {
      const actor = { userId: a.userId, role: a.role };
      // Primer contacto: más probable en semanas recientes (ramp-up del equipo).
      const week = Math.min(WEEKS - 1, Math.floor(Math.sqrt(rng()) * WEEKS));
      const day = windowStart + (week * 7 + Math.floor(rng() * 5)) * DAY_MS;
      let at = businessInstant(day);
      let status: PipelineStatus = 'POR_CONTACTAR';
      let first = true;
      stats.companies++;

      for (let step = 0; step < 8 && at <= nowMs; step++) {
        clock.now = () => new Date(at);
        try {
          if (status === 'POR_CONTACTAR' || status === 'SIN_RESPUESTA') {
            if (!first && rng() < 0.35) break;
            const outcome = pick(first ? FIRST_OUTCOMES : RETRY_OUTCOMES);
            first = false;
            const res = await register.execute({
              companyId: a.companyId,
              actor,
              channel: pick(CHANNELS),
              outcome,
              occurredAt: new Date(at),
            });
            stats.interactions++;
            stats.statusChanges += res.transitions.length;
            status = res.state.status;
            if (outcome === 'NO_INTERESADO' && rng() < 0.5) {
              await change.execute({
                companyId: a.companyId,
                to: 'DESCARTADO',
                note: 'Sin interés (actividad simulada)',
                actor,
              });
              stats.statusChanges++;
              status = 'DESCARTADO';
              break;
            }
          } else if (status === 'CON_RESPUESTA') {
            if (rng() < 0.35) break;
            const outcome = pick(ANSWERED_OUTCOMES);
            const res = await register.execute({
              companyId: a.companyId,
              actor,
              channel: pick(CHANNELS),
              outcome,
              occurredAt: new Date(at),
              targetStatus: outcome === 'INTERESADO' && rng() < 0.6 ? 'AGENDANDO_CITA' : undefined,
            });
            stats.interactions++;
            stats.statusChanges += res.transitions.length;
            status = res.state.status;
          } else if (status === 'AGENDANDO_CITA' || status === 'EN_PROCESO_CONTRATO') {
            if (rng() < (status === 'AGENDANDO_CITA' ? 0.5 : 0.55)) break;
            const to = status === 'AGENDANDO_CITA' ? 'EN_PROCESO_CONTRATO' : 'CONTRATO_ACTIVO';
            const res = await change.execute({ companyId: a.companyId, to, actor });
            stats.statusChanges++;
            status = res.status;
          } else {
            break;
          }
        } catch (e) {
          fail(e);
          break;
        }
        at = businessInstant(managuaMidnight(at) + Math.ceil(1 + rng() * 5) * DAY_MS);
      }
      stats.finalStatus[status] = (stats.finalStatus[status] ?? 0) + 1;
    }

    console.log('Actividad simulada (solo cifras agregadas)');
    console.log(`  Origen de empresas:     ${source}`);
    console.log(`  Semanas / semilla:      ${WEEKS} / ${SEED}`);
    console.log(
      `  Actores:                ${actors.length} (${[...new Set(actors.map((x) => x.role))].join(', ')})`,
    );
    console.log(`  Empresas tocadas:       ${stats.companies}`);
    console.log(`  Interacciones:          ${stats.interactions}`);
    console.log(`  Cambios de estado:      ${stats.statusChanges}`);
    console.log(`  Errores:                ${stats.errors}`);
    for (const [code, n] of Object.entries(errorCodes)) console.log(`    - ${code}: ${n}`);
    console.log('  Estado final:');
    for (const [s, n] of Object.entries(stats.finalStatus).sort()) console.log(`    - ${s}: ${n}`);
  }
} catch (error) {
  console.error('Fallo en la simulación:', error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

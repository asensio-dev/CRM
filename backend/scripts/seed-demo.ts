/**
 * Datos de demostración (SOLO desarrollo), idempotente:
 *  - 1 SUPERVISOR y 3 EJECUTIVO de demo (@axiom.local) con la contraseña de SEED_DEMO_PASSWORD
 *    (argon2id, como el seed del admin). Si el usuario ya existe no se toca su contraseña.
 *  - Ejecuta la rotación semanal con los casos de uso reales: abre el ciclo actual, llena las
 *    carteras y genera los planes de esta semana.
 * Imprime solo cifras agregadas (nunca datos de empresas ni la contraseña).
 *
 * Uso: SEED_DEMO_PASSWORD=… bun run db:seed:demo
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PortfolioModule, RunWeeklyRotationUseCase } from '../src/modules/portfolio';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { SharedModule } from '../src/shared/infrastructure/shared.module';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo es solo para desarrollo (NODE_ENV=production).');
  process.exit(1);
}
const password = process.env.SEED_DEMO_PASSWORD;
if (!password) {
  console.error(
    'Falta SEED_DEMO_PASSWORD: define la contraseña de los usuarios demo en el entorno.',
  );
  process.exit(1);
}

const DEMO_USERS = [
  { email: 'supervisor@axiom.local', fullName: 'Sofía Supervisora (demo)', role: 'SUPERVISOR' },
  { email: 'ana@axiom.local', fullName: 'Ana Ejecutiva (demo)', role: 'EJECUTIVO' },
  { email: 'bruno@axiom.local', fullName: 'Bruno Ejecutivo (demo)', role: 'EJECUTIVO' },
  { email: 'carla@axiom.local', fullName: 'Carla Ejecutiva (demo)', role: 'EJECUTIVO' },
] as const;

@Module({ imports: [EventEmitterModule.forRoot(), SharedModule, PortfolioModule] })
class SeedDemoModule {}

const app = await NestFactory.createApplicationContext(SeedDemoModule, {
  logger: ['error', 'warn'],
});
let exitCode = 0;
try {
  const prisma = app.get(PrismaService).client;
  const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
  let created = 0;
  for (const u of DEMO_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.user.create({ data: { ...u, passwordHash } });
    created++;
  }
  console.log(`Usuarios demo: ${created} creados, ${DEMO_USERS.length - created} ya existían.`);

  const started = performance.now();
  const r = await app.get(RunWeeklyRotationUseCase).execute();
  const ms = Math.round(performance.now() - started);
  console.log(
    `Ciclo ${r.week.cycle.number} (${r.week.cycle.startDate} → ${r.week.cycle.endDate}), ` +
      `semana ${r.week.weekNumber}/${r.week.totalWeeks} (${r.week.weekStart} → ${r.week.weekEnd})`,
  );
  if (r.openedCycle) console.log(`  Ciclo abierto: ${r.openedCycle}`);
  if (r.closedCycle) console.log(`  Ciclo cerrado: ${JSON.stringify(r.closedCycle)}`);
  console.log(
    `  Carteras: ${r.refill.executives} ejecutivos, ${r.refill.assigned} asignaciones nuevas, ` +
      `${r.refill.shortfall} huecos sin cubrir`,
  );
  console.log(
    `  Planes: ${r.plans.generated} generados (${r.plans.items} ítems), ${r.plans.existing} ya existían`,
  );
  console.log(`  Rotación en ${ms} ms`);

  const [active, plans, items] = await Promise.all([
    prisma.portfolioAssignment.groupBy({
      by: ['userId'],
      where: { releasedAt: null },
      _count: { _all: true },
    }),
    prisma.weeklyPlan.count({ where: { cycleId: r.week.cycle.id } }),
    prisma.weeklyPlanItem.groupBy({
      by: ['reason'],
      where: { plan: { cycleId: r.week.cycle.id } },
      _count: { _all: true },
    }),
  ]);
  console.log(
    `  Asignaciones activas por ejecutivo: ${active.map((a) => a._count._all).join(', ') || '—'}`,
  );
  console.log(
    `  Planes del ciclo: ${plans}; ítems por motivo: ${
      items.map((i) => `${i.reason}=${i._count._all}`).join(', ') || '—'
    }`,
  );
} catch (error) {
  console.error(`seed-demo falló: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

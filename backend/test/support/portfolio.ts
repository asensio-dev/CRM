import type {
  AssignmentDto,
  CurrentCycleDto,
  MyWeekDto,
  Paginated,
  RunWeeklyResultDto,
} from '@axiom/contracts';
import type { TestApp } from './app';
import { assertTestDatabase } from './test-database';

/**
 * Borra ciclos, asignaciones y planes para partir de cero (solo AxiomCRM_Test). Las interacciones
 * se conservan (su ítem de plan se desvincula).
 */
export async function resetPortfolio(t: TestApp): Promise<void> {
  assertTestDatabase(process.env.DATABASE_URL);
  const db = t.prisma.client;
  await db.interaction.updateMany({ data: { planItemId: null } });
  await db.weeklyPlanItem.deleteMany();
  await db.weeklyPlan.deleteMany();
  await db.portfolioAssignment.deleteMany();
  await db.rotationCycle.deleteMany();
}

export async function runWeekly(t: TestApp, token: string) {
  return t.api<RunWeeklyResultDto>('POST', '/portfolio/run-weekly', { token });
}

export async function myWeek(t: TestApp, token: string, userId?: number) {
  const res = await t.api<MyWeekDto>(
    'GET',
    `/portfolio/my-week${userId ? `?userId=${userId}` : ''}`,
    { token },
  );
  if (res.status !== 200)
    throw new Error(`my-week falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function assignmentsOf(t: TestApp, token: string, userId: number) {
  const res = await t.api<Paginated<AssignmentDto>>(
    'GET',
    `/portfolio/assignments?userId=${userId}&pageSize=100`,
    { token },
  );
  if (res.status !== 200) throw new Error(`assignments falló: ${res.status}`);
  return res.body;
}

export async function currentCycle(t: TestApp, token: string) {
  const res = await t.api<CurrentCycleDto>('GET', '/portfolio/cycles/current', { token });
  if (res.status !== 200) throw new Error(`cycles/current falló: ${res.status}`);
  return res.body;
}

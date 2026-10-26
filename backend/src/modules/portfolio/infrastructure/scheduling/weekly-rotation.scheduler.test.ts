import { describe, expect, test } from 'bun:test';
import { testConfig } from '../../../identity/test-support';
import type { RunWeeklyRotationUseCase } from '../../application/use-cases/run-weekly-rotation.use-case';
import { WeeklyRotationScheduler } from './weekly-rotation.scheduler';

function setup(schedulerEnabled: boolean) {
  let runs = 0;
  const runWeekly = {
    execute: async () => {
      runs++;
      return {
        week: { cycle: { number: 1 }, weekNumber: 1, totalWeeks: 3 },
        closedCycle: null,
        refill: { assigned: 0, shortfall: 0 },
        plans: { generated: 0, items: 0 },
      };
    },
  } as unknown as RunWeeklyRotationUseCase;
  const scheduler = new WeeklyRotationScheduler(
    runWeekly,
    testConfig({ SCHEDULER_ENABLED: schedulerEnabled }),
  );
  return { scheduler, runs: () => runs };
}

describe('WeeklyRotationScheduler y SCHEDULER_ENABLED', () => {
  test('habilitado: el cron ejecuta la rotación', async () => {
    const { scheduler, runs } = setup(true);
    await scheduler.handle();
    expect(runs()).toBe(1);
  });

  test('deshabilitado: el cron no hace nada', async () => {
    const { scheduler, runs } = setup(false);
    await scheduler.handle();
    expect(runs()).toBe(0);
  });
});

import { describe, expect, test } from 'bun:test';
import { APP_VERSION } from '../config/app-version';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  test('responde estado, base de datos y versión (la de backend/package.json)', async () => {
    const prisma = { db: { $queryRaw: async () => [{ '': 1 }] } } as unknown as PrismaService;
    const body = await new HealthController(prisma).check();
    expect(body).toEqual({ status: 'ok', database: 'up', version: APP_VERSION });
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

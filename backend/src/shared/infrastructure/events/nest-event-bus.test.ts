import { describe, expect, mock, test } from 'bun:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AppConfig } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { NestEventBus } from './nest-event-bus';

/** PrismaService real con `$transaction` falso: no necesita base de datos. */
function setup() {
  const prisma = new PrismaService({
    DATABASE_URL: 'sqlserver://localhost:1433;database=Fake',
  } as AppConfig);
  const fakeTx = {};
  (prisma.client as unknown as { $transaction: unknown }).$transaction = (
    fn: (tx: unknown) => Promise<unknown>,
  ) => fn(fakeTx);
  const emitter = new EventEmitter2();
  const received: string[] = [];
  emitter.on('test.happened', () => received.push('test.happened'));
  return { prisma, bus: new NestEventBus(emitter, prisma), received };
}

const event = { name: 'test.happened', occurredAt: new Date() };

describe('NestEventBus + PrismaService.afterCommit', () => {
  test('outside a transaction events are published immediately', async () => {
    const { bus, received } = setup();
    await bus.publishAll([event]);
    expect(received).toEqual(['test.happened']);
  });

  test('a nested use case publishes only after the OUTER transaction commits', async () => {
    const { prisma, bus, received } = setup();
    await prisma.runInTransaction(async () => {
      await prisma.runInTransaction(async () => undefined); // caso de uso anidado
      await bus.publishAll([event]);
      expect(received).toEqual([]); // aún dentro de la transacción exterior
    });
    expect(received).toEqual(['test.happened']);
  });

  test('events are discarded when the outer transaction rolls back', async () => {
    const { prisma, bus, received } = setup();
    const handler = mock(async () => {
      await bus.publishAll([event]);
      throw new Error('rollback');
    });
    await expect(prisma.runInTransaction(handler)).rejects.toThrow('rollback');
    expect(received).toEqual([]);
  });

  test('db returns the transaction client only inside runInTransaction', async () => {
    const { prisma } = setup();
    expect(prisma.db).toBe(prisma.client);
    await prisma.runInTransaction(async () => {
      expect(prisma.db).not.toBe(prisma.client);
    });
  });
});

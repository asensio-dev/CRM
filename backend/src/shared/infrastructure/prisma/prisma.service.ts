import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../../../generated/prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * Cliente Prisma único de la app. Los repositorios usan siempre `prisma.db`:
 * dentro de `PrismaUnitOfWork.run()` devuelve el cliente de la transacción en curso,
 * fuera de ella el cliente normal. Así los casos de uso no saben nada de Prisma.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;
  private readonly txStorage = new AsyncLocalStorage<TransactionClient>();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new PrismaClient({ adapter: new PrismaMssql(config.DATABASE_URL) });
  }

  get db(): TransactionClient {
    return this.txStorage.getStore() ?? this.client;
  }

  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.txStorage.getStore()) return work(); // transacción anidada → reutiliza la actual
    return this.client.$transaction((tx) => this.txStorage.run(tx, work));
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

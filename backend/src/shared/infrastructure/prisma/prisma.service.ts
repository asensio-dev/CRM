import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../../../generated/prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/env';

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

interface TransactionContext {
  tx: TransactionClient;
  /** Acciones diferidas hasta que confirme la transacción MÁS EXTERNA (p. ej. publicar eventos). */
  afterCommit: Array<() => Promise<void>>;
}

/**
 * Cliente Prisma único de la app. Los repositorios usan siempre `prisma.db`:
 * dentro de `PrismaUnitOfWork.run()` devuelve el cliente de la transacción en curso,
 * fuera de ella el cliente normal. Así los casos de uso no saben nada de Prisma.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;
  private readonly txStorage = new AsyncLocalStorage<TransactionContext>();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new PrismaClient({ adapter: new PrismaMssql(config.DATABASE_URL) });
  }

  get db(): TransactionClient {
    return this.txStorage.getStore()?.tx ?? this.client;
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.txStorage.getStore()) return work(); // transacción anidada → reutiliza la actual
    const afterCommit: TransactionContext['afterCommit'] = [];
    const result = await this.client.$transaction((tx) =>
      this.txStorage.run({ tx, afterCommit }, work),
    );
    // Solo se llega aquí si la transacción confirmó; con rollback las acciones se descartan.
    for (const action of afterCommit) await action();
    return result;
  }

  /**
   * Ejecuta `action` cuando confirme la transacción más externa en curso, o de inmediato si no hay
   * ninguna. Evita publicar eventos de un caso de uso anidado (p. ej. el pipeline dentro de una cita)
   * cuya transacción exterior todavía puede hacer rollback.
   */
  async afterCommit(action: () => Promise<void>): Promise<void> {
    const context = this.txStorage.getStore();
    if (context) context.afterCommit.push(action);
    else await action();
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

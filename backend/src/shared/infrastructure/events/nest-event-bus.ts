import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventBus } from '../../application';
import type { DomainEvent } from '../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Adaptador del puerto EventBus. Los suscriptores usan `@OnEvent(event.name)`.
 * Si se publica dentro de una transacción (caso de uso anidado), los eventos se difieren hasta que
 * confirme la transacción más externa y se descartan si hace rollback.
 */
@Injectable()
export class NestEventBus implements EventBus {
  constructor(
    private readonly emitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  async publishAll(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.prisma.afterCommit(async () => {
      for (const event of events) {
        await this.emitter.emitAsync(event.name, event);
      }
    });
  }
}

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventBus } from '../../application';
import type { DomainEvent } from '../../domain';

/** Adaptador del puerto EventBus. Los suscriptores usan `@OnEvent(event.name)`. */
@Injectable()
export class NestEventBus implements EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.emitter.emitAsync(event.name, event);
    }
  }
}

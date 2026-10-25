import type { DomainEvent } from './domain-event';

/** Entidad: se identifica por su id. `null` = aún no persistida. */
export abstract class Entity<TId = number> {
  protected constructor(protected _id: TId | null) {}

  get id(): TId | null {
    return this._id;
  }

  equals(other?: Entity<TId>): boolean {
    if (!other || this._id === null || other._id === null) return false;
    return other.constructor === this.constructor && other._id === this._id;
  }
}

/** Raíz de agregado: frontera de consistencia que acumula eventos de dominio. */
export abstract class AggregateRoot<TId = number> extends Entity<TId> {
  private readonly events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.events.push(event);
  }

  /** Devuelve y vacía los eventos pendientes (se publican tras confirmar la transacción). */
  pullEvents(): DomainEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

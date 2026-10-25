export interface DomainEvent {
  /** Nombre estable del evento, p. ej. `pipeline.company-status-changed` */
  readonly name: string;
  readonly occurredAt: Date;
}

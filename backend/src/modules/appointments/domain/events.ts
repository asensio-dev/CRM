import type { DomainEvent } from '../../../shared/domain';

export class AppointmentScheduled implements DomainEvent {
  readonly name = 'appointments.scheduled';
  constructor(
    readonly companyId: number,
    readonly userId: number,
    readonly scheduledAt: Date,
    readonly occurredAt: Date,
  ) {}
}

export class AppointmentRescheduled implements DomainEvent {
  readonly name = 'appointments.rescheduled';
  constructor(
    readonly companyId: number,
    readonly userId: number,
    readonly previousAt: Date,
    readonly newAt: Date,
    readonly occurredAt: Date,
  ) {}
}

export class AppointmentCompleted implements DomainEvent {
  readonly name = 'appointments.completed';
  constructor(
    readonly companyId: number,
    readonly userId: number,
    readonly occurredAt: Date,
  ) {}
}

export class AppointmentCancelled implements DomainEvent {
  readonly name = 'appointments.cancelled';
  constructor(
    readonly companyId: number,
    readonly userId: number,
    readonly occurredAt: Date,
  ) {}
}

import type { AppointmentMode, AppointmentStatus } from '@axiom/contracts';
import { AggregateRoot, DomainError } from '../../../shared/domain';
import {
  AppointmentCancelled,
  AppointmentCompleted,
  AppointmentRescheduled,
  AppointmentScheduled,
} from './events';

export const MAX_NOTES = 2000;
export const MAX_LOCATION = 300;

export interface AppointmentProps {
  companyId: number;
  userId: number;
  scheduledAt: Date;
  mode: AppointmentMode;
  location: string | null;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewAppointmentInput {
  companyId: number;
  userId: number;
  scheduledAt: Date;
  mode: AppointmentMode;
  location?: string | null;
  notes?: string | null;
}

export interface RescheduleInput {
  scheduledAt: Date;
  mode?: AppointmentMode;
  location?: string | null;
  notes?: string | null;
}

const clean = (value: string | null | undefined): string | null => value?.trim() || null;

/**
 * Cita comercial. Ciclo de vida:
 *
 *   PROGRAMADA → REALIZADA      (complete, con resultado)
 *   PROGRAMADA → CANCELADA      (cancel, motivo opcional)
 *   PROGRAMADA → REPROGRAMADA   (reschedule: esta fila queda como histórico y se CREA otra cita PROGRAMADA)
 *
 * REALIZADA, CANCELADA y REPROGRAMADA son finales.
 */
export class Appointment extends AggregateRoot {
  private constructor(
    id: number | null,
    private props: AppointmentProps,
  ) {
    super(id);
  }

  static schedule(input: NewAppointmentInput, now: Date): Appointment {
    const appointment = new Appointment(null, {
      companyId: input.companyId,
      userId: input.userId,
      scheduledAt: Appointment.validDate(input.scheduledAt, now),
      mode: input.mode,
      location: Appointment.validLocation(input.mode, input.location),
      status: 'PROGRAMADA',
      notes: Appointment.validNotes(input.notes),
      createdAt: now,
      updatedAt: now,
    });
    appointment.record(
      new AppointmentScheduled(input.companyId, input.userId, input.scheduledAt, now),
    );
    return appointment;
  }

  static rehydrate(id: number, props: AppointmentProps): Appointment {
    return new Appointment(id, props);
  }

  // ─── lectura ───
  get companyId(): number {
    return this.props.companyId;
  }
  get userId(): number {
    return this.props.userId;
  }
  get scheduledAt(): Date {
    return this.props.scheduledAt;
  }
  get mode(): AppointmentMode {
    return this.props.mode;
  }
  get location(): string | null {
    return this.props.location;
  }
  get status(): AppointmentStatus {
    return this.props.status;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  assignId(id: number): void {
    this._id = id;
  }

  // ─── comportamiento ───

  /**
   * Reprograma: esta cita pasa a REPROGRAMADA (histórico, intacta) y devuelve la NUEVA cita PROGRAMADA
   * del mismo dueño y empresa. El llamador persiste ambas en la misma transacción.
   */
  reschedule(input: RescheduleInput, now: Date): Appointment {
    this.assertScheduled();
    const mode = input.mode ?? this.props.mode;
    const location = input.location === undefined ? this.props.location : input.location;
    const next = Appointment.schedule(
      {
        companyId: this.props.companyId,
        userId: this.props.userId,
        scheduledAt: input.scheduledAt,
        mode,
        location,
        notes: input.notes ?? this.props.notes,
      },
      now,
    );
    this.props = { ...this.props, status: 'REPROGRAMADA', updatedAt: now };
    next.pullEvents(); // el evento relevante es el de reprogramación
    this.record(
      new AppointmentRescheduled(
        this.props.companyId,
        this.props.userId,
        this.props.scheduledAt,
        input.scheduledAt,
        now,
      ),
    );
    return next;
  }

  /** Marca la cita como realizada y anexa el resultado a las notas. */
  complete(outcome: string, now: Date): void {
    this.assertScheduled();
    const text = clean(outcome);
    if (!text) {
      throw DomainError.validation(
        'APPOINTMENT_OUTCOME_REQUIRED',
        'Indique el resultado de la cita',
      );
    }
    this.props = {
      ...this.props,
      status: 'REALIZADA',
      notes: Appointment.append(this.props.notes, 'Resultado', text),
      updatedAt: now,
    };
    this.record(new AppointmentCompleted(this.props.companyId, this.props.userId, now));
  }

  cancel(reason: string | null | undefined, now: Date): void {
    this.assertScheduled();
    const text = clean(reason);
    this.props = {
      ...this.props,
      status: 'CANCELADA',
      notes: text ? Appointment.append(this.props.notes, 'Cancelación', text) : this.props.notes,
      updatedAt: now,
    };
    this.record(new AppointmentCancelled(this.props.companyId, this.props.userId, now));
  }

  // ─── invariantes ───
  private assertScheduled(): void {
    if (this.props.status !== 'PROGRAMADA') {
      throw new DomainError(
        'APPOINTMENT_NOT_SCHEDULED',
        `Solo una cita PROGRAMADA admite esta operación (estado actual: ${this.props.status})`,
        'RULE',
        { status: this.props.status },
      );
    }
  }

  private static validDate(scheduledAt: Date, now: Date): Date {
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now.getTime()) {
      throw DomainError.validation(
        'APPOINTMENT_DATE_IN_PAST',
        'La fecha de la cita debe ser futura',
      );
    }
    return scheduledAt;
  }

  private static validLocation(mode: AppointmentMode, location: string | null | undefined) {
    const value = clean(location);
    if (mode === 'PRESENCIAL' && !value) {
      throw DomainError.validation(
        'APPOINTMENT_LOCATION_REQUIRED',
        'Una cita presencial requiere lugar',
      );
    }
    if (value && value.length > MAX_LOCATION) {
      throw DomainError.validation(
        'APPOINTMENT_LOCATION_TOO_LONG',
        `El lugar admite ${MAX_LOCATION} caracteres`,
      );
    }
    return value;
  }

  private static validNotes(notes: string | null | undefined): string | null {
    const value = clean(notes);
    if (value && value.length > MAX_NOTES) {
      throw DomainError.validation(
        'APPOINTMENT_NOTES_TOO_LONG',
        `Las notas admiten ${MAX_NOTES} caracteres`,
      );
    }
    return value;
  }

  private static append(notes: string | null, label: string, text: string): string {
    const merged = notes ? `${notes}\n\n${label}: ${text}` : `${label}: ${text}`;
    if (merged.length > MAX_NOTES) {
      throw DomainError.validation(
        'APPOINTMENT_NOTES_TOO_LONG',
        `Las notas de la cita no pueden superar ${MAX_NOTES} caracteres (acorte el texto)`,
      );
    }
    return merged;
  }
}

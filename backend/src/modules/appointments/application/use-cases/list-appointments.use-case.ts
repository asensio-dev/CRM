import type {
  AgendaQuery,
  AppointmentDto,
  ListAppointmentsQuery,
  Paginated,
} from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { APPOINTMENT_READER, type AppointmentReader, appointmentForbidden } from '../../domain';
import { type AppointmentActor, isPrivileged } from '../actor';

/** EJECUTIVO ve solo lo suyo (pedir otro userId → 403); SUPERVISOR / ADMIN ven todo o filtran por usuario. */
function scopeUser(actor: AppointmentActor, requested: number | undefined): number | undefined {
  if (isPrivileged(actor)) return requested;
  if (requested !== undefined && requested !== actor.userId) throw appointmentForbidden();
  return actor.userId;
}

@Injectable()
export class ListAppointmentsUseCase
  implements
    UseCase<{ query: ListAppointmentsQuery; actor: AppointmentActor }, Paginated<AppointmentDto>>
{
  constructor(@Inject(APPOINTMENT_READER) private readonly reader: AppointmentReader) {}

  async execute({ query, actor }: { query: ListAppointmentsQuery; actor: AppointmentActor }) {
    return this.reader.list({ ...query, userId: scopeUser(actor, query.userId) });
  }
}

/** Agenda (calendario): citas en [from, to). Sin userId: las propias (EJECUTIVO) o todas (privilegiado). */
@Injectable()
export class GetAgendaUseCase
  implements UseCase<{ query: AgendaQuery; actor: AppointmentActor }, AppointmentDto[]>
{
  constructor(@Inject(APPOINTMENT_READER) private readonly reader: AppointmentReader) {}

  async execute({ query, actor }: { query: AgendaQuery; actor: AppointmentActor }) {
    return this.reader.agenda({
      userId: scopeUser(actor, query.userId),
      from: query.from,
      to: query.to,
    });
  }
}

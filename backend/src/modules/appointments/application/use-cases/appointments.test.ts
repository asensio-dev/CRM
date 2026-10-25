import { beforeEach, describe, expect, test } from 'bun:test';
import type { PipelineStatus } from '@axiom/contracts';
import type { EventBus, UnitOfWork } from '../../../../shared/application';
import { DomainError, type DomainEvent } from '../../../../shared/domain';
import type { ChangeCompanyStatusUseCase } from '../../../pipeline';
import { Appointment } from '../../domain';
import { InMemoryAppointmentStore } from '../../infrastructure/persistence/in-memory-appointments';
import { PipelineStatusGateway } from '../../infrastructure/pipeline/pipeline-status.gateway';
import type { AppointmentActor } from '../actor';
import { CancelAppointmentUseCase } from './cancel-appointment.use-case';
import { CompleteAppointmentUseCase } from './complete-appointment.use-case';
import { GetAgendaUseCase, ListAppointmentsUseCase } from './list-appointments.use-case';
import { RescheduleAppointmentUseCase } from './reschedule-appointment.use-case';
import { ScheduleAppointmentUseCase } from './schedule-appointment.use-case';

const NOW = new Date('2026-10-25T15:00:00Z');
const FUTURE = new Date('2026-11-02T15:00:00Z');
const clock = { now: () => NOW };
const uow: UnitOfWork = { run: (work) => work() };

class Bus implements EventBus {
  published: DomainEvent[] = [];
  async publishAll(events: DomainEvent[]) {
    this.published.push(...events);
  }
}

/** Réplica mínima de la máquina de estados del pipeline para los destinos que usa este módulo. */
class FakeChangeStatus {
  statuses = new Map<number, PipelineStatus>();
  calls: { companyId: number; to: PipelineStatus }[] = [];
  async execute(input: { companyId: number; to: PipelineStatus }) {
    this.calls.push({ companyId: input.companyId, to: input.to });
    const from = this.statuses.get(input.companyId);
    if (!from) throw DomainError.notFound('PIPELINE_COMPANY_NOT_FOUND', 'no existe');
    if (from === 'CON_RESPUESTA' && input.to === 'AGENDANDO_CITA') {
      this.statuses.set(input.companyId, input.to);
      return {};
    }
    throw new DomainError('PIPELINE_INVALID_TRANSITION', 'no', 'RULE', {
      from,
      to: input.to,
      allowed: [],
    });
  }
}

const EXEC: AppointmentActor = { userId: 7, role: 'EJECUTIVO' };
const OTHER: AppointmentActor = { userId: 8, role: 'EJECUTIVO' };
const SUP: AppointmentActor = { userId: 1, role: 'SUPERVISOR' };

let store: InMemoryAppointmentStore;
let status: FakeChangeStatus;
let bus: Bus;
let schedule: ScheduleAppointmentUseCase;
let reschedule: RescheduleAppointmentUseCase;
let complete: CompleteAppointmentUseCase;
let cancel: CancelAppointmentUseCase;

const base = {
  companyId: 1,
  scheduledAt: FUTURE,
  mode: 'VIRTUAL' as const,
};

beforeEach(() => {
  store = new InMemoryAppointmentStore();
  status = new FakeChangeStatus();
  status.statuses.set(1, 'CON_RESPUESTA');
  bus = new Bus();
  const gateway = new PipelineStatusGateway(status as unknown as ChangeCompanyStatusUseCase);
  schedule = new ScheduleAppointmentUseCase(store, store, gateway, uow, bus, clock);
  reschedule = new RescheduleAppointmentUseCase(store, store, uow, bus, clock);
  complete = new CompleteAppointmentUseCase(store, store, uow, bus, clock);
  cancel = new CancelAppointmentUseCase(store, store, uow, bus, clock);
});

describe('Appointment aggregate', () => {
  test('requires a future date and a location for PRESENCIAL', () => {
    const make = (over: object) =>
      Appointment.schedule(
        { companyId: 1, userId: 1, mode: 'VIRTUAL', scheduledAt: FUTURE, ...over },
        NOW,
      );
    expect(() => make({ scheduledAt: NOW })).toThrow(/futura/);
    expect(() => make({ mode: 'PRESENCIAL' })).toThrow(/lugar/);
    expect(make({ mode: 'PRESENCIAL', location: ' Oficina ' }).location).toBe('Oficina');
  });

  test('final states reject further operations', () => {
    const a = Appointment.schedule(
      { companyId: 1, userId: 1, mode: 'VIRTUAL', scheduledAt: FUTURE },
      NOW,
    );
    a.cancel('no puede', NOW);
    expect(a.status).toBe('CANCELADA');
    expect(a.notes).toBe('Cancelación: no puede');
    expect(() => a.complete('x', NOW)).toThrow(/PROGRAMADA/);
    expect(() => a.cancel(null, NOW)).toThrow(DomainError);
  });

  test('complete requires an outcome and appends it to the notes', () => {
    const a = Appointment.schedule(
      { companyId: 1, userId: 1, mode: 'VIRTUAL', scheduledAt: FUTURE, notes: 'Llevar propuesta' },
      NOW,
    );
    expect(() => a.complete('  ', NOW)).toThrow(/resultado/);
    a.complete('Aceptó propuesta', NOW);
    expect(a.notes).toBe('Llevar propuesta\n\nResultado: Aceptó propuesta');
  });
});

describe('ScheduleAppointmentUseCase', () => {
  test('moves a CON_RESPUESTA company to AGENDANDO_CITA and stores the appointment', async () => {
    store.companyNames.set(1, 'ACME');
    const dto = await schedule.execute({ data: base, actor: EXEC });
    expect(dto).toMatchObject({ id: 1, userId: 7, status: 'PROGRAMADA', companyName: 'ACME' });
    expect(status.statuses.get(1)).toBe('AGENDANDO_CITA');
    expect(bus.published.map((e) => e.name)).toEqual(['appointments.scheduled']);
  });

  test.each(['AGENDANDO_CITA', 'EN_PROCESO_CONTRATO', 'CONTRATO_ACTIVO'] as const)(
    'company already in %s: appointment created, no status change',
    async (current) => {
      status.statuses.set(1, current);
      await schedule.execute({ data: base, actor: EXEC });
      expect(status.statuses.get(1)).toBe(current);
      expect(store.rows.size).toBe(1);
    },
  );

  test.each(['POR_CONTACTAR', 'CONTACTADO', 'SIN_RESPUESTA', 'DESCARTADO'] as const)(
    'company in %s is rejected with APPOINTMENT_COMPANY_NOT_READY',
    async (current) => {
      status.statuses.set(1, current);
      const error = await schedule.execute({ data: base, actor: EXEC }).catch((e) => e);
      expect(error).toMatchObject({ code: 'APPOINTMENT_COMPANY_NOT_READY', kind: 'RULE' });
      expect(error.details.from).toBe(current);
      expect(store.rows.size).toBe(0);
    },
  );

  test('unknown company surfaces the pipeline 404', async () => {
    const error = await schedule
      .execute({ data: { ...base, companyId: 99 }, actor: EXEC })
      .catch((e) => e);
    expect(error).toMatchObject({ code: 'PIPELINE_COMPANY_NOT_FOUND', kind: 'NOT_FOUND' });
  });

  test('only supervisors/admins can schedule for another user', async () => {
    const denied = await schedule
      .execute({ data: { ...base, userId: 8 }, actor: EXEC })
      .catch((e) => e);
    expect(denied.kind).toBe('FORBIDDEN');
    const ok = await schedule.execute({ data: { ...base, userId: 8 }, actor: SUP });
    expect(ok.userId).toBe(8);
  });

  test('validation failure does not touch the pipeline', async () => {
    await expect(
      schedule.execute({ data: { ...base, scheduledAt: NOW }, actor: EXEC }),
    ).rejects.toThrow(/futura/);
    expect(status.calls).toEqual([]);
  });
});

describe('reschedule / complete / cancel', () => {
  test('reschedule keeps the old row as REPROGRAMADA and creates a new PROGRAMADA one', async () => {
    const original = await schedule.execute({ data: { ...base, notes: 'n' }, actor: EXEC });
    const later = new Date('2026-11-09T15:00:00Z');
    const result = await reschedule.execute({
      id: original.id,
      data: { scheduledAt: later },
      actor: EXEC,
    });
    expect(result.previous).toMatchObject({ id: original.id, status: 'REPROGRAMADA' });
    expect(result.appointment).toMatchObject({
      status: 'PROGRAMADA',
      scheduledAt: later.toISOString(),
      userId: 7,
      notes: 'n',
    });
    expect(result.appointment.id).not.toBe(original.id);
    expect(bus.published.map((e) => e.name)).toContain('appointments.rescheduled');
    // la ya reprogramada no se puede volver a reprogramar
    const again = await reschedule
      .execute({ id: original.id, data: { scheduledAt: later }, actor: EXEC })
      .catch((e) => e);
    expect(again.code).toBe('APPOINTMENT_NOT_SCHEDULED');
  });

  test('complete and cancel update status; ownership is enforced', async () => {
    const a = await schedule.execute({ data: base, actor: EXEC });
    const b = await schedule.execute({ data: base, actor: EXEC });
    const denied = await complete.execute({ id: a.id, outcome: 'x', actor: OTHER }).catch((e) => e);
    expect(denied).toMatchObject({ code: 'APPOINTMENT_FORBIDDEN', kind: 'FORBIDDEN' });

    expect((await complete.execute({ id: a.id, outcome: 'Cerrada', actor: EXEC })).status).toBe(
      'REALIZADA',
    );
    expect((await cancel.execute({ id: b.id, reason: 'Cliente viaja', actor: SUP })).status).toBe(
      'CANCELADA',
    );
    const missing = await cancel.execute({ id: 99, actor: SUP }).catch((e) => e);
    expect(missing.code).toBe('APPOINTMENT_NOT_FOUND');
  });
});

describe('ListAppointments / GetAgenda', () => {
  test('executives are scoped to their own appointments; privileged users can filter', async () => {
    await schedule.execute({ data: base, actor: EXEC });
    await schedule.execute({ data: { ...base, userId: 8 }, actor: SUP });
    const list = new ListAppointmentsUseCase(store);
    const query = { page: 1, pageSize: 25 };
    expect((await list.execute({ query, actor: EXEC })).total).toBe(1);
    expect((await list.execute({ query, actor: SUP })).total).toBe(2);
    expect((await list.execute({ query: { ...query, userId: 8 }, actor: SUP })).total).toBe(1);
    const denied = await list
      .execute({ query: { ...query, userId: 8 }, actor: EXEC })
      .catch((e) => e);
    expect(denied.kind).toBe('FORBIDDEN');
  });

  test('agenda returns the range [from, to) ordered by date', async () => {
    await schedule.execute({
      data: { ...base, scheduledAt: new Date('2026-11-05T10:00:00Z') },
      actor: EXEC,
    });
    await schedule.execute({
      data: { ...base, scheduledAt: new Date('2026-11-03T10:00:00Z') },
      actor: EXEC,
    });
    await schedule.execute({
      data: { ...base, scheduledAt: new Date('2026-12-01T10:00:00Z') },
      actor: EXEC,
    });
    const agenda = new GetAgendaUseCase(store);
    const result = await agenda.execute({
      query: { from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-30T00:00:00Z') },
      actor: EXEC,
    });
    expect(result.map((a) => a.scheduledAt)).toEqual([
      '2026-11-03T10:00:00.000Z',
      '2026-11-05T10:00:00.000Z',
    ]);
  });
});

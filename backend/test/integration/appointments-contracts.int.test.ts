import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { AppointmentDto, ContractDto, Paginated, RescheduleResultDto } from '@axiom/contracts';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChangeCompanyStatusUseCase } from '../../src/modules/pipeline';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/shared/application';
import { bootApp, expectError, type TestApp } from '../support/app';
import { companyWithResponse, createCompany, interact, pipelineState } from '../support/factories';

const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();
const ymd = (days: number): string => inDays(days).slice(0, 10);

describe('citas', () => {
  let t: TestApp;
  let admin: string;
  let exec1: string;
  let exec2: string;

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
    exec1 = (await t.login('exec1')).token;
    exec2 = (await t.login('exec2')).token;
  });
  afterAll(() => t.close());

  const schedule = (token: string, body: Record<string, unknown>) =>
    t.api<AppointmentDto>('POST', '/appointments', { token, body });

  test('agendar mueve la empresa CON_RESPUESTA → AGENDANDO_CITA', async () => {
    const c = await companyWithResponse(t, admin);
    const res = await schedule(admin, {
      companyId: c.id,
      scheduledAt: inDays(2),
      mode: 'PRESENCIAL',
      location: 'Oficina del cliente',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ companyId: c.id, status: 'PROGRAMADA', mode: 'PRESENCIAL' });
    expect((await pipelineState(t, admin, c.id)).status).toBe('AGENDANDO_CITA');
  });

  test('desde POR_CONTACTAR se rechaza (422) y no se crea nada', async () => {
    const c = await createCompany(t, admin);
    const res = await schedule(admin, { companyId: c.id, scheduledAt: inDays(2), mode: 'VIRTUAL' });
    expectError(res, 422, 'APPOINTMENT_COMPANY_NOT_READY');
    expect((await pipelineState(t, admin, c.id)).status).toBe('POR_CONTACTAR');
    expect(await t.prisma.client.appointment.count({ where: { companyId: c.id } })).toBe(0);
  });

  test('agendar de nuevo con la empresa ya en AGENDANDO_CITA es válido (sin cambio de estado)', async () => {
    const c = await companyWithResponse(t, admin);
    await schedule(admin, { companyId: c.id, scheduledAt: inDays(2), mode: 'TELEFONICA' });
    const second = await schedule(admin, {
      companyId: c.id,
      scheduledAt: inDays(3),
      mode: 'TELEFONICA',
    });
    expect(second.status).toBe(201);
    expect((await pipelineState(t, admin, c.id)).status).toBe('AGENDANDO_CITA');
  });

  test('validaciones: fecha pasada y PRESENCIAL sin lugar no se aceptan', async () => {
    const c = await companyWithResponse(t, admin);
    const past = await schedule(admin, {
      companyId: c.id,
      scheduledAt: inDays(-1),
      mode: 'VIRTUAL',
    });
    expect([400, 422]).toContain(past.status);
    const noPlace = await schedule(admin, {
      companyId: c.id,
      scheduledAt: inDays(1),
      mode: 'PRESENCIAL',
    });
    expect([400, 422]).toContain(noPlace.status);
    expect((await pipelineState(t, admin, c.id)).status).toBe('CON_RESPUESTA');
  });

  test('un EJECUTIVO sin la empresa asignada: 403 y la transacción no deja citas ni cambia el estado', async () => {
    const c = await companyWithResponse(t, admin);
    const res = await schedule(exec1, { companyId: c.id, scheduledAt: inDays(2), mode: 'VIRTUAL' });
    expectError(res, 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');
    expect((await pipelineState(t, admin, c.id)).status).toBe('CON_RESPUESTA');
    expect(await t.prisma.client.appointment.count({ where: { companyId: c.id } })).toBe(0);
  });

  test('reprogramar deja la original REPROGRAMADA y crea una nueva PROGRAMADA', async () => {
    const c = await companyWithResponse(t, admin);
    const created = await schedule(admin, {
      companyId: c.id,
      scheduledAt: inDays(2),
      mode: 'VIRTUAL',
    });
    const res = await t.api<RescheduleResultDto>(
      'POST',
      `/appointments/${created.body.id}/reschedule`,
      {
        token: admin,
        body: { scheduledAt: inDays(5) },
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.previous).toMatchObject({ id: created.body.id, status: 'REPROGRAMADA' });
    expect(res.body.appointment).toMatchObject({ status: 'PROGRAMADA', companyId: c.id });
    expect(res.body.appointment.id).not.toBe(created.body.id);
    // una cita ya reprogramada no admite más cambios
    expectError(
      await t.api('POST', `/appointments/${created.body.id}/cancel`, { token: admin, body: {} }),
      422,
    );
  });

  test('completar exige resultado y cancelar anexa el motivo', async () => {
    const c = await companyWithResponse(t, admin);
    const a = await schedule(admin, { companyId: c.id, scheduledAt: inDays(2), mode: 'VIRTUAL' });
    expectError(
      await t.api('POST', `/appointments/${a.body.id}/complete`, { token: admin, body: {} }),
      400,
    );
    const done = await t.api<AppointmentDto>('POST', `/appointments/${a.body.id}/complete`, {
      token: admin,
      body: { outcome: 'Quedaron en enviar propuesta' },
    });
    expect(done.body.status).toBe('REALIZADA');
    expect(done.body.notes).toContain('Quedaron en enviar propuesta');

    const b = await schedule(admin, { companyId: c.id, scheduledAt: inDays(4), mode: 'VIRTUAL' });
    const cancelled = await t.api<AppointmentDto>('POST', `/appointments/${b.body.id}/cancel`, {
      token: admin,
      body: { reason: 'Cliente viajó' },
    });
    expect(cancelled.body.status).toBe('CANCELADA');
    expect(cancelled.body.notes).toContain('Cliente viajó');
  });

  test('listado y agenda: orden por fecha, rango [from, to) y alcance por rol', async () => {
    const c1 = await companyWithResponse(t, admin);
    const c2 = await companyWithResponse(t, admin);
    const late = await schedule(admin, {
      companyId: c1.id,
      scheduledAt: inDays(41),
      mode: 'VIRTUAL',
    });
    const early = await schedule(admin, {
      companyId: c2.id,
      scheduledAt: inDays(40),
      mode: 'VIRTUAL',
    });

    const agenda = await t.api<AppointmentDto[]>(
      'GET',
      `/appointments/agenda?from=${encodeURIComponent(inDays(39.5))}&to=${encodeURIComponent(inDays(42))}`,
      { token: admin },
    );
    expect(agenda.status).toBe(200);
    expect(agenda.body.map((a) => a.id)).toEqual([early.body.id, late.body.id]);

    // rango mayor de 62 días → 400
    expectError(
      await t.api(
        'GET',
        `/appointments/agenda?from=${encodeURIComponent(inDays(0))}&to=${encodeURIComponent(inDays(70))}`,
        {
          token: admin,
        },
      ),
      400,
    );

    // el EJECUTIVO solo ve las suyas (ninguna de estas)
    const mine = await t.api<Paginated<AppointmentDto>>('GET', '/appointments?pageSize=100', {
      token: exec2,
    });
    const adminId = (await t.login('admin')).user.id;
    expect(mine.body.items.some((a) => a.userId === adminId)).toBe(false);
    const all = await t.api<Paginated<AppointmentDto>>(
      'GET',
      '/appointments?status=PROGRAMADA&pageSize=100',
      {
        token: admin,
      },
    );
    expect(all.body.items.map((a) => a.id)).toEqual(
      expect.arrayContaining([early.body.id, late.body.id]),
    );
  });
});

describe('contratos', () => {
  let t: TestApp;
  let admin: string;
  let exec1: string;

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
    exec1 = (await t.login('exec1')).token;
  });
  afterAll(() => t.close());

  const create = (token: string, body: Record<string, unknown>) =>
    t.api<ContractDto>('POST', '/contracts', { token, body });
  const setStatus = (id: number, to: string, token = admin) =>
    t.api<ContractDto>('POST', `/contracts/${id}/status`, { token, body: { to } });

  /** Empresa lista para contrato: CON_RESPUESTA → cita agendada (AGENDANDO_CITA). */
  async function companyReadyForContract() {
    const c = await companyWithResponse(t, admin);
    const appt = await t.api('POST', '/appointments', {
      token: admin,
      body: { companyId: c.id, scheduledAt: inDays(2), mode: 'VIRTUAL' },
    });
    expect(appt.status).toBe(201);
    return c;
  }

  test('ciclo completo: BORRADOR → ENVIADO → FIRMADO → ACTIVO lleva la empresa a CONTRATO_ACTIVO', async () => {
    const c = await companyReadyForContract();
    const created = await create(admin, {
      companyId: c.id,
      startDate: ymd(1),
      endDate: ymd(365),
      amount: '1500.5',
      currency: 'USD',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'BORRADOR', amount: '1500.50', currency: 'USD' });
    expect(created.body.code).toMatch(/^CT-\d{4}-\d{6}$/);
    expect((await pipelineState(t, admin, c.id)).status).toBe('EN_PROCESO_CONTRATO');

    expect((await setStatus(created.body.id, 'ENVIADO')).body.status).toBe('ENVIADO');
    expect((await setStatus(created.body.id, 'FIRMADO')).body.status).toBe('FIRMADO');
    expect((await pipelineState(t, admin, c.id)).status).toBe('EN_PROCESO_CONTRATO');
    expect((await setStatus(created.body.id, 'ACTIVO')).body.status).toBe('ACTIVO');
    expect((await pipelineState(t, admin, c.id)).status).toBe('CONTRATO_ACTIVO');
  });

  test('no se puede crear contrato desde CON_RESPUESTA (422) ni se crea nada', async () => {
    const c = await companyWithResponse(t, admin);
    const res = await create(admin, { companyId: c.id, startDate: ymd(1), amount: '100' });
    expectError(res, 422, 'CONTRACT_COMPANY_NOT_READY');
    expect(await t.prisma.client.contract.count({ where: { companyId: c.id } })).toBe(0);
    expect((await pipelineState(t, admin, c.id)).status).toBe('CON_RESPUESTA');
  });

  test('solo BORRADOR es editable; transiciones inválidas → 422; datos inválidos → 400', async () => {
    const c = await companyReadyForContract();
    const created = await create(admin, { companyId: c.id, startDate: ymd(1), amount: '200.00' });
    const edited = await t.api<ContractDto>('PATCH', `/contracts/${created.body.id}`, {
      token: admin,
      body: { amount: '250', notes: 'Ajuste' },
    });
    expect(edited.body).toMatchObject({ amount: '250.00', notes: 'Ajuste' });

    expectError(await setStatus(created.body.id, 'ACTIVO'), 422); // BORRADOR no salta a ACTIVO
    await setStatus(created.body.id, 'ENVIADO');
    expectError(
      await t.api('PATCH', `/contracts/${created.body.id}`, {
        token: admin,
        body: { amount: '1' },
      }),
      422,
      'CONTRACT_NOT_DRAFT',
    );

    expectError(
      await create(admin, { companyId: c.id, startDate: ymd(5), endDate: ymd(1), amount: '1' }),
      400,
    );
    expectError(await create(admin, { companyId: c.id, startDate: ymd(1), amount: '12,5' }), 400);
    expectError(
      await create(admin, { companyId: c.id, startDate: ymd(1), amount: '1', currency: 'EUR' }),
      400,
    );
  });

  test('un contrato ACTIVO con fecha fin pasada se presenta como VENCIDO', async () => {
    const c = await companyReadyForContract();
    const created = await create(admin, {
      companyId: c.id,
      startDate: ymd(-30),
      endDate: ymd(60),
      amount: '10',
    });
    await setStatus(created.body.id, 'ENVIADO');
    await setStatus(created.body.id, 'FIRMADO');
    await setStatus(created.body.id, 'ACTIVO');
    // Se simula el paso del tiempo moviendo la fecha fin al pasado directamente en la BD de pruebas
    await t.prisma.client
      .$executeRaw`UPDATE contracts SET endDate = ${new Date(Date.now() - 5 * 86_400_000)} WHERE id = ${created.body.id}`;
    const got = await t.api<ContractDto>('GET', `/contracts/${created.body.id}`, { token: admin });
    expect(got.body.status).toBe('VENCIDO');
    const vencidos = await t.api<Paginated<ContractDto>>(
      'GET',
      '/contracts?status=VENCIDO&pageSize=100',
      { token: admin },
    );
    expect(vencidos.body.items.map((x) => x.id)).toContain(created.body.id);
    const activos = await t.api<Paginated<ContractDto>>(
      'GET',
      '/contracts?status=ACTIVO&pageSize=100',
      { token: admin },
    );
    expect(activos.body.items.map((x) => x.id)).not.toContain(created.body.id);
  });

  test('un EJECUTIVO solo ve y gestiona sus contratos', async () => {
    const c = await companyReadyForContract();
    const created = await create(admin, { companyId: c.id, startDate: ymd(1), amount: '5' });
    expectError(await t.api('GET', `/contracts/${created.body.id}`, { token: exec1 }), 403);
    const mine = await t.api<Paginated<ContractDto>>('GET', '/contracts?pageSize=100', {
      token: exec1,
    });
    expect(mine.body.items.map((x) => x.id)).not.toContain(created.body.id);
  });
});

describe('eventos y transacciones anidadas', () => {
  let t: TestApp;
  let adminId: number;

  beforeAll(async () => {
    t = await bootApp();
    adminId = (await t.login('admin')).user.id;
  });
  afterAll(() => t.close());

  const STATUS_EVENT = 'pipeline.company-status-changed';

  function recordEvents() {
    const emitter = t.app.get(EventEmitter2, { strict: false });
    const seen: unknown[] = [];
    const listener = (event: unknown) => seen.push(event);
    emitter.on(STATUS_EVENT, listener);
    return { seen, stop: () => emitter.off(STATUS_EVENT, listener) };
  }

  test('regresión afterCommit: si la transacción exterior hace rollback NO se publican los eventos del pipeline', async () => {
    const c = await createCompany(t, (await t.login('admin')).token);
    const uow = t.app.get<UnitOfWork>(UNIT_OF_WORK, { strict: false });
    const changeStatus = t.app.get(ChangeCompanyStatusUseCase, { strict: false });
    const rec = recordEvents();
    try {
      await expect(
        uow.run(async () => {
          // caso de uso anidado: confirma "dentro" de la transacción exterior…
          await changeStatus.execute({
            companyId: c.id,
            to: 'CONTACTADO',
            actor: { userId: adminId, role: 'ADMIN' },
          });
          // …y luego la exterior falla
          throw new Error('rollback deliberado');
        }),
      ).rejects.toThrow('rollback deliberado');
    } finally {
      rec.stop();
    }
    expect(rec.seen).toHaveLength(0);
    const row = await t.prisma.client.company.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.status).toBe('POR_CONTACTAR');
    expect(await t.prisma.client.statusHistory.count({ where: { companyId: c.id } })).toBe(0);
  });

  test('si la transacción exterior confirma, el evento se publica una vez, después del commit', async () => {
    const c = await createCompany(t, (await t.login('admin')).token);
    const uow = t.app.get<UnitOfWork>(UNIT_OF_WORK, { strict: false });
    const changeStatus = t.app.get(ChangeCompanyStatusUseCase, { strict: false });
    const rec = recordEvents();
    let seenInsideTransaction = -1;
    try {
      await uow.run(async () => {
        await changeStatus.execute({
          companyId: c.id,
          to: 'CONTACTADO',
          actor: { userId: adminId, role: 'ADMIN' },
        });
        seenInsideTransaction = rec.seen.length;
      });
    } finally {
      rec.stop();
    }
    expect(seenInsideTransaction).toBe(0); // diferido hasta confirmar
    expect(rec.seen).toHaveLength(1);
    expect((await pipelineState(t, (await t.login('admin')).token, c.id)).status).toBe(
      'CONTACTADO',
    );
  });

  test('flujo real: una cita rechazada por la política de acceso no deja eventos ni cambios', async () => {
    const admin = (await t.login('admin')).token;
    const exec = (await t.login('exec1')).token;
    const c = await createCompany(t, admin);
    await interact(t, admin, c.id, { outcome: 'INTERESADO' });
    const rec = recordEvents();
    try {
      const res = await t.api('POST', '/appointments', {
        token: exec,
        body: { companyId: c.id, scheduledAt: inDays(2), mode: 'VIRTUAL' },
      });
      expectError(res, 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');
    } finally {
      rec.stop();
    }
    expect(rec.seen).toHaveLength(0);
  });
});

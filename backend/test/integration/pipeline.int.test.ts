import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Paginated, PipelineStateDto, TimelineEntryDto } from '@axiom/contracts';
import { bootApp, expectError, type TestApp } from '../support/app';
import { board, createCompany, interact, pipelineState } from '../support/factories';

describe('pipeline', () => {
  let t: TestApp;
  let admin: string;
  let supervisor: string;

  beforeAll(async () => {
    t = await bootApp();
    admin = (await t.login('admin')).token;
    supervisor = (await t.login('supervisor')).token;
  });
  afterAll(() => t.close());

  const changeStatus = (id: number, body: Record<string, unknown>, token = admin) =>
    t.api<PipelineStateDto>('POST', `/pipeline/companies/${id}/status`, { token, body });

  test('resultado NO_CONTESTO desde POR_CONTACTAR: CONTACTADO y luego SIN_RESPUESTA automáticos', async () => {
    const c = await createCompany(t, admin);
    const res = await interact(t, admin, c.id, { outcome: 'NO_CONTESTO' });
    expect(res.status).toBe(201);
    expect(res.body.transitions).toEqual([
      { from: 'POR_CONTACTAR', to: 'CONTACTADO' },
      { from: 'CONTACTADO', to: 'SIN_RESPUESTA' },
    ]);
    expect(res.body.state.status).toBe('SIN_RESPUESTA');
    expect(res.body.state.lastContactAt).not.toBeNull();
  });

  test('INTERESADO desde POR_CONTACTAR llega a CON_RESPUESTA; reintento desde SIN_RESPUESTA vuelve a CONTACTADO', async () => {
    const a = await createCompany(t, admin);
    const ra = await interact(t, admin, a.id, { outcome: 'INTERESADO' });
    expect(ra.body.state.status).toBe('CON_RESPUESTA');

    const b = await createCompany(t, admin);
    await interact(t, admin, b.id, { outcome: 'NUMERO_EQUIVOCADO' });
    const retry = await interact(t, admin, b.id, { outcome: 'CONTESTO' });
    expect(retry.body.transitions.map((x) => x.to)).toEqual(['CONTACTADO', 'CON_RESPUESTA']);
  });

  test('NO_INTERESADO registra la interacción sin mover el estado (CON_RESPUESTA)', async () => {
    const c = await createCompany(t, admin);
    await interact(t, admin, c.id, { outcome: 'CONTESTO' });
    const res = await interact(t, admin, c.id, { outcome: 'NO_INTERESADO', notes: 'No por ahora' });
    expect(res.body.transitions).toEqual([]);
    expect(res.body.state.status).toBe('CON_RESPUESTA');
  });

  test('targetStatus se aplica tras las transiciones automáticas', async () => {
    const c = await createCompany(t, admin);
    const res = await interact(t, admin, c.id, {
      outcome: 'INTERESADO',
      targetStatus: 'AGENDANDO_CITA',
    });
    expect(res.body.transitions.map((x) => x.to)).toEqual([
      'CONTACTADO',
      'CON_RESPUESTA',
      'AGENDANDO_CITA',
    ]);
  });

  test('transición no permitida → 422 PIPELINE_INVALID_TRANSITION con from/to/allowed', async () => {
    const c = await createCompany(t, admin);
    const res = await changeStatus(c.id, { to: 'CONTRATO_ACTIVO' });
    expectError(res, 422, 'PIPELINE_INVALID_TRANSITION');
    const details = (
      res.body as unknown as { details: { from: string; to: string; allowed: string[] } }
    ).details;
    expect(details.from).toBe('POR_CONTACTAR');
    expect(details.to).toBe('CONTRATO_ACTIVO');
    expect(details.allowed).toContain('CONTACTADO');
  });

  test('allowedNextStatuses lo decide el backend', async () => {
    const c = await createCompany(t, admin);
    const state = await pipelineState(t, admin, c.id);
    expect(state.status).toBe('POR_CONTACTAR');
    expect([...state.allowedNextStatuses].sort()).toEqual(['CONTACTADO', 'DESCARTADO']);
  });

  test('DESCARTADO exige nota (400) y con nota funciona; reactivar: SUPERVISOR sí', async () => {
    const c = await createCompany(t, admin);
    expectError(await changeStatus(c.id, { to: 'DESCARTADO' }), 400, 'PIPELINE_NOTE_REQUIRED');
    const ok = await changeStatus(c.id, { to: 'DESCARTADO', note: 'Cerró operaciones' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('DESCARTADO');

    const back = await changeStatus(c.id, { to: 'POR_CONTACTAR' }, supervisor);
    expect(back.status).toBe(200);
    expect(back.body.status).toBe('POR_CONTACTAR');
  });

  test('un EJECUTIVO sin cartera no puede operar la empresa → 403 PORTFOLIO_COMPANY_NOT_ASSIGNED', async () => {
    const c = await createCompany(t, admin);
    const exec = (await t.login('exec1')).token;
    expectError(
      await changeStatus(c.id, { to: 'CONTACTADO' }, exec),
      403,
      'PORTFOLIO_COMPANY_NOT_ASSIGNED',
    );
    expectError(await interact(t, exec, c.id), 403, 'PORTFOLIO_COMPANY_NOT_ASSIGNED');
  });

  test('bloqueo optimista: expectedVersion obsoleta → 409 PIPELINE_VERSION_MISMATCH', async () => {
    const c = await createCompany(t, admin);
    const v0 = (await pipelineState(t, admin, c.id)).version;
    const first = await changeStatus(c.id, { to: 'CONTACTADO', expectedVersion: v0 });
    expect(first.status).toBe(200);
    expect(first.body.version).toBeGreaterThan(v0);

    // Segundo cliente con la versión vieja
    const stale = await changeStatus(c.id, { to: 'CON_RESPUESTA', expectedVersion: v0 });
    expectError(stale, 409, 'PIPELINE_VERSION_MISMATCH');
    expect((await pipelineState(t, admin, c.id)).status).toBe('CONTACTADO');

    // Con la versión vigente sí pasa
    const fresh = await changeStatus(c.id, {
      to: 'CON_RESPUESTA',
      expectedVersion: first.body.version,
    });
    expect(fresh.status).toBe(200);
  });

  test('dos cambios simultáneos con la misma versión: solo uno gana (el otro 409)', async () => {
    const c = await createCompany(t, admin);
    const v = (await pipelineState(t, admin, c.id)).version;
    const [a, b] = await Promise.all([
      changeStatus(c.id, { to: 'CONTACTADO', expectedVersion: v }),
      changeStatus(c.id, { to: 'DESCARTADO', note: 'Carrera', expectedVersion: v }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  test('timeline: más reciente primero, mezcla interacciones y cambios de estado, con paginación', async () => {
    const c = await createCompany(t, admin);
    await interact(t, admin, c.id, { outcome: 'NO_CONTESTO', notes: 'Primer intento' });
    await interact(t, admin, c.id, { outcome: 'CONTESTO', notes: 'Segundo intento' });
    await changeStatus(c.id, { to: 'AGENDANDO_CITA' });

    const res = await t.api<Paginated<TimelineEntryDto>>(
      'GET',
      `/pipeline/companies/${c.id}/timeline?pageSize=50`,
      {
        token: admin,
      },
    );
    expect(res.status).toBe(200);
    const items = res.body.items;
    const times = items.map((e) => new Date(e.occurredAt).getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));

    expect(items[0]).toMatchObject({ type: 'STATUS_CHANGE', toStatus: 'AGENDANDO_CITA' });
    const noted = items
      .filter((e) => e.type === 'INTERACTION')
      .map((e) => (e.type === 'INTERACTION' ? e.notes : null));
    expect(noted).toEqual(['Segundo intento', 'Primer intento']);
    expect(items.filter((e) => e.type === 'STATUS_CHANGE').length).toBeGreaterThanOrEqual(4);

    const page = await t.api<Paginated<TimelineEntryDto>>(
      'GET',
      `/pipeline/companies/${c.id}/timeline?pageSize=2&page=1`,
      {
        token: admin,
      },
    );
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBe(res.body.total);
  });

  test('el tablero cuenta lo mismo que el listado de empresas por estado', async () => {
    const b = await board(t, admin, 1);
    for (const col of b.columns) {
      const list = await t.api<Paginated<unknown>>(
        'GET',
        `/companies?status=${col.status}&pageSize=1`,
        { token: admin },
      );
      expect(col.count).toBe(list.body.total);
    }
    expect(b.columns.reduce((n, c) => n + c.count, 0)).toBeGreaterThanOrEqual(300);
  });

  test('validación: canal/resultado inválidos → 400; empresa inexistente → 404', async () => {
    const c = await createCompany(t, admin);
    expectError(
      await t.api('POST', `/pipeline/companies/${c.id}/interactions`, {
        token: admin,
        body: { channel: 'PALOMA', outcome: 'CONTESTO' },
      }),
      400,
    );
    expectError(await interact(t, admin, 99999999), 404, 'PIPELINE_COMPANY_NOT_FOUND');
  });
});

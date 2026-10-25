import { afterEach, describe, expect, test } from 'bun:test';
import type {
  CurrentCycleDto,
  ExecutiveCoverageDto,
  MyWeekDto,
  MyWeekItemDto,
  RunWeeklyResultDto,
  WeekInfoDto,
} from '@axiom/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';

let mocked: ReturnType<typeof mockFetch> | undefined;
afterEach(() => mocked?.restore());

const weekInfo: WeekInfoDto = {
  cycle: {
    id: 1,
    number: 4,
    startDate: '2026-10-19',
    endDate: '2026-11-08',
    totalWeeks: 3,
    closedAt: null,
  },
  weekNumber: 2,
  totalWeeks: 3,
  weekStart: '2026-10-26',
  weekEnd: '2026-11-01',
};

const item = (id: number, over: Partial<MyWeekItemDto> = {}): MyWeekItemDto => ({
  itemId: id,
  companyId: 100 + id,
  legalName: `Empresa ${id} S.A.`,
  tradeName: null,
  phone: `8888-000${id}`,
  status: 'POR_CONTACTAR',
  reason: 'NUEVA',
  priority: id,
  contactedAt: null,
  lastContactAt: null,
  nextFollowUpAt: null,
  ...over,
});

function weekDto(items: MyWeekItemDto[], over: Partial<MyWeekDto> = {}): MyWeekDto {
  return {
    userId: 1,
    week: weekInfo,
    planId: 9,
    generatedAt: '2026-10-26T12:00:00.000Z',
    quota: 4,
    contactedCount: items.filter((i) => i.contactedAt).length,
    totalItems: items.length,
    items,
    ...over,
  };
}

const exec = (userId: number, fullName: string): ExecutiveCoverageDto => ({
  userId,
  fullName,
  assigned: 60,
  target: 60,
  contactedThisCycle: 10,
  coveragePct: 17,
  plan: { planId: 90 + userId, items: 20, contacted: 5, quota: 20 },
});

const pipelineState = {
  companyId: 101,
  status: 'POR_CONTACTAR',
  version: 2,
  lastContactAt: null,
  allowedNextStatuses: ['CONTACTADO'],
};

describe('Mi semana', () => {
  test('muestra semana, progreso, motivos, teléfono clicable y enlace a la empresa', async () => {
    const dto = weekDto(
      [
        item(1, { reason: 'SEGUIMIENTO', nextFollowUpAt: '2026-10-27T15:00:00.000Z' }),
        item(2, { reason: 'REINTENTO', status: 'SIN_RESPUESTA' }),
        item(3, { reason: 'ROTACION', tradeName: 'Comercial Tres' }),
        item(4, { contactedAt: '2026-10-26T14:00:00.000Z', status: 'CONTACTADO' }),
      ],
      { quota: 20 },
    );
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/portfolio/my-week' ? jsonResponse(dto) : undefined,
    );
    await mountApp('/mi-semana', 'EJECUTIVO');

    expect(await screen.findByText(/Semana 2 de 3 · Ciclo #4/)).toBeTruthy();
    expect(screen.getByText('26 oct – 1 nov')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Progreso de la cuota semanal' });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('20');
    expect(screen.getByText(/Te\s+faltan/).textContent).toContain('19');
    expect(screen.getByTestId('week-header').getAttribute('data-reached')).toBe('false');

    // Motivos con su etiqueta propia (en la fila y en el resumen).
    const row1 = screen.getByTestId('plan-item-1');
    expect(row1.getAttribute('data-reason')).toBe('SEGUIMIENTO');
    expect(within(row1).getAllByText('Seguimiento').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('plan-item-2')).getByText('Reintento')).toBeTruthy();
    expect(within(screen.getByTestId('plan-item-3')).getByText('Rotación')).toBeTruthy();
    expect(within(screen.getByTestId('reason-summary')).getByText('Seguimiento: 1')).toBeTruthy();
    expect(within(screen.getByTestId('reason-summary')).getByText('Nueva: 1')).toBeTruthy();

    // Llamada con un toque y enlace a la ficha.
    const call = within(row1).getByRole('link', { name: /Llamar a Empresa 1 S\.A\./ });
    expect(call.getAttribute('href')).toBe('tel:8888-0001');
    const link = within(row1).getByRole('link', { name: 'Empresa 1 S.A.' });
    expect(link.getAttribute('href')).toBe('/empresas/101');

    // Por defecto solo pendientes: la contactada (4) no aparece hasta cambiar de pestaña.
    expect(screen.queryByTestId('plan-item-4')).toBeNull();
    expect(screen.getByRole('tab', { name: /Pendientes/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  test('pestañas Pendientes / Contactadas / Todas y búsqueda dentro del plan', async () => {
    const dto = weekDto([
      item(1),
      item(2, { tradeName: 'Ferretería Ñandú' }),
      item(3, { contactedAt: '2026-10-26T14:00:00.000Z', status: 'CONTACTADO' }),
    ]);
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/portfolio/my-week' ? jsonResponse(dto) : undefined,
    );
    await mountApp('/mi-semana', 'EJECUTIVO');
    const u = userEvent.setup();
    await screen.findByTestId('plan-item-1');

    expect(screen.getByRole('tab', { name: /Pendientes \(2\)/ })).toBeTruthy();
    await u.click(screen.getByRole('tab', { name: /Contactadas \(1\)/ }));
    expect(screen.getByTestId('plan-item-3').getAttribute('data-contacted')).toBe('true');
    expect(screen.queryByTestId('plan-item-1')).toBeNull();

    await u.click(screen.getByRole('tab', { name: /Todas \(3\)/ }));
    expect(screen.getAllByTestId(/plan-item-/)).toHaveLength(3);

    await u.type(screen.getByRole('searchbox', { name: 'Buscar en el plan' }), 'ferreteria nandu');
    expect(screen.getAllByTestId(/plan-item-/)).toHaveLength(1);
    expect(screen.getByTestId('plan-item-2')).toBeTruthy();

    await u.clear(screen.getByRole('searchbox', { name: 'Buscar en el plan' }));
    await u.type(screen.getByRole('searchbox', { name: 'Buscar en el plan' }), 'zzzz');
    expect(await screen.findByText('Sin resultados')).toBeTruthy();
  });

  test('cuota alcanzada: estado de celebración; sin pendientes lo indica', async () => {
    const done = '2026-10-26T14:00:00.000Z';
    const dto = weekDto([1, 2, 3, 4].map((i) => item(i, { contactedAt: done })));
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/portfolio/my-week' ? jsonResponse(dto) : undefined,
    );
    await mountApp('/mi-semana', 'EJECUTIVO');
    expect(await screen.findByText(/¡Cuota semanal cumplida!/)).toBeTruthy();
    expect(screen.getByTestId('week-header').getAttribute('data-reached')).toBe('true');
    expect(
      screen
        .getByRole('progressbar', { name: 'Progreso de la cuota semanal' })
        .getAttribute('aria-valuenow'),
    ).toBe('4');
    expect(screen.getByText('¡No quedan pendientes!')).toBeTruthy();
  });

  test('sin ciclo activo: el ejecutivo ve la explicación y no el botón de rotación', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/portfolio/my-week'
        ? jsonResponse(weekDto([], { week: null, planId: null, totalItems: 0, quota: 20 }))
        : undefined,
    );
    await mountApp('/mi-semana', 'EJECUTIVO');
    expect(await screen.findByText('Aún no hay un ciclo activo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ejecutar rotación semanal/ })).toBeNull();
  });

  test('sin ciclo activo: ADMIN ejecuta la rotación con confirmación y ve el resumen', async () => {
    const result: RunWeeklyResultDto = {
      closedCycle: null,
      openedCycle: 1,
      week: weekInfo,
      refill: { executives: 3, assigned: 180, shortfall: 0 },
      plans: { generated: 3, existing: 0, items: 60 },
    };
    mocked = mockFetch(({ url, method }) => {
      if (url.pathname === '/api/portfolio/my-week') {
        return jsonResponse(weekDto([], { week: null, planId: null, totalItems: 0 }));
      }
      if (url.pathname === '/api/portfolio/cycles/current') {
        return jsonResponse({ week: null, executives: [] } satisfies CurrentCycleDto);
      }
      if (url.pathname === '/api/portfolio/run-weekly' && method === 'POST') {
        return jsonResponse(result);
      }
      return undefined;
    });
    await mountApp('/mi-semana', 'ADMIN');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /Ejecutar rotación semanal/ }));
    const dialog = await screen.findByRole('dialog');
    // Confirmación: aún no se llamó al API.
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);
    await u.click(within(dialog).getByRole('button', { name: 'Ejecutar ahora' }));
    const summary = await within(dialog).findByTestId('run-weekly-result');
    expect(summary.textContent).toContain('Ciclo #1 abierto');
    expect(summary.textContent).toContain('180 empresas asignadas a 3 ejecutivos');
    expect(summary.textContent).toContain('3 generados');
    expect(mocked.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  test('plan aún no generado', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/portfolio/my-week'
        ? jsonResponse(weekDto([], { planId: null, generatedAt: null, totalItems: 0 }))
        : undefined,
    );
    await mountApp('/mi-semana', 'EJECUTIVO');
    expect(await screen.findByText('Tu plan semanal aún no se generó')).toBeTruthy();
    expect(screen.getByText(/Semana 2 de 3/)).toBeTruthy();
  });

  test('error de carga con reintento', async () => {
    let fail = true;
    mocked = mockFetch(({ url }) => {
      if (url.pathname !== '/api/portfolio/my-week') return undefined;
      return fail
        ? jsonResponse({ statusCode: 500, code: 'BOOM', message: 'Falla del servidor' }, 500)
        : jsonResponse(weekDto([item(1)]));
    });
    await mountApp('/mi-semana', 'EJECUTIVO');
    expect(await screen.findByText('Falla del servidor', {}, { timeout: 4000 })).toBeTruthy();
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('plan-item-1')).toBeTruthy();
  });

  test('registrar contacto envía planItemId, muestra transiciones y refresca el progreso', async () => {
    let registered = false;
    const pending = [item(1), item(2)];
    mocked = mockFetch(({ url, method }) => {
      if (url.pathname === '/api/portfolio/my-week') {
        return jsonResponse(
          registered
            ? weekDto([
                item(1, { contactedAt: '2026-10-26T16:00:00.000Z', status: 'CONTACTADO' }),
                item(2),
              ])
            : weekDto(pending),
        );
      }
      if (url.pathname === '/api/pipeline/companies/101' && method === 'GET') {
        return jsonResponse(pipelineState);
      }
      if (url.pathname === '/api/pipeline/companies/101/interactions' && method === 'POST') {
        registered = true;
        return jsonResponse(
          {
            state: { ...pipelineState, status: 'CONTACTADO', version: 3 },
            transitions: [{ from: 'POR_CONTACTAR', to: 'CONTACTADO' }],
          },
          201,
        );
      }
      return undefined;
    });
    await mountApp('/mi-semana', 'EJECUTIVO');
    const u = userEvent.setup();
    expect(screen.queryByRole('progressbar', { name: 'Progreso de la cuota semanal' })).toBeNull();
    await u.click(
      await screen.findByRole('button', { name: 'Registrar contacto con Empresa 1 S.A.' }),
    );
    const dialog = await screen.findByRole('dialog');
    await u.selectOptions(await within(dialog).findByLabelText('Resultado'), 'CONTESTO');
    await u.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    // Transiciones aplicadas dentro del diálogo.
    const result = await within(dialog).findByTestId('contact-result');
    expect(result.textContent).toContain('Por contactar');
    expect(result.textContent).toContain('Contactado');

    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({ outcome: 'CONTESTO', planItemId: 1, expectedVersion: 2 });

    // Mi semana se vuelve a pedir y el progreso sube a 1/4.
    await waitFor(() =>
      expect(
        screen
          .getByRole('progressbar', { name: 'Progreso de la cuota semanal', hidden: true })
          .getAttribute('aria-valuenow'),
      ).toBe('1'),
    );
    await u.click(within(dialog).getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // La empresa contactada salió de "Pendientes".
    expect(screen.queryByTestId('plan-item-1')).toBeNull();
    expect(screen.getByTestId('plan-item-2')).toBeTruthy();
    const weekCalls = mocked.calls.filter((c) => c.url.pathname === '/api/portfolio/my-week');
    expect(weekCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('un ejecutivo no pide ejecutivos ni envía ?userId= aunque venga en la URL', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/portfolio/my-week' ? jsonResponse(weekDto([item(1)])) : undefined,
    );
    await mountApp('/mi-semana?userId=7', 'EJECUTIVO');
    await screen.findByTestId('plan-item-1');
    expect(screen.queryByLabelText('Ejecutivo')).toBeNull();
    expect(mocked.calls.some((c) => c.url.pathname === '/api/portfolio/cycles/current')).toBe(
      false,
    );
    const weekCall = mocked.calls.find((c) => c.url.pathname === '/api/portfolio/my-week');
    expect(weekCall?.url.searchParams.has('userId')).toBe(false);
  });

  test('supervisor: selector de ejecutivos sincronizado con ?userId= de la URL', async () => {
    const executives = [exec(2, 'Ana Ejecutiva'), exec(3, 'Bruno Ejecutivo')];
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/portfolio/cycles/current') {
        return jsonResponse({ week: weekInfo, executives } satisfies CurrentCycleDto);
      }
      if (url.pathname === '/api/portfolio/my-week') {
        const id = Number(url.searchParams.get('userId'));
        return jsonResponse(
          weekDto([item(id * 10, { legalName: `Cliente de ${id}` })], { userId: id }),
        );
      }
      return undefined;
    });
    const router = await mountApp('/mi-semana', 'SUPERVISOR');
    const u = userEvent.setup();
    const select = (await screen.findByLabelText('Ejecutivo')) as HTMLSelectElement;
    // Sin ?userId= se abre el primer ejecutivo.
    expect(await screen.findByText('Cliente de 2')).toBeTruthy();
    expect(select.value).toBe('2');

    await u.selectOptions(select, '3');
    await waitFor(() =>
      expect(router.state.location.search as Record<string, unknown>).toEqual({ userId: 3 }),
    );
    expect(await screen.findByText('Cliente de 3')).toBeTruthy();
    expect(screen.queryByText('Cliente de 2')).toBeNull();
    expect(screen.getByText(/Bruno Ejecutivo · Semana 2 de 3/)).toBeTruthy();
    const last = mocked.calls.filter((c) => c.url.pathname === '/api/portfolio/my-week').at(-1);
    expect(last?.url.searchParams.get('userId')).toBe('3');
  });

  test('supervisor: ?userId= en la URL elige al ejecutivo directamente', async () => {
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/portfolio/cycles/current') {
        return jsonResponse({
          week: weekInfo,
          executives: [exec(2, 'Ana Ejecutiva'), exec(3, 'Bruno Ejecutivo')],
        } satisfies CurrentCycleDto);
      }
      if (url.pathname === '/api/portfolio/my-week') {
        return jsonResponse(weekDto([item(1)], { userId: 3 }));
      }
      return undefined;
    });
    await mountApp('/mi-semana?userId=3', 'SUPERVISOR');
    const select = (await screen.findByLabelText('Ejecutivo')) as HTMLSelectElement;
    await screen.findByTestId('plan-item-1');
    expect(select.value).toBe('3');
    const calls = mocked.calls.filter((c) => c.url.pathname === '/api/portfolio/my-week');
    expect(calls.every((c) => c.url.searchParams.get('userId') === '3')).toBe(true);
  });
});

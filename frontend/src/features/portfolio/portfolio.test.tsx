import { afterEach, describe, expect, test } from 'bun:test';
import type {
  AssignmentChangeResultDto,
  AssignmentDto,
  CurrentCycleDto,
  ExecutiveCoverageDto,
  RunWeeklyResultDto,
  WeekInfoDto,
} from '@axiom/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp, type RecordedCall } from '@/test/helpers';

let mocked: ReturnType<typeof mockFetch> | undefined;
let noCycle = false;
let execList: ExecutiveCoverageDto[] | undefined;
afterEach(() => {
  mocked?.restore();
  noCycle = false;
  execList = undefined;
});

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

const exec = (
  userId: number,
  fullName: string,
  over: Partial<ExecutiveCoverageDto> = {},
): ExecutiveCoverageDto => ({
  userId,
  fullName,
  assigned: 60,
  target: 60,
  contactedThisCycle: 30,
  coveragePct: 50,
  plan: { planId: 90 + userId, items: 20, contacted: 5, quota: 20 },
  ...over,
});

const assignment = (id: number, over: Partial<AssignmentDto> = {}): AssignmentDto => ({
  id,
  companyId: 100 + id,
  legalName: `Empresa ${id} S.A.`,
  tradeName: null,
  phone: '8888-0000',
  status: 'CONTACTADO',
  employeeCount: 1200,
  lastContactAt: null,
  userId: 2,
  userName: 'Ana Ejecutiva',
  cycleId: 1,
  assignedAt: '2026-10-19T12:00:00.000Z',
  cyclesWithoutProgress: 0,
  ...over,
});

const executives = [exec(1, 'Ana Pérez'), exec(2, 'Ana Ejecutiva'), exec(3, 'Bruno Ejecutivo')];

let rows: AssignmentDto[];

function baseHandler(extra?: (call: RecordedCall) => Response | undefined) {
  return (call: RecordedCall) => {
    const { url } = call;
    if (url.pathname === '/api/portfolio/cycles/current') {
      return jsonResponse(
        noCycle
          ? { week: null, executives: [] }
          : ({ week: weekInfo, executives: execList ?? executives } satisfies CurrentCycleDto),
      );
    }
    if (url.pathname === '/api/portfolio/assignments' && call.method === 'GET') {
      return jsonResponse({ items: rows, page: 1, pageSize: 20, total: rows.length });
    }
    if (url.pathname === '/api/catalogs/sectors')
      return jsonResponse([{ id: 4, name: 'Comercio' }]);
    if (url.pathname === '/api/catalogs/activities') {
      return jsonResponse([{ id: 8, name: 'Venta de repuestos' }]);
    }
    return extra?.(call);
  };
}

/** Elige una opción de un selector con búsqueda (Combobox en un popover). */
async function pick(u: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, name: RegExp) {
  await u.click(trigger);
  await u.click(await screen.findByRole('option', { name }));
}

const posts = () => mocked?.calls.filter((c) => c.method === 'POST') ?? [];

describe('Cartera: lectura', () => {
  test('ciclo, cobertura por ejecutivo y asignaciones con las estancadas resaltadas', async () => {
    rows = [
      assignment(1),
      assignment(2, { cyclesWithoutProgress: 2, status: 'SIN_RESPUESTA' }),
      assignment(3, { cyclesWithoutProgress: 1 }),
    ];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');

    expect(await screen.findByText('Ciclo #4')).toBeTruthy();
    expect(screen.getByText('Semana 2 de 3')).toBeTruthy();
    expect(screen.getByText('19 oct – 8 nov')).toBeTruthy();

    const card = screen.getByTestId('exec-3');
    expect(within(card).getByText('Bruno Ejecutivo')).toBeTruthy();
    expect(within(card).getByText('30/60 · 50%')).toBeTruthy();
    expect(within(card).getByText('5/20 · 25%')).toBeTruthy();
    expect(within(card).getByRole('progressbar', { name: /Cobertura del ciclo/ })).toBeTruthy();

    expect((await screen.findAllByText('Empresa 2 S.A.')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('2 ciclos sin avance').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 ciclo sin avance').length).toBeGreaterThan(0);
    const link = screen.getAllByRole('link', { name: /Empresa 1 S\.A\./ })[0];
    expect(link?.getAttribute('href')).toBe('/empresas/101');
  });

  test('ADMIN ve todas las acciones; SUPERVISOR no ve la rotación semanal', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    await screen.findByText('Ciclo #4');
    expect(screen.getByRole('button', { name: /Asignación masiva/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ejecutar rotación semanal/ })).toBeTruthy();
    expect(
      screen.getAllByRole('button', { name: 'Liberar Empresa 1 S.A.' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('checkbox', { name: 'Seleccionar Empresa 1 S.A.' }).length).toBe(2);
  });

  test('SUPERVISOR: gestiona asignaciones pero no puede ejecutar la rotación', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'SUPERVISOR');
    await screen.findByText('Ciclo #4');
    expect(screen.getByRole('button', { name: /Asignación masiva/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ejecutar rotación semanal/ })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Liberar Empresa 1 S.A.' }).length,
    ).toBeGreaterThan(0);
  });

  test('EJECUTIVO: solo su fila y ninguna acción de administración', async () => {
    rows = [assignment(1, { userId: 1, userName: 'Ana Pérez' })];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'EJECUTIVO');
    await screen.findByText('Ciclo #4');
    expect(screen.getByTestId('exec-1')).toBeTruthy();
    expect(screen.queryByTestId('exec-2')).toBeNull();
    expect(screen.queryByTestId('exec-3')).toBeNull();
    expect(await screen.findAllByText('Empresa 1 S.A.')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Asignación masiva/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ejecutar rotación semanal/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Liberar/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText('Filtrar por ejecutivo')).toBeNull();
    const call = mocked.calls.find((c) => c.url.pathname === '/api/portfolio/assignments');
    expect(call?.url.searchParams.has('userId')).toBe(false);
  });

  test('filtrar por ejecutivo vuelve a pedir las asignaciones con userId', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await screen.findByText('Ciclo #4');
    await u.click(screen.getByRole('button', { name: 'Filtrar por ejecutivo' }));
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(3);
    await u.type(screen.getByRole('combobox', { name: 'Buscar ejecutivo…' }), 'bruno');
    expect(within(listbox).getAllByRole('option')).toHaveLength(1);
    await u.click(screen.getByRole('option', { name: 'Bruno Ejecutivo' }));
    await waitFor(() =>
      expect(
        mocked?.calls.some(
          (c) =>
            c.url.pathname === '/api/portfolio/assignments' &&
            c.url.searchParams.get('userId') === '3',
        ),
      ).toBe(true),
    );
  });

  test('sin ciclo activo: ADMIN puede arrancar la rotación; los demás solo ven el aviso', async () => {
    rows = [];
    noCycle = true;
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    expect(await screen.findByText('Aún no hay un ciclo activo')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Ejecutar rotación semanal/ }).length).toBe(2);
  });
});

describe('Cartera: reasignar', () => {
  test('exige elegir destino, envía las empresas seleccionadas y resume el resultado', async () => {
    rows = [assignment(1), assignment(2), assignment(3)];
    const result: AssignmentChangeResultDto = {
      assigned: [101, 102],
      released: [1, 2],
      skipped: [103],
    };
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/assignments/reassign' && method === 'POST'
          ? jsonResponse(result)
          : undefined,
      ),
    );
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await screen.findAllByText('Empresa 1 S.A.');

    expect(screen.queryByRole('button', { name: /Reasignar a/ })).toBeNull();
    await u.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Empresa 1 S.A.' })[0] as HTMLElement,
    );
    await u.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Empresa 2 S.A.' })[0] as HTMLElement,
    );
    await u.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Empresa 3 S.A.' })[0] as HTMLElement,
    );
    // Se desmarca la 3: solo viajan 101 y 102.
    await u.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Empresa 3 S.A.' })[0] as HTMLElement,
    );
    expect(screen.getByText('2 seleccionadas')).toBeTruthy();

    await u.click(screen.getByRole('button', { name: /Reasignar a/ }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Reasignar' }));
    expect(await within(dialog).findByText('Selecciona el ejecutivo destino.')).toBeTruthy();
    expect(posts()).toHaveLength(0);

    await pick(u, within(dialog).getByLabelText('Ejecutivo destino'), /Bruno Ejecutivo/);
    await u.click(within(dialog).getByRole('button', { name: 'Reasignar' }));

    expect((await within(dialog).findByTestId('result-assigned')).textContent).toBe('2');
    expect(within(dialog).getByTestId('result-released').textContent).toBe('2');
    expect(within(dialog).getByTestId('result-skipped').textContent).toBe('1');
    expect(posts()[0]?.body).toEqual({ companyIds: [101, 102], toUserId: 3 });

    // La lista se refresca y la selección se limpia.
    const before = mocked.calls.filter(
      (c) => c.url.pathname === '/api/portfolio/assignments',
    ).length;
    await u.click(within(dialog).getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByText('2 seleccionadas')).toBeNull();
    expect(
      mocked.calls.filter((c) => c.url.pathname === '/api/portfolio/assignments').length,
    ).toBeGreaterThanOrEqual(Math.max(before, 2));
  });

  test('PORTFOLIO_TARGET_NOT_EXECUTIVE se muestra como aviso amable y el diálogo sigue abierto', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/assignments/reassign' && method === 'POST'
          ? jsonResponse(
              { statusCode: 422, code: 'PORTFOLIO_TARGET_NOT_EXECUTIVE', message: 'x' },
              422,
            )
          : undefined,
      ),
    );
    await mountApp('/cartera', 'SUPERVISOR');
    const u = userEvent.setup();
    await screen.findAllByText('Empresa 1 S.A.');
    await u.click(
      screen.getAllByRole('checkbox', { name: 'Seleccionar Empresa 1 S.A.' })[0] as HTMLElement,
    );
    await u.click(screen.getByRole('button', { name: /Reasignar a/ }));
    const dialog = await screen.findByRole('dialog');
    await pick(u, within(dialog).getByLabelText('Ejecutivo destino'), /Ana Ejecutiva/);
    await u.click(within(dialog).getByRole('button', { name: 'Reasignar' }));
    expect(await screen.findByText(/no es un ejecutivo activo/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('Cartera: liberar', () => {
  test('libera con motivo y resume', async () => {
    rows = [assignment(5)];
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/assignments/5/release' && method === 'POST'
          ? jsonResponse({
              assigned: [],
              released: [5],
              skipped: [],
            } satisfies AssignmentChangeResultDto)
          : undefined,
      ),
    );
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await u.click(
      (await screen.findAllByRole('button', { name: 'Liberar Empresa 5 S.A.' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/volverá al pool/)).toBeTruthy();
    await u.selectOptions(within(dialog).getByLabelText('Motivo'), 'SIN_AVANCE');
    await u.click(within(dialog).getByRole('button', { name: 'Liberar' }));
    expect((await within(dialog).findByTestId('result-released')).textContent).toBe('1');
    expect(posts()[0]?.body).toEqual({ reason: 'SIN_AVANCE' });
  });

  test('PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED: aviso amable, cierra y refresca', async () => {
    rows = [assignment(5)];
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/assignments/5/release' && method === 'POST'
          ? jsonResponse(
              { statusCode: 422, code: 'PORTFOLIO_ASSIGNMENT_ALREADY_RELEASED', message: 'x' },
              422,
            )
          : undefined,
      ),
    );
    await mountApp('/cartera', 'SUPERVISOR');
    const u = userEvent.setup();
    await u.click(
      (await screen.findAllByRole('button', { name: 'Liberar Empresa 5 S.A.' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Liberar' }));
    expect(await screen.findByText(/ya había sido liberada/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Cartera: asignación masiva y rotación', () => {
  test('valida, envía filtros + destino + límite y resume', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/assignments/bulk' && method === 'POST'
          ? jsonResponse({
              assigned: [11, 12, 13],
              released: [],
              skipped: [99],
            } satisfies AssignmentChangeResultDto)
          : undefined,
      ),
    );
    await mountApp('/cartera', 'SUPERVISOR');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /Asignación masiva/ }));
    const dialog = await screen.findByRole('dialog');

    await u.clear(within(dialog).getByLabelText('Cantidad máxima'));
    await u.type(within(dialog).getByLabelText('Cantidad máxima'), '900');
    await u.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    expect(await within(dialog).findByText('Indica una cantidad entre 1 y 500.')).toBeTruthy();
    expect(within(dialog).getByText('Selecciona el ejecutivo destino.')).toBeTruthy();
    expect(posts()).toHaveLength(0);

    await pick(u, within(dialog).getByLabelText('Ejecutivo destino'), /Bruno Ejecutivo/);
    await pick(u, within(dialog).getByLabelText('Sector (opcional)'), /Comercio/);
    await u.type(within(dialog).getByLabelText('Mínimo de empleados'), '50');
    await u.clear(within(dialog).getByLabelText('Cantidad máxima'));
    await u.type(within(dialog).getByLabelText('Cantidad máxima'), '25');
    await u.click(within(dialog).getByRole('button', { name: 'Asignar' }));

    expect((await within(dialog).findByTestId('result-assigned')).textContent).toBe('3');
    expect(within(dialog).getByTestId('result-skipped').textContent).toBe('1');
    expect(posts()[0]?.body).toEqual({
      toUserId: 3,
      limit: 25,
      filters: { sectorId: 4, minEmployees: 50 },
    });
  });

  test('PORTFOLIO_NO_ACTIVE_CYCLE en la asignación masiva se explica en español', async () => {
    rows = [];
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/assignments/bulk' && method === 'POST'
          ? jsonResponse({ statusCode: 422, code: 'PORTFOLIO_NO_ACTIVE_CYCLE', message: 'x' }, 422)
          : undefined,
      ),
    );
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /Asignación masiva/ }));
    const dialog = await screen.findByRole('dialog');
    await pick(u, within(dialog).getByLabelText('Ejecutivo destino'), /Ana Ejecutiva/);
    await u.click(within(dialog).getByRole('button', { name: 'Asignar' }));
    expect(await screen.findByText(/No hay un ciclo de rotación activo/)).toBeTruthy();
  });

  test('ADMIN: ejecutar rotación semanal pide confirmación y muestra el resumen', async () => {
    rows = [assignment(1)];
    const result: RunWeeklyResultDto = {
      closedCycle: {
        number: 3,
        evaluated: 100,
        withProgress: 40,
        withoutProgress: 60,
        released: 12,
      },
      openedCycle: 4,
      week: weekInfo,
      refill: { executives: 3, assigned: 36, shortfall: 4 },
      plans: { generated: 3, existing: 1, items: 61 },
    };
    mocked = mockFetch(
      baseHandler(({ url, method }) =>
        url.pathname === '/api/portfolio/run-weekly' && method === 'POST'
          ? jsonResponse(result)
          : undefined,
      ),
    );
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /Ejecutar rotación semanal/ }));
    const dialog = await screen.findByRole('dialog');
    expect(posts()).toHaveLength(0);
    await u.click(within(dialog).getByRole('button', { name: 'Ejecutar ahora' }));
    const summary = await within(dialog).findByTestId('run-weekly-result');
    expect(summary.textContent).toContain('Ciclo #3 cerrado: 100 evaluadas');
    expect(summary.textContent).toContain('12 liberadas');
    expect(summary.textContent).toContain('Ciclo #4 abierto');
    expect(summary.textContent).toContain('faltaron 4');
    expect(summary.textContent).toContain('3 generados, 1 ya existían');
    expect(posts()).toHaveLength(1);
  });
});

describe('Cartera: rediseño (ciclo, KPIs, búsqueda y paginación)', () => {
  test('tira de 21 días con las semanas rotuladas y KPIs derivados de la cobertura', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    await screen.findByText('Ciclo #4');
    expect(screen.getAllByTestId('cycle-day')).toHaveLength(21);
    for (const n of [1, 2, 3]) expect(screen.getByText(`Semana ${n}`)).toBeTruthy();

    // 3 ejecutivos × 60 asignadas, 30 contactadas cada uno.
    expect(screen.getByTestId('stat-assigned').textContent).toBe('180');
    expect(screen.getByTestId('stat-executives').textContent).toBe('3');
    expect(screen.getByTestId('stat-coverage').textContent).toBe('50%');
    expect(screen.getByTestId('stat-untouched').textContent).toBe('90');
  });

  test('EJECUTIVO: los KPIs no muestran el total de ejecutivos', async () => {
    rows = [assignment(1, { userId: 1, userName: 'Ana Pérez' })];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'EJECUTIVO');
    await screen.findByTestId('portfolio-stats');
    expect(screen.queryByTestId('stat-executives')).toBeNull();
    expect(screen.getByTestId('stat-assigned').textContent).toBe('60');
    expect(screen.getByText('Tu avance')).toBeTruthy();
  });

  test('muchos ejecutivos: buscador y paginación de las filas de rendimiento', async () => {
    rows = [assignment(1)];
    execList = Array.from({ length: 11 }, (_, i) => exec(i + 1, `Ejecutivo ${i + 1}`));
    execList.push(exec(50, 'Zoila Rendón'));
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await screen.findByText('Ciclo #4');
    expect(screen.getAllByTestId(/^exec-/)).toHaveLength(8);
    expect(screen.getByText('1–8 de 12 ejecutivos')).toBeTruthy();

    await u.click(screen.getAllByRole('button', { name: 'Página siguiente' })[0] as HTMLElement);
    expect(screen.getAllByTestId(/^exec-/)).toHaveLength(4);
    expect(screen.getByTestId('exec-50')).toBeTruthy();

    await u.type(screen.getByRole('searchbox', { name: 'Buscar ejecutivo…' }), 'zoila rendon');
    expect(screen.getAllByTestId(/^exec-/)).toHaveLength(1);
    expect(screen.getByTestId('exec-50')).toBeTruthy();

    await u.clear(screen.getByRole('searchbox', { name: 'Buscar ejecutivo…' }));
    await u.type(screen.getByRole('searchbox', { name: 'Buscar ejecutivo…' }), 'nadie');
    expect(screen.getByText('Ningún ejecutivo coincide')).toBeTruthy();
  });

  test('pocos ejecutivos: sin buscador ni paginación en el rendimiento', async () => {
    rows = [assignment(1)];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    await screen.findByText('Ciclo #4');
    expect(screen.queryByRole('searchbox', { name: 'Buscar ejecutivo…' })).toBeNull();
    expect(screen.queryByText(/de 3 ejecutivos/)).toBeNull();
  });

  test('asignaciones: filas por página vuelve a pedir con pageSize y la búsqueda filtra la página', async () => {
    rows = [
      assignment(1, { legalName: 'Distribuidora Ñandú S.A.' }),
      assignment(2),
      assignment(3, { tradeName: 'Ferretería Central' }),
    ];
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await screen.findAllByText('Empresa 2 S.A.');
    const first = mocked.calls.find((c) => c.url.pathname === '/api/portfolio/assignments');
    expect(first?.url.searchParams.get('pageSize')).toBe('25');
    expect(screen.getByText('1–3 de 3 empresas')).toBeTruthy();

    await u.selectOptions(screen.getByLabelText('Filas por página'), '50');
    await waitFor(() =>
      expect(
        mocked?.calls.some(
          (c) =>
            c.url.pathname === '/api/portfolio/assignments' &&
            c.url.searchParams.get('pageSize') === '50',
        ),
      ).toBe(true),
    );

    const search = screen.getByRole('searchbox', { name: 'Buscar en las empresas de esta página' });
    await u.type(search, 'nandu');
    expect(screen.getAllByText('Distribuidora Ñandú S.A.').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Empresa 2 S.A.')).toHaveLength(0);

    await u.clear(search);
    await u.type(search, 'ferreteria');
    expect(screen.getAllByText('Ferretería Central').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Distribuidora Ñandú S.A.')).toHaveLength(0);

    await u.clear(search);
    await u.type(search, 'zzzz');
    expect(screen.getByText('Ninguna empresa de esta página coincide')).toBeTruthy();
    await u.click(screen.getByText('Limpiar búsqueda'));
    expect(screen.getAllByText('Empresa 2 S.A.').length).toBeGreaterThan(0);
  });

  test('reasignar: la lista de empresas seleccionadas se pagina y se puede buscar', async () => {
    rows = Array.from({ length: 8 }, (_, i) => assignment(i + 1));
    mocked = mockFetch(baseHandler());
    await mountApp('/cartera', 'ADMIN');
    const u = userEvent.setup();
    await screen.findAllByText('Empresa 1 S.A.');
    await u.click(
      screen.getAllByRole('checkbox', {
        name: 'Seleccionar todas las de esta página',
      })[0] as HTMLElement,
    );
    expect(screen.getByText('8 seleccionadas')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: /Reasignar a/ }));
    const dialog = await screen.findByRole('dialog');
    const list = within(dialog).getByRole('list', { name: 'Empresas seleccionadas' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    await u.click(within(dialog).getByRole('button', { name: 'Página siguiente' }));
    expect(
      within(within(dialog).getByRole('list', { name: 'Empresas seleccionadas' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
    await u.type(
      within(dialog).getByRole('searchbox', { name: 'Buscar en empresas seleccionadas' }),
      'Empresa 7',
    );
    expect(
      within(within(dialog).getByRole('list', { name: 'Empresas seleccionadas' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1);
  });
});

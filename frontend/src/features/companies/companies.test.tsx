import { afterEach, describe, expect, test } from 'bun:test';
import type { CompanyDetail, CompanyListItem, Paginated } from '@axiom/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';
import { parseCompaniesSearch, toApiQueryString, toUrlSearch } from './search';

const item = (id: number, over: Partial<CompanyListItem> = {}): CompanyListItem => ({
  id,
  ruc: `J0310000000${id}`,
  legalName: `EMPRESA ${id} S.A.`,
  tradeName: id === 1 ? 'COMERCIAL UNO' : null,
  employeeCount: 10 * id,
  phone: '22223333',
  status: 'POR_CONTACTAR',
  sectorId: 1,
  sectorName: 'PRIVADA NACIONAL',
  activityId: 1,
  activityName: 'COMERCIO',
  lastContactAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const page = (items: CompanyListItem[], p = 1, total = 103_000): Paginated<CompanyListItem> => ({
  items,
  page: p,
  pageSize: 7,
  total,
});

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

const catalogs = (path: string) => {
  if (path === '/api/catalogs/sectors') return jsonResponse([{ id: 1, name: 'PRIVADA NACIONAL' }]);
  if (path === '/api/catalogs/activities') return jsonResponse([{ id: 7, name: 'AGRICULTURA' }]);
  return undefined;
};

describe('search params', () => {
  test('parsea tolerante y serializa solo lo no-default', () => {
    const s = parseCompaniesSearch({ q: 'abc', status: ['CONTACTADO'], page: '3', sortBy: 'nope' });
    expect(s).toMatchObject({ q: 'abc', status: ['CONTACTADO'], page: 3, sortBy: 'legalName' });
    expect(toUrlSearch(s)).toEqual({ q: 'abc', status: ['CONTACTADO'], page: 3 });
    const qs = new URLSearchParams(toApiQueryString(s));
    expect(qs.getAll('status')).toEqual(['CONTACTADO']);
    expect(qs.get('pageSize')).toBe('7');
  });

  test('pageSize: acepta solo los tamaños ofrecidos y viaja a la URL y al API', () => {
    expect(parseCompaniesSearch({ pageSize: '25' }).pageSize).toBe(7);
    const s = parseCompaniesSearch({ pageSize: '28' });
    expect(s.pageSize).toBe(28);
    expect(toUrlSearch(s)).toEqual({ pageSize: 28 });
    expect(new URLSearchParams(toApiQueryString(s)).get('pageSize')).toBe('28');
  });
});

describe('CompaniesPage', () => {
  test('muestra esqueleto, luego filas y paginación del servidor', async () => {
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/companies') {
        const p = Number(url.searchParams.get('page'));
        return jsonResponse(page([item(p === 2 ? 8 : 1), item(2)], p));
      }
      return catalogs(url.pathname);
    });
    await mountApp('/empresas');
    expect(await screen.findAllByText('EMPRESA 2 S.A.')).toBeTruthy();
    expect(screen.getAllByText('COMERCIAL UNO').length).toBeGreaterThan(0);
    expect(screen.getByText(/1–7 de 103\.?,?000|1–7 de/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect((await screen.findAllByText('EMPRESA 8 S.A.')).length).toBeGreaterThan(0);
    expect(mocked.calls.some((c) => c.url.searchParams.get('page') === '2')).toBe(true);
  });

  test('filas por página cambia el tamaño de la consulta y vuelve a la página 1', async () => {
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/companies') {
        const size = Number(url.searchParams.get('pageSize'));
        const p = Number(url.searchParams.get('page'));
        return jsonResponse({ ...page([item(1)], p), pageSize: size });
      }
      return catalogs(url.pathname);
    });
    const router = await mountApp('/empresas?page=3');
    await screen.findAllByText('EMPRESA 1 S.A.');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Filas por página'), '28');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ pageSize: 28 }));
    expect((router.state.location.search as { page?: number }).page).toBeUndefined();
    await waitFor(() =>
      expect(
        mocked.calls.some(
          (c) =>
            c.url.pathname === '/api/companies' &&
            c.url.searchParams.get('pageSize') === '28' &&
            c.url.searchParams.get('page') === '1',
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/1–28 de/)).toBeTruthy();
  });

  test('los filtros viven en la URL y la URL inicial se aplica a la consulta', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/companies' ? jsonResponse(page([item(1)])) : catalogs(url.pathname),
    );
    const router = await mountApp('/empresas?status=%5B%22CONTACTADO%22%5D&hasPhone=true&page=2');
    await screen.findAllByText('EMPRESA 1 S.A.');
    const first = mocked.calls.find((c) => c.url.pathname === '/api/companies');
    expect(first?.url.searchParams.getAll('status')).toEqual(['CONTACTADO']);
    expect(first?.url.searchParams.get('hasPhone')).toBe('true');
    expect(first?.url.searchParams.get('page')).toBe('2');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar empresas'), 'agro');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'agro' }), {
      timeout: 2000,
    });
    // Cambiar un filtro reinicia la página.
    expect((router.state.location.search as { page?: number }).page).toBeUndefined();
    await waitFor(() =>
      expect(
        mocked.calls.some(
          (c) => c.url.pathname === '/api/companies' && c.url.searchParams.get('q') === 'agro',
        ),
      ).toBe(true),
    );
  });

  test('ordenar por una columna actualiza la URL y la consulta', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/companies' ? jsonResponse(page([item(1)])) : catalogs(url.pathname),
    );
    const router = await mountApp('/empresas');
    await screen.findAllByText('EMPRESA 1 S.A.');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Empleados/i }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ sortBy: 'employeeCount' }),
    );
    expect(mocked.calls.some((c) => c.url.searchParams.get('sortBy') === 'employeeCount')).toBe(
      true,
    );
  });

  test('estado de error con reintento', async () => {
    let fail = true;
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/companies') {
        return fail
          ? jsonResponse({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Falla' }, 500)
          : jsonResponse(page([item(1)]));
      }
      return catalogs(url.pathname);
    });
    await mountApp('/empresas');
    const retry = await screen.findByRole('button', { name: 'Reintentar' }, { timeout: 4000 });
    fail = false;
    await userEvent.setup().click(retry);
    expect((await screen.findAllByText('EMPRESA 1 S.A.')).length).toBeGreaterThan(0);
  });

  test('fila clicable navega a la ficha', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/companies' ? jsonResponse(page([item(5)])) : catalogs(url.pathname),
    );
    const router = await mountApp('/empresas');
    await screen.findAllByText('EMPRESA 5 S.A.');
    await userEvent
      .setup()
      .click(
        screen.getAllByRole('button', { name: 'Abrir ficha de EMPRESA 5 S.A.' })[0] as HTMLElement,
      );
    await waitFor(() => expect(router.state.location.pathname).toBe('/empresas/5'));
  });
});

describe('Nueva empresa', () => {
  const open = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Nueva empresa/ }));
    return { user, dialog: await screen.findByRole('dialog') };
  };

  const base = (url: URL) =>
    url.pathname === '/api/companies' ? jsonResponse(page([item(1)])) : catalogs(url.pathname);

  test('valida campos obligatorios y normaliza el RUC en vivo', async () => {
    mocked = mockFetch(({ url }) => base(url));
    await mountApp('/empresas');
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText('RUC'), 'j031-000 12ab');
    expect((within(dialog).getByLabelText('RUC') as HTMLInputElement).value).toBe('J03100012AB');
    await user.click(within(dialog).getByRole('button', { name: 'Crear empresa' }));
    expect((await within(dialog).findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  test('409 COMPANY_RUC_DUPLICATED se muestra en el campo RUC', async () => {
    mocked = mockFetch(({ url, method }) =>
      method === 'POST'
        ? jsonResponse(
            { statusCode: 409, code: 'COMPANY_RUC_DUPLICATED', message: 'RUC duplicado' },
            409,
          )
        : base(url),
    );
    await mountApp('/empresas');
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText('RUC'), 'J0310000001');
    await user.type(within(dialog).getByLabelText('Razón social'), 'NUEVA SA');
    await user.click(within(dialog).getByRole('button', { name: 'Crear empresa' }));
    expect(await within(dialog).findByText('Ya existe una empresa con este RUC.')).toBeTruthy();
  });

  test('400 INVALID_INPUT se asigna a los campos', async () => {
    mocked = mockFetch(({ url, method }) =>
      method === 'POST'
        ? jsonResponse(
            {
              statusCode: 400,
              code: 'INVALID_INPUT',
              message: 'Datos de entrada inválidos',
              details: [{ path: ['phone'], message: 'El teléfono es inválido' }],
            },
            400,
          )
        : base(url),
    );
    await mountApp('/empresas');
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText('RUC'), 'J0310000001');
    await user.type(within(dialog).getByLabelText('Razón social'), 'NUEVA SA');
    await user.click(within(dialog).getByRole('button', { name: 'Crear empresa' }));
    expect(await within(dialog).findByText('El teléfono es inválido')).toBeTruthy();
  });

  test('éxito: envía el cuerpo normalizado y navega a la ficha', async () => {
    const created = {
      ...item(77, { legalName: 'NUEVA SA' }),
      legalRepName: null,
      shippingAddress: null,
      particularAddress: null,
      source: 'MANUAL',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      branches: [],
    } satisfies Omit<CompanyDetail, 'source'> & { source: string };
    mocked = mockFetch(({ url, method }) =>
      method === 'POST' ? jsonResponse(created, 201) : base(url),
    );
    const router = await mountApp('/empresas');
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText('RUC'), 'j 0310000001');
    await user.type(within(dialog).getByLabelText('Razón social'), 'NUEVA SA');
    await user.click(within(dialog).getByRole('button', { name: 'Crear empresa' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/empresas/77'));
    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      ruc: 'J0310000001',
      legalName: 'NUEVA SA',
      employeeCount: 0,
    });
  });
});

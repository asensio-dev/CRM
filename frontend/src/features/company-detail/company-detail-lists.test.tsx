import { afterEach, describe, expect, test } from 'bun:test';
import type { CompanyBranchDto, CompanyDetail, TimelineEntryDto } from '@axiom/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';

const branch = (id: number): CompanyBranchDto => ({
  id,
  tradeName: id === 12 ? 'SUCURSAL LEÓN' : `SUCURSAL ${id}`,
  address: `Calle ${id}`,
  phone: null,
  employeeCount: id,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const company: CompanyDetail = {
  id: 8,
  ruc: 'J0310000000008',
  legalName: 'EMPRESA OCHO S.A.',
  tradeName: 'OCHO',
  employeeCount: 80,
  phone: '22224444',
  status: 'CONTACTADO',
  sectorId: 1,
  sectorName: 'PRIVADA NACIONAL',
  activityId: 1,
  activityName: 'COMERCIO',
  lastContactAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  legalRepName: null,
  shippingAddress: null,
  particularAddress: null,
  source: 'MANUAL',
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  branches: Array.from({ length: 12 }, (_, i) => branch(i + 1)),
};

const entry = (id: number): TimelineEntryDto => ({
  type: 'STATUS_CHANGE',
  id,
  occurredAt: '2026-10-20T15:00:00Z',
  user: { id: 1, fullName: id === 11 ? 'Marta Ruiz' : 'Ana Pérez' },
  fromStatus: null,
  toStatus: 'CONTACTADO',
  note: `Nota ${id}`,
});

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

function mockApi() {
  mocked = mockFetch(({ url }) => {
    switch (url.pathname) {
      case '/api/companies/8':
        return jsonResponse(company);
      case '/api/pipeline/companies/8':
        return jsonResponse({
          companyId: 8,
          status: 'CONTACTADO',
          version: 1,
          lastContactAt: null,
          allowedNextStatuses: [],
        });
      case '/api/pipeline/companies/8/timeline': {
        const page = Number(url.searchParams.get('page'));
        const pageSize = Number(url.searchParams.get('pageSize'));
        const all = Array.from({ length: 23 }, (_, i) => entry(i + 1));
        return jsonResponse({
          items: all.slice((page - 1) * pageSize, page * pageSize),
          page,
          pageSize,
          total: all.length,
        });
      }
      default:
        return undefined;
    }
  });
}

describe('ficha de empresa: listas paginadas', () => {
  test('sucursales: paginación en cliente y búsqueda', async () => {
    mockApi();
    await mountApp('/empresas/8');
    const table = await screen.findByRole('table', { name: 'Sucursales' });
    expect(within(table).getByText('SUCURSAL 1')).toBeTruthy();
    expect(within(table).queryByText('SUCURSAL LEÓN')).toBeNull();
    expect(screen.getByText('1–7 de 12 sucursales')).toBeTruthy();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar sucursales'), 'leon');
    expect(within(table).getByText('SUCURSAL LEÓN')).toBeTruthy();
    expect(within(table).queryByText('SUCURSAL 1')).toBeNull();
    expect(screen.getByText('1–1 de 1 sucursales')).toBeTruthy();
  });

  test('historial: paginación del servidor con selector de filas', async () => {
    mockApi();
    await mountApp('/empresas/8');
    expect(await screen.findByText('Nota 1')).toBeTruthy();
    expect(screen.getByText('1–7 de 23 eventos')).toBeTruthy();
    const nav = screen.getByText('1–7 de 23 eventos').closest('nav') as HTMLElement;

    const user = userEvent.setup();
    await user.click(within(nav).getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Nota 11')).toBeTruthy();
    expect(
      mocked.calls.some(
        (c) =>
          c.url.pathname === '/api/pipeline/companies/8/timeline' &&
          c.url.searchParams.get('page') === '2',
      ),
    ).toBe(true);

    // El filtro de texto se aplica a la página cargada.
    await user.type(screen.getByLabelText('Filtrar historial'), 'marta');
    await waitFor(() => expect(screen.queryByText('Nota 12')).toBeNull());
    expect(screen.getByText('Nota 11')).toBeTruthy();

    await user.selectOptions(within(nav).getByLabelText('Filas por página'), '14');
    await waitFor(() =>
      expect(
        mocked.calls.some(
          (c) =>
            c.url.pathname === '/api/pipeline/companies/8/timeline' &&
            c.url.searchParams.get('pageSize') === '14' &&
            c.url.searchParams.get('page') === '1',
        ),
      ).toBe(true),
    );
  });
});

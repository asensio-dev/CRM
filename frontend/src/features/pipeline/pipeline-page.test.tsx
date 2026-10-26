import { beforeEach, describe, expect, test } from 'bun:test';
import {
  type BoardCardDto,
  type BoardDto,
  normalizeSearchText,
  type PipelineStateDto,
} from '@axiom/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAppRouter, createTestHistory } from '@/app/router';
import { useSessionStore } from '@/features/auth/session-store';
import { mockApi } from '@/test/mock-api';

const card = (id: number, legalName = `Empresa ${id}`): BoardCardDto => ({
  id,
  legalName,
  tradeName: null,
  phone: null,
  employeeCount: 5,
  lastContactAt: null,
});
const alfa: BoardCardDto = {
  id: 11,
  legalName: 'Alfa S.A.',
  tradeName: 'Alfa Comercial',
  phone: '22223333',
  employeeCount: 40,
  lastContactAt: null,
};
/** 1234 empresas por contactar: Alfa y luego "Empresa 1000", "Empresa 1001"… */
const porContactar = [alfa, ...Array.from({ length: 1233 }, (_, i) => card(1000 + i))];
const contactados = [card(21, 'Ñandú Café'), card(22, 'Óptica Central')];
const descartados = Array.from({ length: 7 }, (_, i) => card(31 + i));

/** Simula el API: filtra por `q` (sin tildes) y devuelve `limitPerColumn` tarjetas por columna. */
function boardFor(url: URL): BoardDto {
  const q = normalizeSearchText(url.searchParams.get('q') ?? '');
  const limit = Number(url.searchParams.get('limitPerColumn') ?? 20);
  const column = (status: BoardDto['columns'][number]['status'], cards: BoardCardDto[]) => {
    const hits = q ? cards.filter((c) => normalizeSearchText(c.legalName).includes(q)) : cards;
    return { status, count: hits.length, cards: hits.slice(0, limit) };
  };
  return {
    columns: [
      column('POR_CONTACTAR', porContactar),
      column('CONTACTADO', contactados),
      column('DESCARTADO', descartados),
    ],
  };
}

const state: PipelineStateDto = {
  companyId: 11,
  status: 'POR_CONTACTAR',
  version: 3,
  lastContactAt: null,
  allowedNextStatuses: ['CONTACTADO', 'DESCARTADO'],
};

async function mount(path = '/pipeline') {
  useSessionStore.setState({
    status: 'authenticated',
    user: { id: 1, email: 'ana@empresa.com', fullName: 'Ana Pérez', role: 'EJECUTIVO' },
  });
  const router = createAppRouter(createTestHistory(path));
  const { App } = await import('@/app/providers');
  render(<App router={router} />);
  return router;
}

function routes(extra: Parameters<typeof mockApi>[0] = {}) {
  return mockApi({
    'GET /api/pipeline/board': ({ url }) => boardFor(url),
    'GET /api/catalogs/sectors': () => [{ id: 4, name: 'Privada nacional' }],
    'GET /api/catalogs/activities': () => [{ id: 9, name: 'Comercio' }],
    'GET /api/pipeline/companies/11': () => state,
    ...extra,
  });
}

describe('PipelinePage', () => {
  beforeEach(() => {
    useSessionStore.setState({ status: 'anonymous', user: null });
  });

  test('muestra 8 columnas con su total y las tarjetas', async () => {
    routes();
    await mount();
    const col = await screen.findByRole('region', { name: /Por contactar, 1234 empresas/ });
    expect(within(col).getByText('Alfa S.A.')).toBeTruthy();
    expect(within(col).getByText('Alfa Comercial')).toBeTruthy();
    expect(within(col).getByRole('link', { name: '22223333' }).getAttribute('href')).toBe(
      'tel:22223333',
    );
    expect(document.querySelectorAll('section[data-status]')).toHaveLength(8);
    expect(screen.getByRole('region', { name: /Descartado, 7 empresas/ })).toBeTruthy();
    // 8 tarjetas por página; las columnas que caben en una página no muestran paginación
    expect(within(col).getAllByTestId(/^card-/)).toHaveLength(8);
    expect(within(col).getByText('1 / 13')).toBeTruthy();
    const contactado = screen.getByRole('region', { name: /Contactado, 2 empresas/ });
    expect(within(contactado).queryByRole('navigation', { name: 'Paginación' })).toBeNull();
  });

  test('cada columna pagina por separado y pide más tarjetas al llegar al final', async () => {
    const api = routes();
    const router = await mount();
    const col = await screen.findByRole('region', { name: /Por contactar, 1234 empresas/ });
    const user = userEvent.setup();

    await user.click(within(col).getByRole('button', { name: 'Página siguiente' }));
    expect(within(col).getByText('2 / 13')).toBeTruthy();
    expect(within(col).queryByText('Alfa S.A.')).toBeNull();
    expect(within(col).getByText('Empresa 1007')).toBeTruthy();
    expect(within(col).getAllByTestId(/^card-/)).toHaveLength(8);
    // con 20 tarjetas cargadas la página 2 no necesita otra consulta
    expect(router.state.location.search).not.toHaveProperty('limitPerColumn');

    // la página 3 (tarjetas 17–24) obliga a subir el límite a 40
    await user.click(within(col).getByRole('button', { name: 'Página siguiente' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ limitPerColumn: 40 }));
    await waitFor(() => expect(within(col).getAllByTestId(/^card-/)).toHaveLength(8));
    expect(within(col).getByText('Empresa 1015')).toBeTruthy();
    expect(
      api.calls.some(
        (c) =>
          c.key === 'GET /api/pipeline/board' && c.url.searchParams.get('limitPerColumn') === '40',
      ),
    ).toBe(true);
  });

  test('el buscador filtra todo el tablero y vuelve a la primera página', async () => {
    const api = routes();
    const router = await mount();
    const col = await screen.findByRole('region', { name: /Por contactar, 1234 empresas/ });
    const user = userEvent.setup();
    await user.click(within(col).getByRole('button', { name: 'Página siguiente' }));
    expect(within(col).getByText('2 / 13')).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: 'Buscar empresa' }), 'empresa 10');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ q: 'empresa 10' }));
    const filtered = await screen.findByRole('region', { name: /Por contactar, 100 empresas/ });
    // la página vuelve a 1 y la consulta lleva el texto (el API ignora tildes y mayúsculas)
    expect(within(filtered).getByText('1 / 13')).toBeTruthy();
    expect(within(filtered).getByText('Empresa 1000')).toBeTruthy();
    expect(
      api.calls.some(
        (c) => c.key === 'GET /api/pipeline/board' && c.url.searchParams.get('q') === 'empresa 10',
      ),
    ).toBe(true);
    const contactado = screen.getByRole('region', { name: /Contactado, 0 empresas/ });
    expect(within(contactado).getByText('Sin empresas')).toBeTruthy();
  });

  test('los filtros viajan a la URL y a la consulta', async () => {
    const api = routes();
    await mount('/pipeline?sectorId=4&q=alfa');
    await screen.findByText('Alfa S.A.');
    const first = api.calls.find((c) => c.key === 'GET /api/pipeline/board');
    expect(first?.url.searchParams.get('sectorId')).toBe('4');
    expect(first?.url.searchParams.get('q')).toBe('alfa');
  });

  test('"Mover a…" lista solo los estados permitidos y DESCARTADO exige nota', async () => {
    const api = routes({
      'POST /api/pipeline/companies/11/status': () => ({
        ...state,
        status: 'DESCARTADO',
        version: 4,
      }),
    });
    await mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Mover a… Alfa S.A./ }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Contactado', 'Descartado']);

    await user.click(items[1] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Mover a Descartado/ }));
    expect(await within(dialog).findByText('Escribe el motivo del cambio.')).toBeTruthy();
    expect(api.calls.some((c) => c.key.startsWith('POST'))).toBe(false);

    await user.type(within(dialog).getByLabelText('Motivo'), 'No le interesa');
    await user.click(within(dialog).getByRole('button', { name: /Mover a Descartado/ }));
    await waitFor(() => {
      const post = api.calls.find((c) => c.key === 'POST /api/pipeline/companies/11/status');
      expect(post?.body).toEqual({ to: 'DESCARTADO', note: 'No le interesa', expectedVersion: 3 });
    });
  });
});

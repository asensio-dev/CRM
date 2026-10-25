import { beforeEach, describe, expect, test } from 'bun:test';
import type { BoardDto, PipelineStateDto } from '@axiom/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAppRouter, createTestHistory } from '@/app/router';
import { useSessionStore } from '@/features/auth/session-store';
import { mockApi } from '@/test/mock-api';

const board: BoardDto = {
  columns: [
    {
      status: 'POR_CONTACTAR',
      count: 1234,
      cards: [
        {
          id: 11,
          legalName: 'Alfa S.A.',
          tradeName: 'Alfa Comercial',
          phone: '22223333',
          employeeCount: 40,
          lastContactAt: null,
        },
      ],
    },
    { status: 'CONTACTADO', count: 2, cards: [] },
    { status: 'DESCARTADO', count: 7, cards: [] },
  ],
};
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
    'GET /api/pipeline/board': () => board,
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
    expect(within(col).getByRole('button', { name: /Ver más/ })).toBeTruthy();
  });

  test('los filtros viajan a la URL y a la consulta', async () => {
    const api = routes();
    const router = await mount('/pipeline?sectorId=4&q=alfa');
    await screen.findByText('Alfa S.A.');
    const first = api.calls.find((c) => c.key === 'GET /api/pipeline/board');
    expect(first?.url.searchParams.get('sectorId')).toBe('4');
    expect(first?.url.searchParams.get('q')).toBe('alfa');

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /Ver más/ })[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ limitPerColumn: 40 }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (c) =>
            c.key === 'GET /api/pipeline/board' &&
            c.url.searchParams.get('limitPerColumn') === '40',
        ),
      ).toBe(true),
    );
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

import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  CycleCoverageDto,
  ExecutivesDto,
  FunnelDto,
  SummaryDto,
  WeeklyActivityDto,
} from '@axiom/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, type ReactElement } from 'react';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';

// Recharts mide el DOM con ResizeObserver: en happy-dom no hay tamaño, así que solo en tests
// se sustituye el contenedor responsivo por uno de tamaño fijo.
const actual = await import('recharts');
function FixedSizeContainer({ children }: { children: ReactElement }) {
  return (
    <div style={{ width: 600, height: 300 }}>
      {cloneElement(children, { width: 600, height: 300 } as never)}
    </div>
  );
}
mock.module('recharts', () => ({ ...actual, ResponsiveContainer: FixedSizeContainer }));

const { KpiTiles } = await import('./kpi-tiles');
const { FunnelCard } = await import('./funnel-card');
const { ExecutivesCard, sortExecutives } = await import('./executives-card');
const { formatPct, orderStages, barWidth } = await import('./format');
const { periodRange } = await import('./search');
const { pivotExecutives } = await import('./activity-cards');

const summary = (over: Partial<SummaryDto> = {}): SummaryDto => ({
  generatedAt: '2026-10-25T12:00:00.000Z',
  week: { start: '2026-10-19', end: '2026-10-25' },
  companies: { total: 127_197, inPipeline: 3_400 },
  contactsThisWeek: 45,
  weeklyQuota: { activeExecutives: 2, quotaPerExecutive: 20, target: 40, compliancePct: 112.5 },
  appointmentsThisWeek: 7,
  contractsActive: {
    count: 3,
    totalsByCurrency: [
      { currency: 'NIO', count: 2, totalAmount: 1_500_000.5 },
      { currency: 'USD', count: 1, totalAmount: 12_000 },
    ],
  },
  conversion: { contacted: 200, contracted: 5, ratePct: 2.5 },
  ...over,
});

const weekPoint = (weekStart: string, n: number) => ({
  weekStart,
  interactions: n,
  companiesContacted: n - 1,
  byOutcome: {
    CONTESTO: n,
    NO_CONTESTO: 0,
    NUMERO_EQUIVOCADO: 0,
    INTERESADO: 0,
    NO_INTERESADO: 0,
    VOLVER_A_LLAMAR: 0,
  },
});

const stage = (
  status: FunnelDto['stages'][number]['status'],
  reached: number,
  conv: number | null,
) => ({
  status,
  label: status,
  current: reached,
  reached,
  conversionPct: conv,
});

describe('formato', () => {
  test('porcentaje: >100 se muestra sin recortar, null como guion; la barra sí se recorta', () => {
    expect(formatPct(112.5)).toBe('112.5 %');
    expect(formatPct(0)).toBe('0 %');
    expect(formatPct(null)).toBe('—');
    expect(barWidth(112.5)).toBe(100);
    expect(barWidth(null)).toBe(0);
  });

  test('periodos: semana actual y 4/12 semanas desde el lunes (Managua)', () => {
    expect(periodRange({ period: 'week' }, '2026-10-25')).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
    });
    expect(periodRange({ period: '4w' }, '2026-10-25')).toEqual({
      from: '2026-09-28',
      to: '2026-10-25',
    });
    expect(periodRange({ period: '12w' }, '2026-01-04')).toEqual({
      from: '2025-10-13',
      to: '2026-01-04',
    });
    expect(
      periodRange({ period: 'custom', from: '2026-03-10', to: '2026-03-01' }, '2026-10-25'),
    ).toEqual({
      from: '2026-03-01',
      to: '2026-03-10',
    });
  });
});

describe('KpiTiles', () => {
  test('cumplimiento >100% con barra al tope y aviso, montos por moneda', () => {
    render(
      <KpiTiles
        summary={summary()}
        weeks={[weekPoint('2026-10-12', 30), weekPoint('2026-10-19', 45)]}
      />,
    );
    const compliance = screen.getByTestId('kpi-compliance');
    expect(within(compliance).getByText('112.5 %')).toBeTruthy();
    expect(within(compliance).getByText(/Meta superada/)).toBeTruthy();
    const bar = within(compliance).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');

    const contracts = screen.getByTestId('kpi-contracts');
    expect(contracts.textContent).toContain('C$ 1,500,000.50');
    expect(contracts.textContent).toContain('US$ 12,000.00');
    expect(screen.getByTestId('kpi-companies').textContent).toContain('127,197');
    expect(screen.getByTestId('kpi-conversion').textContent).toContain('2.5 %');
    expect(screen.getByTestId('kpi-contacts').textContent).toContain('+');
  });

  test('sin denominador: guion y sin barra llena', () => {
    render(
      <KpiTiles
        summary={summary({
          weeklyQuota: {
            activeExecutives: 0,
            quotaPerExecutive: 20,
            target: 0,
            compliancePct: null,
          },
          conversion: { contacted: 0, contracted: 0, ratePct: null },
          contractsActive: { count: 0, totalsByCurrency: [] },
        })}
      />,
    );
    expect(within(screen.getByTestId('kpi-compliance')).getByText('—')).toBeTruthy();
    expect(within(screen.getByTestId('kpi-compliance')).queryByText(/Meta superada/)).toBeNull();
    expect(screen.getByTestId('kpi-contracts').textContent).toContain('Sin montos');
  });
});

describe('FunnelCard', () => {
  const funnel: FunnelDto = {
    period: { from: null, to: null },
    stages: [
      stage('CONTRATO_ACTIVO', 5, 25),
      stage('POR_CONTACTAR', 1000, null),
      stage('CON_RESPUESTA', 80, 40),
      stage('CONTACTADO', 200, 20),
    ],
  };

  test('ordena las etapas como el pipeline y usa los colores de estado', () => {
    expect(orderStages(funnel.stages).map((s) => s.status)).toEqual([
      'POR_CONTACTAR',
      'CONTACTADO',
      'CON_RESPUESTA',
      'CONTRATO_ACTIVO',
    ]);
    const { container } = render(<FunnelCard funnel={funnel} />);
    const items = [...container.querySelectorAll('li[data-stage]')].map((li) =>
      li.getAttribute('data-stage'),
    );
    expect(items).toEqual(['POR_CONTACTAR', 'CONTACTADO', 'CON_RESPUESTA', 'CONTRATO_ACTIVO']);
    expect(container.querySelector('[data-bar="CONTACTADO"]')?.className).toContain('bg-sky-500');
    expect(container.querySelector('[data-bar="CONTRATO_ACTIVO"]')?.className).toContain(
      'bg-emerald-500',
    );
    expect(screen.getByText('40 % de la etapa previa')).toBeTruthy();
  });

  test('estado vacío si nadie alcanzó ninguna etapa', () => {
    render(
      <FunnelCard
        funnel={{ period: { from: null, to: null }, stages: [stage('POR_CONTACTAR', 0, null)] }}
      />,
    );
    expect(screen.getByText('Sin datos en el período')).toBeTruthy();
  });
});

describe('tabla de ejecutivos', () => {
  const exec = (userId: number, fullName: string, quotaPct: number | null) => ({
    userId,
    fullName,
    assigned: 100,
    contactedThisWeek: 10,
    weeklyQuota: 20,
    quotaPct,
    contactedThisCycle: 30,
    cycleCoveragePct: 30,
    statusAdvancesThisWeek: 2,
    appointmentsThisWeek: 1,
    contractsActive: 0,
  });

  test('ordena por cuota con nulos al final, en ambos sentidos', () => {
    const rows = [exec(1, 'Beto', 50), exec(2, 'Ana', null), exec(3, 'Carla', 120)];
    expect(sortExecutives(rows, 'quotaPct', 'desc').map((r) => r.fullName)).toEqual([
      'Carla',
      'Beto',
      'Ana',
    ]);
    expect(sortExecutives(rows, 'quotaPct', 'asc').map((r) => r.fullName)).toEqual([
      'Beto',
      'Carla',
      'Ana',
    ]);
    expect(sortExecutives(rows, 'fullName', 'asc').map((r) => r.fullName)).toEqual([
      'Ana',
      'Beto',
      'Carla',
    ]);
  });

  test('clic en la cabecera cambia el orden', async () => {
    const data: ExecutivesDto = {
      week: { start: '2026-10-19', end: '2026-10-25' },
      cycle: null,
      executives: [exec(1, 'Beto', 50), exec(3, 'Carla', 120)],
    };
    render(<ExecutivesCard data={data} />);
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent ?? '');
    expect(names()[0]).toContain('Carla');
    await userEvent.setup().click(screen.getByRole('button', { name: /Ejecutivo/ }));
    expect(names()[0]).toContain('Beto');
  });
});

describe('tabla de ejecutivos: búsqueda y paginación', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      userId: i + 1,
      fullName: `Ejecutivo ${String(i + 1).padStart(2, '0')}`,
      assigned: 100,
      contactedThisWeek: i,
      weeklyQuota: 20,
      quotaPct: i * 5,
      contactedThisCycle: 30,
      cycleCoveragePct: 30,
      statusAdvancesThisWeek: 0,
      appointmentsThisWeek: 0,
      contractsActive: 0,
    }));

  test('pagina de 10 en 10 y la búsqueda filtra por nombre sin tildes', async () => {
    const data: ExecutivesDto = {
      week: { start: '2026-10-19', end: '2026-10-25' },
      cycle: null,
      executives: [
        ...many(12),
        ...many(1).map((e) => ({ ...e, userId: 99, fullName: 'José Martínez' })),
      ],
    };
    render(<ExecutivesCard data={data} />);
    const bodyRows = () => screen.getAllByRole('row').slice(1);
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText(/1–10 de 13 ejecutivos/)).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Página 2' }));
    expect(bodyRows()).toHaveLength(3);
    await user.type(screen.getByLabelText('Buscar ejecutivo…'), 'jose');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]?.textContent).toContain('José Martínez');
    await user.clear(screen.getByLabelText('Buscar ejecutivo…'));
    await user.type(screen.getByLabelText('Buscar ejecutivo…'), 'nadie');
    expect(screen.getByText('Ningún ejecutivo coincide con la búsqueda.')).toBeTruthy();
  });
});

describe('pivotExecutives', () => {
  test('agrupa en "Otros" a partir del sexto ejecutivo', () => {
    const weeks = [
      {
        ...weekPoint('2026-10-19', 10),
        executives: Array.from({ length: 7 }, (_, i) => ({
          userId: i + 1,
          fullName: `E${i + 1}`,
          interactions: 10 - i,
          companiesContacted: 1,
        })),
      },
    ];
    const { series, rows } = pivotExecutives({ weeks });
    expect(series).toHaveLength(6);
    expect(series.at(-1)?.name).toBe('Otros');
    expect(rows[0]?.others).toBe(5 + 4);
  });
});

describe('DashboardPage', () => {
  let mocked: ReturnType<typeof mockFetch>;
  afterEach(() => mocked?.restore());

  const handler =
    (empty = false) =>
    ({ url }: { url: URL }) => {
      switch (url.pathname) {
        case '/api/analytics/summary':
          return jsonResponse(summary());
        case '/api/analytics/funnel':
          return jsonResponse({
            period: { from: null, to: null },
            stages: empty
              ? [stage('POR_CONTACTAR', 0, null)]
              : [stage('POR_CONTACTAR', 100, null), stage('CONTACTADO', 40, 40)],
          } satisfies FunnelDto);
        case '/api/analytics/weekly-activity':
          return jsonResponse({
            weeks: empty
              ? [weekPoint('2026-10-19', 0)]
              : [weekPoint('2026-10-12', 5), weekPoint('2026-10-19', 8)],
          } satisfies WeeklyActivityDto);
        case '/api/analytics/executives':
          return jsonResponse({
            week: { start: '2026-10-19', end: '2026-10-25' },
            cycle: null,
            executives: [
              {
                userId: 2,
                fullName: 'Ana Ejecutiva',
                assigned: 50,
                contactedThisWeek: 25,
                weeklyQuota: 20,
                quotaPct: 125,
                contactedThisCycle: 30,
                cycleCoveragePct: 60,
                statusAdvancesThisWeek: 3,
                appointmentsThisWeek: 2,
                contractsActive: 1,
              },
            ],
          } satisfies ExecutivesDto);
        case '/api/analytics/cycle-coverage':
          return jsonResponse({
            cycle: {
              id: 1,
              number: 4,
              startDate: '2026-10-12',
              endDate: '2026-11-01',
              weekNumber: 2,
              totalWeeks: 3,
            },
            executives: [
              {
                userId: 2,
                fullName: 'Ana Ejecutiva',
                assigned: 50,
                contacted: 30,
                pending: 20,
                coveragePct: 60,
              },
            ],
            totals: { assigned: 50, contacted: 30, pending: 20, coveragePct: 60 },
          } satisfies CycleCoverageDto);
        case '/api/catalogs/sectors':
          return jsonResponse([{ id: 1, name: 'PRIVADA NACIONAL' }]);
        default:
          return undefined;
      }
    };

  test('carga indicadores, embudo, cobertura y ejecutivos con los filtros por defecto', async () => {
    mocked = mockFetch(handler());
    await mountApp('/tablero', 'SUPERVISOR');
    expect(await screen.findByTestId('kpi-compliance')).toBeTruthy();
    expect(await screen.findByText('Embudo del pipeline')).toBeTruthy();
    expect(await screen.findByText(/Ciclo 4 · semana 2 de 3/)).toBeTruthy();
    expect((await screen.findAllByText('Ana Ejecutiva')).length).toBeGreaterThan(0);
    const summaryCall = mocked.calls.find((c) => c.url.pathname === '/api/analytics/summary');
    expect(summaryCall?.url.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const weekly = mocked.calls.find((c) => c.url.pathname === '/api/analytics/weekly-activity');
    expect(weekly?.url.searchParams.get('weeks')).toBe('12');
    expect(weekly?.url.searchParams.has('from')).toBe(false);
  });

  test('cambiar el ejecutivo vuelve a pedir los datos con userId y lo deja en la URL', async () => {
    mocked = mockFetch(handler());
    const router = await mountApp('/tablero', 'SUPERVISOR');
    const user = userEvent.setup();
    // Espera a que el catálogo de ejecutivos esté cargado (tabla del tablero).
    await screen.findByText('Ejecutivos');
    await user.click(await screen.findByLabelText('Ejecutivo'));
    await user.click(await screen.findByRole('option', { name: 'Ana Ejecutiva' }));
    await waitFor(() =>
      expect(
        mocked.calls.some(
          (c) =>
            c.url.pathname === '/api/analytics/summary' && c.url.searchParams.get('userId') === '2',
        ),
      ).toBe(true),
    );
    expect(router.state.location.search).toMatchObject({ userId: 2 });
  });

  test('dibuja los gráficos y el desglose por ejecutivo pide byExecutive', async () => {
    mocked = mockFetch(handler());
    await mountApp('/tablero', 'ADMIN');
    await screen.findByTestId('kpi-compliance');
    await waitFor(() =>
      expect(document.querySelectorAll('svg.recharts-surface').length).toBeGreaterThanOrEqual(2),
    );
    await userEvent.setup().click(await screen.findByLabelText('Ver actividad por ejecutivo'));
    await waitFor(() =>
      expect(
        mocked.calls.some(
          (c) =>
            c.url.pathname === '/api/analytics/weekly-activity' &&
            c.url.searchParams.get('byExecutive') === 'true',
        ),
      ).toBe(true),
    );
  });

  test('el ejecutivo no ve el filtro de ejecutivo', async () => {
    mocked = mockFetch(handler());
    await mountApp('/tablero', 'EJECUTIVO');
    await screen.findByTestId('kpi-compliance');
    expect(screen.queryByLabelText('Ejecutivo')).toBeNull();
    expect(screen.getByLabelText('Período')).toBeTruthy();
  });

  test('estados vacíos cuando no hay actividad', async () => {
    mocked = mockFetch(handler(true));
    await mountApp('/tablero', 'ADMIN');
    expect(await screen.findByText('Sin datos en el período')).toBeTruthy();
    expect((await screen.findAllByText('Sin actividad registrada')).length).toBe(2);
  });

  test('error con botón de reintento', async () => {
    let fail = true;
    const base = handler();
    mocked = mockFetch((call) => {
      if (call.url.pathname === '/api/analytics/summary' && fail) {
        return jsonResponse({ statusCode: 500, code: 'X', message: 'Falló el servidor' }, 500);
      }
      return base(call);
    });
    await mountApp('/tablero', 'ADMIN');
    const retry = await screen.findByRole('button', { name: 'Reintentar' }, { timeout: 4000 });
    fail = false;
    await userEvent.setup().click(retry);
    expect(await screen.findByTestId('kpi-compliance')).toBeTruthy();
  });
});

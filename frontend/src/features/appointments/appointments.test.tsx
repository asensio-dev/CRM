import { afterEach, describe, expect, test } from 'bun:test';
import type { AppointmentDto } from '@axiom/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { HttpError } from '@/shared/api';
import { isoToManaguaLocal } from '@/shared/lib/managua-time';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';
import {
  CancelAppointmentDialog,
  CompleteAppointmentDialog,
  RescheduleAppointmentDialog,
} from './action-dialogs';
import { groupByDay } from './agenda-view';
import { availableActions } from './appointment-card';
import { appointmentErrorMessage } from './errors';
import { ScheduleAppointmentDialog } from './schedule-dialog';

const appt = (id: number, over: Partial<AppointmentDto> = {}): AppointmentDto => ({
  id,
  companyId: 5,
  companyName: 'EMPRESA CINCO S.A.',
  userId: 2,
  scheduledAt: '2026-10-27T16:00:00.000Z',
  mode: 'PRESENCIAL',
  location: 'Oficina central',
  status: 'PROGRAMADA',
  notes: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

const futureLocal = () => isoToManaguaLocal(new Date(Date.now() + 3 * 86_400_000));

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

describe('agenda: semana en hora de Managua', () => {
  test('agrupa por día local: 22:00 del 31 dic en Managua es 04:00 UTC del 1 ene', () => {
    const late = appt(1, { scheduledAt: '2027-01-01T04:00:00.000Z' });
    const early = appt(2, { scheduledAt: '2027-01-01T06:30:00.000Z' });
    const byDay = groupByDay([early, late]);
    expect(byDay.get('2026-12-31')?.map((a) => a.id)).toEqual([1]);
    expect(byDay.get('2027-01-01')?.map((a) => a.id)).toEqual([2]);
  });

  test('ordena las citas del día por hora', () => {
    const a = appt(1, { scheduledAt: '2026-10-27T20:00:00.000Z' });
    const b = appt(2, { scheduledAt: '2026-10-27T15:00:00.000Z' });
    expect(
      groupByDay([a, b])
        .get('2026-10-27')
        ?.map((x) => x.id),
    ).toEqual([2, 1]);
  });
});

describe('AppointmentsPage', () => {
  test('pide la semana [lunes, lunes siguiente) y navega cruzando fin de año', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/appointments/agenda'
        ? jsonResponse([appt(1, { scheduledAt: '2027-01-01T04:00:00.000Z' })])
        : undefined,
    );
    const router = await mountApp('/citas?week=2026-12-28');
    expect(await screen.findByTestId('week-label')).toBeTruthy();
    await waitFor(() =>
      expect(mocked.calls.some((c) => c.url.pathname === '/api/appointments/agenda')).toBe(true),
    );
    const first = mocked.calls.find((c) => c.url.pathname === '/api/appointments/agenda');
    expect(first?.url.searchParams.get('from')).toBe('2026-12-28T06:00:00.000Z');
    expect(first?.url.searchParams.get('to')).toBe('2027-01-04T06:00:00.000Z');
    // La cita de las 22:00 del 31 dic (Managua) aparece en la columna del jueves 31.
    const thursday = await waitFor(() => {
      const el = document.querySelector('[data-day="2026-12-31"]');
      expect(el?.textContent).toContain('EMPRESA CINCO');
      return el;
    });
    expect(thursday).toBeTruthy();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ week: '2027-01-04' }));
    await waitFor(() =>
      expect(
        mocked.calls.some((c) => c.url.searchParams.get('from') === '2027-01-04T06:00:00.000Z'),
      ).toBe(true),
    );
  });

  test('semana vacía muestra el estado vacío', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/appointments/agenda' ? jsonResponse([]) : undefined,
    );
    await mountApp('/citas?week=2026-10-26');
    expect(await screen.findByText('No hay citas esta semana.')).toBeTruthy();
  });

  test('la vista de lista pide /appointments con filtros y muestra acciones solo en PROGRAMADA', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/appointments'
        ? jsonResponse({
            items: [appt(1), appt(2, { status: 'REALIZADA' })],
            page: 1,
            pageSize: 20,
            total: 2,
          })
        : undefined,
    );
    await mountApp('/citas?view=lista&status=PROGRAMADA&from=2026-10-01&to=2026-10-31');
    expect(await screen.findByTestId('appointment-1')).toBeTruthy();
    const call = mocked.calls.find((c) => c.url.pathname === '/api/appointments');
    expect(call?.url.searchParams.get('status')).toBe('PROGRAMADA');
    expect(call?.url.searchParams.get('from')).toBe('2026-10-01T06:00:00.000Z');
    expect(call?.url.searchParams.get('to')).toBe('2026-11-01T06:00:00.000Z');
    expect(
      within(screen.getByTestId('appointment-1')).getByRole('button', { name: 'Reprogramar' }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('appointment-2')).queryByRole('button', { name: 'Reprogramar' }),
    ).toBeNull();
  });
});

describe('AppointmentsPage: búsqueda y paginación', () => {
  test('cada día muestra 4 citas y "Ver N más" despliega el resto', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      appt(i + 1, {
        companyName: `EMPRESA ${i + 1}`,
        scheduledAt: `2026-10-27T${String(14 + i).padStart(2, '0')}:00:00.000Z`,
      }),
    );
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/appointments/agenda' ? jsonResponse(many) : undefined,
    );
    await mountApp('/citas?week=2026-10-26');
    const day = await waitFor(() => {
      const el = document.querySelector('[data-day="2026-10-27"]') as HTMLElement | null;
      expect(el?.querySelectorAll('article')).toHaveLength(4);
      return el as HTMLElement;
    });
    await userEvent.setup().click(within(day).getByRole('button', { name: 'Ver 2 más' }));
    expect(day.querySelectorAll('article')).toHaveLength(6);
    expect(within(day).getByRole('button', { name: 'Ver menos' })).toBeTruthy();
  });

  test('la búsqueda de la agenda filtra por empresa y notas, sin tildes', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/appointments/agenda'
        ? jsonResponse([
            appt(1, { companyName: 'FERRETERÍA LÓPEZ' }),
            appt(2, { companyName: 'OTRA S.A.', notes: 'Llevar catálogo' }),
            appt(3, { companyName: 'TERCERA S.A.' }),
          ])
        : undefined,
    );
    await mountApp('/citas?week=2026-10-26');
    await screen.findByTestId('appointment-3');
    const user = userEvent.setup();
    const input = screen.getByLabelText('Buscar citas de la semana');
    await user.type(input, 'ferreteria');
    await waitFor(() => expect(screen.queryByTestId('appointment-3')).toBeNull());
    expect(screen.getByTestId('appointment-1')).toBeTruthy();
    expect(screen.getByText('1 de 3 citas coinciden con la búsqueda.')).toBeTruthy();
    await user.clear(input);
    await user.type(input, 'catalogo');
    await waitFor(() => expect(screen.queryByTestId('appointment-1')).toBeNull());
    expect(screen.getByTestId('appointment-2')).toBeTruthy();
  });

  test('la lista pagina en el servidor: filas por página y número de página van al API', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/appointments'
        ? jsonResponse({
            items: [appt(1), appt(2, { companyName: 'OTRA S.A.' })],
            page: Number(url.searchParams.get('page')),
            pageSize: Number(url.searchParams.get('pageSize')),
            total: 120,
          })
        : undefined,
    );
    const router = await mountApp('/citas?view=lista');
    await screen.findByTestId('appointment-1');
    const first = mocked.calls.find((c) => c.url.pathname === '/api/appointments');
    expect(first?.url.searchParams.get('pageSize')).toBe('7');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Filas por página'), '28');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ pageSize: 28 }));
    await waitFor(() =>
      expect(mocked.calls.some((c) => c.url.searchParams.get('pageSize') === '28')).toBe(true),
    );
    await user.click(await screen.findByRole('button', { name: 'Página 2' }));
    await waitFor(() =>
      expect(
        mocked.calls.some(
          (c) =>
            c.url.searchParams.get('page') === '2' && c.url.searchParams.get('pageSize') === '28',
        ),
      ).toBe(true),
    );
    // La búsqueda filtra en cliente la página recibida y lo avisa.
    await user.type(screen.getByLabelText('Buscar'), 'otra');
    await waitFor(() => expect(screen.queryByTestId('appointment-1')).toBeNull());
    expect(screen.getByTestId('appointment-2')).toBeTruthy();
    expect(screen.getByText(/La búsqueda filtra las citas de esta página/)).toBeTruthy();
  });
});

describe('acciones según estado', () => {
  test('solo PROGRAMADA se gestiona', () => {
    expect(availableActions('PROGRAMADA')).toEqual(['reschedule', 'complete', 'cancel']);
    expect(availableActions('REALIZADA')).toEqual([]);
    expect(availableActions('CANCELADA')).toEqual([]);
    expect(availableActions('REPROGRAMADA')).toEqual([]);
  });
});

describe('errores', () => {
  test('APPOINTMENT_COMPANY_NOT_READY → mensaje claro', () => {
    const err = new HttpError({
      statusCode: 422,
      code: 'APPOINTMENT_COMPANY_NOT_READY',
      message: 'x',
      details: { from: 'POR_CONTACTAR', to: 'AGENDANDO_CITA', allowed: [] },
    });
    expect(appointmentErrorMessage(err)).toContain("La empresa debe estar en 'Con respuesta'");
  });
});

describe('ScheduleAppointmentDialog', () => {
  test('PRESENCIAL exige lugar y no envía hasta completarlo', async () => {
    mocked = mockFetch(({ url, method }) =>
      method === 'POST' && url.pathname === '/api/appointments'
        ? jsonResponse(appt(9), 201)
        : undefined,
    );
    renderWithClient(
      <ScheduleAppointmentDialog
        open
        onOpenChange={() => {}}
        companyId={5}
        companyName="EMPRESA CINCO S.A."
      />,
    );
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('Fecha y hora (Managua)'), {
      target: { value: futureLocal() },
    });
    await user.click(screen.getByRole('button', { name: 'Agendar cita' }));
    expect(await screen.findByText('El lugar es obligatorio en citas presenciales.')).toBeTruthy();
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText('Lugar'), 'Sucursal Centro');
    await user.click(screen.getByRole('button', { name: 'Agendar cita' }));
    await waitFor(() => expect(mocked.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      companyId: 5,
      mode: 'PRESENCIAL',
      location: 'Sucursal Centro',
    });
    expect(String((post?.body as { scheduledAt?: string } | undefined)?.scheduledAt)).toMatch(/Z$/);
  });

  test('VIRTUAL no exige lugar', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST' ? jsonResponse(appt(9), 201) : undefined,
    );
    renderWithClient(
      <ScheduleAppointmentDialog open onOpenChange={() => {}} companyId={5} companyName="X" />,
    );
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('Fecha y hora (Managua)'), {
      target: { value: futureLocal() },
    });
    await user.selectOptions(screen.getByLabelText('Modalidad'), 'VIRTUAL');
    await user.click(screen.getByRole('button', { name: 'Agendar cita' }));
    await waitFor(() => expect(mocked.calls.some((c) => c.method === 'POST')).toBe(true));
    const body = mocked.calls.find((c) => c.method === 'POST')?.body as
      | { location?: string }
      | undefined;
    expect(body).toBeDefined();
    expect(body?.location).toBeUndefined();
  });

  test('rechaza fechas pasadas en el cliente', async () => {
    mocked = mockFetch(() => undefined);
    renderWithClient(
      <ScheduleAppointmentDialog open onOpenChange={() => {}} companyId={5} companyName="X" />,
    );
    fireEvent.change(await screen.findByLabelText('Fecha y hora (Managua)'), {
      target: { value: '2020-01-01T10:00' },
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Agendar cita' }));
    expect(await screen.findByText('La cita debe ser en una fecha y hora futuras.')).toBeTruthy();
  });

  test('muestra el mensaje claro si la empresa no está lista', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST'
        ? jsonResponse(
            {
              statusCode: 422,
              code: 'APPOINTMENT_COMPANY_NOT_READY',
              message: 'crudo',
              details: {},
            },
            422,
          )
        : undefined,
    );
    renderWithClient(
      <ScheduleAppointmentDialog open onOpenChange={() => {}} companyId={5} companyName="X" />,
    );
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('Fecha y hora (Managua)'), {
      target: { value: futureLocal() },
    });
    await user.type(screen.getByLabelText('Lugar'), 'Aquí');
    await user.click(screen.getByRole('button', { name: 'Agendar cita' }));
    expect(
      await screen.findByText(/La empresa debe estar en 'Con respuesta' para agendar/),
    ).toBeTruthy();
  });
});

describe('diálogos de acción', () => {
  test('reprogramar muestra anterior → nuevo y envía la nueva fecha', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST'
        ? jsonResponse({
            previous: appt(1, { status: 'REPROGRAMADA' }),
            appointment: appt(2),
          })
        : undefined,
    );
    renderWithClient(
      <RescheduleAppointmentDialog appointment={appt(1)} open onOpenChange={() => {}} />,
    );
    expect(await screen.findByText('Nueva fecha pendiente')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nueva fecha y hora (Managua)'), {
      target: { value: '2099-03-05T09:30' },
    });
    const preview = screen.getByTestId('reschedule-preview');
    await waitFor(() => expect(preview.textContent).not.toContain('Nueva fecha pendiente'));
    expect(preview.textContent).toContain('2099');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reprogramar' }));
    await waitFor(() => expect(mocked.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.url.pathname).toBe('/api/appointments/1/reschedule');
    expect(post?.body).toMatchObject({ scheduledAt: '2099-03-05T15:30:00.000Z' });
  });

  test('completar exige el resultado', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST' ? jsonResponse(appt(1, { status: 'REALIZADA' })) : undefined,
    );
    renderWithClient(
      <CompleteAppointmentDialog appointment={appt(1)} open onOpenChange={() => {}} />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Marcar como realizada' }));
    expect(await screen.findByText('Indica el resultado de la reunión.')).toBeTruthy();
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);
    await user.type(screen.getByLabelText('Resultado de la reunión'), 'Firman la próxima semana');
    await user.click(screen.getByRole('button', { name: 'Marcar como realizada' }));
    await waitFor(() => expect(mocked.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(mocked.calls.find((c) => c.method === 'POST')?.body).toEqual({
      outcome: 'Firman la próxima semana',
    });
  });

  test('cancelar pide confirmación y el motivo es opcional', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST' ? jsonResponse(appt(1, { status: 'CANCELADA' })) : undefined,
    );
    renderWithClient(
      <CancelAppointmentDialog appointment={appt(1)} open onOpenChange={() => {}} />,
    );
    expect(await screen.findByText(/¿Cancelar la cita con EMPRESA CINCO S.A./)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar cita' }));
    await waitFor(() => expect(mocked.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.url.pathname).toBe('/api/appointments/1/cancel');
  });
});

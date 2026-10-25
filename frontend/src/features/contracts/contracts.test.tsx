import { afterEach, describe, expect, test } from 'bun:test';
import type { ContractDto, ContractStatus } from '@axiom/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from 'sonner';
import { HttpError } from '@/shared/api';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';
import { CreateContractDialog } from './contract-form-dialog';
import { contractErrorMessage } from './errors';
import {
  ContractFormSchema,
  canEditContract,
  nextStatusActions,
  normalizeAmountInput,
  toCreateRequest,
} from './logic';

const contract = (id: number, over: Partial<ContractDto> = {}): ContractDto => ({
  id,
  companyId: 5,
  companyName: 'EMPRESA CINCO S.A.',
  code: `CT-2026-00000${id}`,
  startDate: '2026-10-01',
  endDate: '2027-09-30',
  amount: '1500.5',
  currency: 'NIO',
  status: 'BORRADOR',
  notes: null,
  createdById: 2,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});

const page = (items: ContractDto[]) => ({ items, page: 1, pageSize: 25, total: items.length });

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

function renderWithClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>,
  );
}

describe('estados y acciones', () => {
  test('flujo BORRADOR → ENVIADO → FIRMADO → ACTIVO y CANCELADO desde no finales', () => {
    const table: Record<ContractStatus, ContractStatus[]> = {
      BORRADOR: ['ENVIADO', 'CANCELADO'],
      ENVIADO: ['FIRMADO', 'CANCELADO'],
      FIRMADO: ['ACTIVO', 'CANCELADO'],
      ACTIVO: ['CANCELADO'],
      CANCELADO: [],
      VENCIDO: [],
    };
    for (const [status, expected] of Object.entries(table)) {
      expect(nextStatusActions(status as ContractStatus)).toEqual(expected);
    }
  });

  test('solo BORRADOR es editable', () => {
    expect(canEditContract('BORRADOR')).toBe(true);
    for (const s of ['ENVIADO', 'FIRMADO', 'ACTIVO', 'CANCELADO', 'VENCIDO'] as const) {
      expect(canEditContract(s)).toBe(false);
    }
  });
});

describe('validación del formulario', () => {
  const base = {
    company: { id: 5, name: 'X' },
    startDate: '2026-10-01',
    endDate: '',
    amount: '1500.50',
    currency: 'NIO' as const,
    notes: '',
  };
  const amountOk = (amount: string) => ContractFormSchema.safeParse({ ...base, amount }).success;

  test('el monto es un decimal con hasta 2 decimales', () => {
    for (const ok of ['0', '5', '1500.5', '1500.50', '9999999999999999.99'])
      expect(amountOk(ok)).toBe(true);
    for (const bad of [
      '',
      'abc',
      '-5',
      '1,500',
      '12.345',
      '1e3',
      '.5',
      '5.',
      '99999999999999999',
    ]) {
      expect(amountOk(bad)).toBe(false);
    }
  });

  test('fin no puede ser anterior al inicio', () => {
    const r = ContractFormSchema.safeParse({ ...base, endDate: '2026-09-30' });
    expect(r.success).toBe(false);
    expect(ContractFormSchema.safeParse({ ...base, endDate: '2026-10-01' }).success).toBe(true);
  });

  test('el monto se normaliza como texto, sin pasar por float', () => {
    expect(normalizeAmountInput('5')).toBe('5.00');
    expect(normalizeAmountInput('007.1')).toBe('7.10');
    expect(normalizeAmountInput('9007199254740993.01')).toBe('9007199254740993.01');
    const parsed = ContractFormSchema.parse({ ...base, amount: '12.5' });
    expect(toCreateRequest(parsed)).toMatchObject({
      companyId: 5,
      amount: '12.50',
      currency: 'NIO',
    });
    expect(toCreateRequest(parsed).endDate).toBeUndefined();
  });
});

describe('errores', () => {
  const err = (code: string, details: unknown) =>
    new HttpError({ statusCode: 422, code, message: 'crudo', details });

  test('CONTRACT_COMPANY_NOT_READY según el destino', () => {
    expect(
      contractErrorMessage(
        err('CONTRACT_COMPANY_NOT_READY', { from: 'CONTACTADO', to: 'EN_PROCESO_CONTRATO' }),
      ),
    ).toContain("debe estar en 'Agendando cita'");
    expect(
      contractErrorMessage(
        err('CONTRACT_COMPANY_NOT_READY', { from: 'AGENDANDO_CITA', to: 'CONTRATO_ACTIVO' }),
      ),
    ).toContain("'En proceso de contrato'");
  });
});

describe('CreateContractDialog', () => {
  test('monto inválido bloquea el envío; válido envía el monto como texto', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST' ? jsonResponse(contract(9, { amount: '1500.00' }), 201) : undefined,
    );
    renderWithClient(
      <CreateContractDialog
        open
        onOpenChange={() => {}}
        companyId={5}
        companyName="EMPRESA CINCO S.A."
      />,
    );
    const user = userEvent.setup();
    const amount = await screen.findByLabelText('Monto');
    await user.type(amount, '1,500');
    await user.click(screen.getByRole('button', { name: 'Crear contrato' }));
    expect(await screen.findByText(/Monto inválido/)).toBeTruthy();
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);

    await user.clear(amount);
    await user.type(amount, '1500');
    await user.selectOptions(screen.getByLabelText('Moneda'), 'USD');
    await user.click(screen.getByRole('button', { name: 'Crear contrato' }));
    await waitFor(() => expect(mocked.calls.some((c) => c.method === 'POST')).toBe(true));
    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({ companyId: 5, amount: '1500.00', currency: 'USD' });
    expect(typeof (post?.body as { amount?: unknown } | undefined)?.amount).toBe('string');
  });

  test('fin anterior al inicio muestra el error', async () => {
    mocked = mockFetch(() => undefined);
    renderWithClient(
      <CreateContractDialog open onOpenChange={() => {}} companyId={5} companyName="X" />,
    );
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('Inicio'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Fin (opcional)'), { target: { value: '2026-10-01' } });
    await user.type(screen.getByLabelText('Monto'), '10');
    await user.click(screen.getByRole('button', { name: 'Crear contrato' }));
    expect(
      await screen.findByText('La fecha de fin no puede ser anterior a la de inicio.'),
    ).toBeTruthy();
  });

  test('empresa no lista → mensaje claro', async () => {
    mocked = mockFetch(({ method }) =>
      method === 'POST'
        ? jsonResponse(
            {
              statusCode: 422,
              code: 'CONTRACT_COMPANY_NOT_READY',
              message: 'crudo',
              details: { from: 'CONTACTADO', to: 'EN_PROCESO_CONTRATO', allowed: [] },
            },
            422,
          )
        : undefined,
    );
    renderWithClient(
      <CreateContractDialog open onOpenChange={() => {}} companyId={5} companyName="X" />,
    );
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Monto'), '10');
    await user.click(screen.getByRole('button', { name: 'Crear contrato' }));
    expect(await screen.findByText(/hoy está en 'Contactado'/)).toBeTruthy();
  });
});

describe('ContractsPage', () => {
  test('lista con montos por moneda, estado VENCIDO y filtros en la API', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/contracts'
        ? jsonResponse(
            page([
              contract(1, { amount: '1500.5', currency: 'NIO', status: 'ACTIVO' }),
              contract(2, { amount: '2000000.00', currency: 'USD', status: 'VENCIDO' }),
            ]),
          )
        : undefined,
    );
    await mountApp('/contratos?status=ACTIVO&startFrom=2026-01-01');
    expect(await screen.findAllByText('C$ 1,500.50')).toBeTruthy();
    expect(screen.getAllByText('US$ 2,000,000.00').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-status="VENCIDO"]')?.textContent).toBe('Vencido');
    const call = mocked.calls.find((c) => c.url.pathname === '/api/contracts');
    expect(call?.url.searchParams.get('status')).toBe('ACTIVO');
    expect(call?.url.searchParams.get('startFrom')).toBe('2026-01-01');
  });

  test('estado vacío', async () => {
    mocked = mockFetch(({ url }) =>
      url.pathname === '/api/contracts' ? jsonResponse(page([])) : undefined,
    );
    await mountApp('/contratos');
    expect(await screen.findByText('Aún no hay contratos')).toBeTruthy();
  });

  test('detalle: acciones por estado y confirmación con efecto sobre el pipeline', async () => {
    let current = contract(1, { status: 'FIRMADO' });
    mocked = mockFetch(({ url, method, body }) => {
      if (url.pathname === '/api/contracts' && method === 'GET')
        return jsonResponse(page([current]));
      if (url.pathname === '/api/contracts/1' && method === 'GET') return jsonResponse(current);
      if (url.pathname === '/api/contracts/1/status') {
        current = { ...current, status: (body as { to: ContractStatus }).to };
        return jsonResponse(current);
      }
      return undefined;
    });
    await mountApp('/contratos');
    const user = userEvent.setup();
    await user.click(
      (
        await screen.findAllByRole('button', { name: 'Ver contrato CT-2026-000001' })
      )[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    // FIRMADO: se puede activar o cancelar; no se edita.
    expect(await within(dialog).findByRole('button', { name: 'Activar contrato' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancelar contrato' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Editar' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Activar contrato' }));
    expect(within(dialog).getByText(/La empresa pasará a 'Contrato activo'/)).toBeTruthy();
    expect(mocked.calls.some((c) => c.url.pathname.endsWith('/status'))).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() =>
      expect(mocked.calls.find((c) => c.url.pathname === '/api/contracts/1/status')?.body).toEqual({
        to: 'ACTIVO',
      }),
    );
    // Tras activar, solo queda cancelar.
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Activar contrato' })).toBeNull(),
    );
    expect(within(dialog).getByRole('button', { name: 'Cancelar contrato' })).toBeTruthy();
  });

  test('un contrato en borrador se puede editar', async () => {
    const draft = contract(3, { status: 'BORRADOR' });
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/contracts') return jsonResponse(page([draft]));
      if (url.pathname === '/api/contracts/3') return jsonResponse(draft);
      return undefined;
    });
    await mountApp('/contratos');
    await userEvent
      .setup()
      .click(
        (
          await screen.findAllByRole('button', { name: 'Ver contrato CT-2026-000003' })
        )[0] as HTMLElement,
      );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Marcar como enviado' })).toBeTruthy();
  });

  test('un contrato VENCIDO no ofrece acciones', async () => {
    const expired = contract(4, { status: 'VENCIDO' });
    mocked = mockFetch(({ url }) => {
      if (url.pathname === '/api/contracts') return jsonResponse(page([expired]));
      if (url.pathname === '/api/contracts/4') return jsonResponse(expired);
      return undefined;
    });
    await mountApp('/contratos');
    await userEvent
      .setup()
      .click(
        (
          await screen.findAllByRole('button', { name: 'Ver contrato CT-2026-000004' })
        )[0] as HTMLElement,
      );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Estado final/)).toBeTruthy();
  });
});

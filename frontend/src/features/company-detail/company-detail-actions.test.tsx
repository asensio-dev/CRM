import { afterEach, describe, expect, test } from 'bun:test';
import type { CompanyDetail } from '@axiom/contracts';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';

const company: CompanyDetail = {
  id: 5,
  ruc: 'J0310000000005',
  legalName: 'EMPRESA CINCO S.A.',
  tradeName: null,
  employeeCount: 40,
  phone: '22223333',
  status: 'CON_RESPUESTA',
  sectorId: 1,
  sectorName: 'PRIVADA NACIONAL',
  activityId: 1,
  activityName: 'COMERCIO',
  lastContactAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  legalRepName: null,
  shippingAddress: null,
  particularAddress: null,
  source: 'EXCEL',
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  branches: [],
};

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

function mockApi() {
  mocked = mockFetch(({ url }) => {
    switch (url.pathname) {
      case '/api/companies/5':
        return jsonResponse(company);
      case '/api/pipeline/companies/5':
        return jsonResponse({
          companyId: 5,
          status: 'CON_RESPUESTA',
          version: 1,
          lastContactAt: null,
          allowedNextStatuses: ['AGENDANDO_CITA'],
        });
      case '/api/pipeline/companies/5/timeline':
        return jsonResponse({ items: [], page: 1, pageSize: 15, total: 0 });
      default:
        return undefined;
    }
  });
}

describe('ficha de empresa: citas y contratos', () => {
  test('"Agendar cita" abre el diálogo con la empresa preseleccionada', async () => {
    mockApi();
    await mountApp('/empresas/5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Agendar cita' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Agendar cita' })).toBeTruthy();
    const picker = within(dialog).getByLabelText('Empresa');
    expect((picker as HTMLButtonElement).disabled).toBe(true);
    expect(picker.textContent).toContain('EMPRESA CINCO S.A.');
  });

  test('"Crear contrato" abre el diálogo con la empresa preseleccionada', async () => {
    mockApi();
    await mountApp('/empresas/5');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Crear contrato' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Crear contrato' })).toBeTruthy();
    const picker = within(dialog).getByLabelText('Empresa');
    expect((picker as HTMLButtonElement).disabled).toBe(true);
    expect(picker.textContent).toContain('EMPRESA CINCO S.A.');
  });
});

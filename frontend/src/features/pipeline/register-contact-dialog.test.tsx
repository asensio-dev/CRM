import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, reply } from '@/test/mock-api';
import { RegisterContactDialog } from './register-contact-dialog';

const state = {
  companyId: 5,
  status: 'POR_CONTACTAR',
  version: 2,
  lastContactAt: null,
  allowedNextStatuses: ['CONTACTADO'],
};

function setup(post: () => unknown) {
  const api = mockApi({
    'GET /api/pipeline/companies/5': () => state,
    'POST /api/pipeline/companies/5/interactions': post,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RegisterContactDialog
        companyId={5}
        companyName="Beta"
        open
        onOpenChange={() => {}}
        planItemId={77}
      />
    </QueryClientProvider>,
  );
  return api;
}

describe('RegisterContactDialog', () => {
  test('exige el resultado antes de enviar', async () => {
    const api = setup(() => ({}));
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Selecciona el resultado.')).toBeTruthy();
    expect(api.calls.some((c) => c.key.startsWith('POST'))).toBe(false);
  });

  test('exige motivo al elegir DESCARTADO', async () => {
    setup(() => ({}));
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Resultado'), 'NO_INTERESADO');
    await user.selectOptions(screen.getByLabelText('Mover a (opcional)'), 'DESCARTADO');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText('Indica el motivo del cambio de estado.')).toBeTruthy();
  });

  test('envía planItemId/expectedVersion y resume las transiciones aplicadas', async () => {
    const api = setup(() =>
      reply(201, {
        state: { ...state, status: 'CON_RESPUESTA', version: 3 },
        transitions: [
          { from: 'POR_CONTACTAR', to: 'CONTACTADO' },
          { from: 'CONTACTADO', to: 'CON_RESPUESTA' },
        ],
      }),
    );
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Resultado'), 'INTERESADO');
    await user.type(screen.getByLabelText('Notas'), 'Quiere cotización');
    await waitFor(() =>
      expect(api.calls.some((c) => c.key === 'GET /api/pipeline/companies/5')).toBe(true),
    );
    await new Promise((r) => setTimeout(r, 50)); // deja que el estado llegue a la caché
    await user.click(screen.getByRole('button', { name: 'Registrar' }));
    const result = await screen.findByTestId('contact-result');
    expect(result.textContent).toContain('Por contactar');
    expect(result.textContent).toContain('Contactado');
    expect(result.textContent).toContain('Con respuesta');
    const post = api.calls.find((c) => c.key.startsWith('POST'));
    expect(post?.body).toEqual({
      channel: 'LLAMADA',
      outcome: 'INTERESADO',
      notes: 'Quiere cotización',
      planItemId: 77,
      expectedVersion: 2,
    });
  });
});

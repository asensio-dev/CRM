import { beforeEach, describe, expect, test } from 'bun:test';
import { render, screen, waitFor } from '@testing-library/react';
import { useSessionStore } from '@/features/auth/session-store';
import { createAppRouter, createTestHistory } from './router';

function mount(path: string) {
  const router = createAppRouter(createTestHistory(path));
  // Import tardío: App arranca la restauración solo si el estado es 'loading'.
  return import('./providers').then(({ App }) => {
    render(<App router={router} />);
    return router;
  });
}

function signIn(role: 'ADMIN' | 'EJECUTIVO') {
  useSessionStore.setState({
    status: 'authenticated',
    user: { id: 1, email: 'ana@empresa.com', fullName: 'Ana Pérez', role },
  });
}

describe('rutas protegidas', () => {
  beforeEach(() => {
    useSessionStore.setState({ status: 'anonymous', user: null });
  });

  test('sin sesión redirige a /login conservando el destino', async () => {
    const router = await mount('/pipeline');
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toEqual({ redirect: '/pipeline' });
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy();
  });

  test('con sesión muestra la página y la navegación', async () => {
    signIn('EJECUTIVO');
    await mount('/cartera');
    expect(await screen.findByRole('heading', { name: 'Cartera' })).toBeTruthy();
    expect(screen.getByText('Disponible en la Ola 3')).toBeTruthy();
    expect(screen.queryByText('Usuarios')).toBeNull();
    expect(screen.queryByText('Importación')).toBeNull();
  });

  test('ADMIN ve Importación y Usuarios', async () => {
    signIn('ADMIN');
    await mount('/usuarios');
    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeTruthy();
    expect(screen.getAllByText('Importación').length).toBeGreaterThan(0);
  });

  test('un ejecutivo no entra a rutas de ADMIN', async () => {
    signIn('EJECUTIVO');
    const router = await mount('/usuarios');
    await waitFor(() => expect(router.state.location.pathname).toBe('/mi-semana'));
  });

  test('con sesión, /login redirige a la app', async () => {
    signIn('EJECUTIVO');
    const router = await mount('/login');
    await waitFor(() => expect(router.state.location.pathname).toBe('/mi-semana'));
  });
});

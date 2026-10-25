import { afterEach, describe, expect, test } from 'bun:test';
import type { UserDto } from '@axiom/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

const user = (id: number, over: Partial<UserDto> = {}): UserDto => ({
  id,
  email: `u${id}@empresa.com`,
  fullName: `Usuario ${id}`,
  role: 'EJECUTIVO',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

let users: UserDto[];
const handler = ({ url, method, body }: { url: URL; method: string; body: unknown }) => {
  if (url.pathname === '/api/users' && method === 'GET') {
    return jsonResponse({ items: users, page: 1, pageSize: 20, total: users.length });
  }
  if (url.pathname === '/api/users' && method === 'POST') {
    const created = user(50, body as Partial<UserDto>);
    users = [...users, created];
    return jsonResponse(created, 201);
  }
  return undefined;
};

describe('UsersPage', () => {
  test('lista usuarios con rol y estado', async () => {
    users = [user(1, { role: 'ADMIN' }), user(2, { isActive: false })];
    mocked = mockFetch(handler);
    await mountApp('/usuarios');
    expect((await screen.findAllByText('Usuario 2')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Administrador').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0);
  });

  test('crear usuario: valida y luego envía y refresca la lista', async () => {
    users = [user(1, { role: 'ADMIN' })];
    mocked = mockFetch(handler);
    await mountApp('/usuarios');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /Nuevo usuario/ }));
    const dialog = await screen.findByRole('dialog');
    await u.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));
    expect((await within(dialog).findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);

    await u.type(within(dialog).getByLabelText('Nombre completo'), 'Nuevo Nombre');
    await u.type(within(dialog).getByLabelText('Correo electrónico'), 'nuevo@empresa.com');
    await u.type(within(dialog).getByLabelText('Contraseña inicial'), 'valor-de-prueba-1');
    await u.selectOptions(within(dialog).getByLabelText('Rol'), 'SUPERVISOR');
    await u.click(within(dialog).getByRole('button', { name: 'Crear usuario' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      fullName: 'Nuevo Nombre',
      email: 'nuevo@empresa.com',
      role: 'SUPERVISOR',
    });
    expect((await screen.findAllByText('Nuevo Nombre')).length).toBeGreaterThan(0);
  });

  test('editar: envía solo lo cambiado y muestra el error de negocio como toast', async () => {
    users = [user(1, { role: 'ADMIN', fullName: 'Ana Pérez' }), user(2)];
    let fail = true;
    mocked = mockFetch((call) => {
      if (call.method === 'PATCH') {
        return fail
          ? jsonResponse(
              {
                statusCode: 422,
                code: 'LAST_ADMIN',
                message: 'Debe existir al menos un administrador activo',
              },
              422,
            )
          : jsonResponse(user(2, { fullName: 'Renombrado' }));
      }
      return handler(call);
    });
    await mountApp('/usuarios');
    const u = userEvent.setup();
    await u.click(
      (await screen.findAllByRole('button', { name: 'Editar Usuario 2' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Nombre completo');
    await u.clear(name);
    await u.type(name, 'Renombrado');
    await u.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Debe existir al menos un administrador activo')).toBeTruthy();
    expect(mocked.calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      fullName: 'Renombrado',
    });
    // El diálogo sigue abierto tras el error; reintento correcto.
    fail = false;
    await u.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar cambios' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  test('restablecer contraseña envía la nueva y cierra', async () => {
    users = [user(2)];
    mocked = mockFetch((call) =>
      call.url.pathname === '/api/users/2/reset-password'
        ? new Response(null, { status: 204 })
        : handler(call),
    );
    await mountApp('/usuarios');
    const u = userEvent.setup();
    await u.click(
      (
        await screen.findAllByRole('button', { name: 'Restablecer contraseña de Usuario 2' })
      )[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog');
    await u.type(within(dialog).getByLabelText('Nueva contraseña'), 'otra-clave-de-prueba');
    await u.click(within(dialog).getByRole('button', { name: 'Restablecer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocked.calls.find((c) => c.method === 'POST')?.body).toEqual({
      newPassword: 'otra-clave-de-prueba',
    });
  });
});

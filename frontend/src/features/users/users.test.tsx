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

describe('UsersPage: búsqueda y paginación', () => {
  const many = Array.from({ length: 130 }, (_, i) =>
    user(i + 1, {
      fullName: i === 124 ? 'Íñigo Láinez' : `Usuario ${i + 1}`,
      role: i % 10 === 0 ? 'SUPERVISOR' : 'EJECUTIVO',
    }),
  );
  const paged = ({ url, method }: { url: URL; method: string }) => {
    if (url.pathname !== '/api/users' || method !== 'GET') return undefined;
    const page = Number(url.searchParams.get('page'));
    const size = Number(url.searchParams.get('pageSize'));
    return jsonResponse({
      items: many.slice((page - 1) * size, page * size),
      page,
      pageSize: size,
      total: many.length,
    });
  };

  test('trae todas las páginas del API y pagina en cliente', async () => {
    mocked = mockFetch(paged);
    await mountApp('/usuarios');
    expect(await screen.findByText('1–20 de 130 usuarios')).toBeTruthy();
    const gets = mocked.calls.filter((c) => c.url.pathname === '/api/users');
    expect(gets.map((c) => c.url.searchParams.get('page'))).toEqual(['1', '2']);
    expect(gets.every((c) => c.url.searchParams.get('pageSize') === '100')).toBe(true);

    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect((await screen.findAllByText('Usuario 21')).length).toBeGreaterThan(0);
    await u.selectOptions(screen.getByLabelText('Filas por página'), '50');
    expect(await screen.findByText('1–50 de 130 usuarios')).toBeTruthy();
  });

  test('busca sin tildes por nombre o correo y filtra por rol', async () => {
    mocked = mockFetch(paged);
    await mountApp('/usuarios');
    await screen.findByText('1–20 de 130 usuarios');
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Buscar usuarios'), 'inigo lainez');
    expect(await screen.findByText('1–1 de 1 usuarios')).toBeTruthy();
    expect(screen.getAllByText('Íñigo Láinez').length).toBeGreaterThan(0);

    await u.clear(screen.getByLabelText('Buscar usuarios'));
    await u.selectOptions(screen.getByLabelText('Filtrar por rol'), 'SUPERVISOR');
    expect(await screen.findByText('1–13 de 13 usuarios')).toBeTruthy();

    await u.type(screen.getByLabelText('Buscar usuarios'), 'nadie-coincide');
    expect(await screen.findByText('Sin resultados')).toBeTruthy();
    await u.click(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0] as HTMLElement);
    expect(await screen.findByText('1–20 de 130 usuarios')).toBeTruthy();
  });
});

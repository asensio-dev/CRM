import { describe, expect, mock, test } from 'bun:test';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpError } from '@/shared/api';
import { LoginForm } from './login-form';

describe('LoginForm', () => {
  test('valida correo y contraseña con el esquema de contratos', async () => {
    const onSubmit = mock(async () => {});
    render(<LoginForm onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo');
    await user.type(screen.getByLabelText('Contraseña'), 'corta');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeTruthy();
    expect(screen.getByText('La contraseña debe tener al menos 8 caracteres.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('envía credenciales válidas', async () => {
    const onSubmit = mock(async (_v: { email: string; password: string }) => {});
    render(<LoginForm onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'valor-de-prueba-1');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      email: 'ana@empresa.com',
      password: 'valor-de-prueba-1',
    });
  });

  test('muestra el error del servidor en 401', async () => {
    const onSubmit = mock(async () => {
      throw new HttpError({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'x' });
    });
    render(<LoginForm onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@empresa.com');
    await user.type(screen.getByLabelText('Contraseña'), 'valor-de-prueba-1');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeTruthy();
  });
});

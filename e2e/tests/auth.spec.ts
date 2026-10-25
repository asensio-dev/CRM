import { expect, test } from '@playwright/test';
import { loginAs, logout, passwordOf, USERS } from '../support/auth';

test.describe('sesión', () => {
  test('rutas protegidas redirigen a /login conservando el destino', async ({ page }) => {
    await page.goto('/empresas');
    await expect(page).toHaveURL(/\/login\?redirect=/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('credenciales incorrectas muestran un error y no entran', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(USERS.admin.email);
    await page.getByLabel('Contraseña').fill('contraseña-equivocada');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login, recarga con restauración de sesión y logout', async ({ page }) => {
    await loginAs(page, 'admin');

    // Recargar: el access token vive en memoria; la sesión se restaura con la cookie de refresh
    await page.goto('/pipeline');
    // Esperar a que termine la restauración: recargar con un refresh en vuelo deja al navegador con
    // el token ya rotado y el servidor lo trata como reutilización (ver docs/testing.md).
    await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/pipeline/);

    await logout(page);
    // Tras cerrar sesión, la cookie ya no sirve: entrar a una ruta protegida vuelve al login
    await page.goto('/empresas');
    await expect(page).toHaveURL(/\/login/);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
  });

  test('el login correcto con la contraseña generada llega a Mi semana', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(USERS.supervisor.email);
    await page.getByLabel('Contraseña').fill(passwordOf('supervisor'));
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/mi-semana/);
  });
});

test.describe('menú por rol', () => {
  test('el EJECUTIVO no ve Importación ni Usuarios y no puede entrar por URL', async ({ page }) => {
    await loginAs(page, 'exec1');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Pipeline' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Empresas' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Importación' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);

    await page.goto('/usuarios');
    await expect(page).toHaveURL(/\/mi-semana/);
    await page.goto('/importacion');
    await expect(page).toHaveURL(/\/mi-semana/);
  });

  test('el ADMIN ve Importación y Usuarios', async ({ page }) => {
    await loginAs(page, 'admin');
    const nav = page.getByRole('navigation', { name: 'Principal' });
    await expect(nav.getByRole('link', { name: 'Importación' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toBeVisible();
    await nav.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page).toHaveURL(/\/usuarios/);
  });
});

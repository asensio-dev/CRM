import { expect, type Page } from '@playwright/test';

export const USERS = {
  admin: { email: 'admin@test.axiom', env: 'TEST_PASSWORD_ADMIN' },
  supervisor: { email: 'supervisor@test.axiom', env: 'TEST_PASSWORD_SUPERVISOR' },
  exec1: { email: 'ejecutivo1@test.axiom', env: 'TEST_PASSWORD_EXEC1' },
  exec2: { email: 'ejecutivo2@test.axiom', env: 'TEST_PASSWORD_EXEC2' },
} as const;
export type UserKey = keyof typeof USERS;

export function passwordOf(key: UserKey): string {
  const password = process.env[USERS[key].env];
  if (!password) throw new Error(`Falta ${USERS[key].env} (ejecuta con \`bun run test:e2e\`)`);
  return password;
}

/** Inicia sesión por la pantalla de login y espera a estar dentro de la app. */
export async function loginAs(page: Page, key: UserKey): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(USERS[key].email);
  await page.getByLabel('Contraseña').fill(passwordOf(key));
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/mi-semana/);
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login/);
}

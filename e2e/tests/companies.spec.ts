import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';

test.describe('empresas', () => {
  test('buscar sin acentos, abrir la ficha y editar', async ({ page }) => {
    await loginAs(page, 'admin');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Empresas' })
      .click();
    await expect(page.getByRole('heading', { name: 'Empresas', level: 1 })).toBeVisible();

    // "nandu" (sin tilde ni ñ) encuentra «Ñandú Test S.A.»
    await page.getByLabel('Buscar empresas').fill('nandu');
    const row = page.getByLabel('Abrir ficha de Ñandú Test S.A.').filter({ visible: true });
    await expect(row).toBeVisible();
    await expect(page.getByLabel(/Abrir ficha de Empresa Sintética/)).toHaveCount(0);

    await row.click();
    await expect(page).toHaveURL(/\/empresas\/\d+/);
    await expect(page.getByRole('heading', { name: 'Ñandú Test S.A.', level: 1 })).toBeVisible();
    await expect(page.getByText('RUC TST000000001')).toBeVisible();
    // El ADMIN ve la cédula del representante
    await expect(page.getByText('Cédula del representante')).toBeVisible();

    await page.getByRole('button', { name: 'Editar empresa' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar empresa' });
    await dialog.getByLabel('Empleados').fill('321');
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Empresa actualizada')).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('321', { exact: true })).toBeVisible();

    // Persistió: tras recargar sigue ahí
    await page.reload();
    await expect(page.getByText('321', { exact: true })).toBeVisible();
  });

  test('el EJECUTIVO ve la ficha pero no la cédula del representante', async ({ page }) => {
    await loginAs(page, 'exec1');
    await page.goto('/empresas');
    await page.getByLabel('Buscar empresas').fill('nandu');
    await page.getByLabel('Abrir ficha de Ñandú Test S.A.').filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: 'Ñandú Test S.A.', level: 1 })).toBeVisible();
    await expect(page.getByText('Representante legal')).toBeVisible();
    await expect(page.getByText('Cédula del representante')).toHaveCount(0);
  });

  test('crear una empresa nueva abre su ficha y un RUC repetido se rechaza', async ({ page }) => {
    const ruc = `E2E${Date.now().toString(36).toUpperCase()}`;
    await loginAs(page, 'admin');
    await page.goto('/empresas');
    await page.getByRole('button', { name: 'Nueva empresa' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva empresa' });
    await dialog.getByLabel('RUC').fill(ruc);
    await dialog.getByLabel('Razón social').fill('Empresa Creada Por E2E S.A.');
    await dialog.getByRole('button', { name: /Crear|Guardar/ }).click();
    await expect(page).toHaveURL(/\/empresas\/\d+/);
    await expect(
      page.getByRole('heading', { name: 'Empresa Creada Por E2E S.A.', level: 1 }),
    ).toBeVisible();

    await page.goto('/empresas');
    await page.getByRole('button', { name: 'Nueva empresa' }).click();
    const again = page.getByRole('dialog', { name: 'Nueva empresa' });
    await again.getByLabel('RUC').fill(ruc);
    await again.getByLabel('Razón social').fill('Duplicada');
    await again.getByRole('button', { name: /Crear|Guardar/ }).click();
    await expect(page.getByText('Ya existe una empresa con este RUC.')).toBeVisible();
  });
});

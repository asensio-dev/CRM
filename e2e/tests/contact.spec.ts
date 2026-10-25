import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';

test('registrar un contacto en la ficha agrega una entrada a la línea de tiempo y mueve el estado', async ({
  page,
}) => {
  const note = `Llamada de prueba E2E ${Date.now()}`;
  await loginAs(page, 'supervisor');
  await page.goto('/empresas');
  await page.getByLabel('Buscar empresas').fill('Empresa Sintética 150');
  await page
    .getByLabel('Abrir ficha de Empresa Sintética 150 S.A.')
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Empresa Sintética 150 S.A.', level: 1 }),
  ).toBeVisible();
  await expect(page.getByText('Aún no hay contactos ni cambios de estado.')).toBeVisible();

  await page.getByRole('button', { name: 'Registrar contacto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registrar contacto' });
  await dialog.getByLabel('Canal').selectOption({ label: 'WhatsApp' });
  await dialog.getByLabel('Resultado').selectOption({ label: 'Interesado' });
  await dialog.getByLabel('Notas').fill(note);
  await dialog.getByRole('button', { name: 'Registrar', exact: true }).click();

  // El resumen muestra las transiciones automáticas (POR_CONTACTAR → CONTACTADO → CON_RESPUESTA)
  await expect(page.getByTestId('contact-result')).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();

  const timeline = page
    .getByRole('heading', { name: 'Línea de tiempo' })
    .locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  await expect(timeline.getByText(note)).toBeVisible();
  const interaction = timeline.locator('[data-entry-type="INTERACTION"]');
  await expect(interaction).toHaveCount(1);
  await expect(interaction).toContainText('WhatsApp');
  await expect(interaction).toContainText('Interesado');
  await expect(timeline.locator('[data-entry-type="STATUS_CHANGE"]')).toHaveCount(2);
  await expect(page.getByText('Con respuesta').first()).toBeVisible();

  // Persistió en el servidor
  await page.reload();
  await expect(page.getByText(note)).toBeVisible();
});

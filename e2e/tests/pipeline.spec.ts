import { expect, type Page, test } from '@playwright/test';
import { loginAs } from '../support/auth';

/** Empresas de una columna, leídas del aria-label "Contactado, 12 empresas". */
async function columnCount(page: Page, status: string): Promise<number> {
  const label = await page.locator(`section[data-status="${status}"]`).getAttribute('aria-label');
  const match = /(\d[\d.,\s ]*) empresas$/.exec(label ?? '');
  if (!match?.[1]) throw new Error(`No se pudo leer el conteo de ${status}: ${label}`);
  return Number(match[1].replace(/\D/g, ''));
}

test.describe('pipeline (kanban)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Pipeline' })
      .click();
    await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
    // El tablero oculta por defecto "Por contactar" y "Descartado"; estas pruebas los usan.
    await page.getByRole('switch', { name: /Por contactar y descartadas/ }).check();
    await expect(
      page.locator('section[data-status="POR_CONTACTAR"] [data-testid^="card-"]').first(),
    ).toBeVisible();
  });

  test('mover una tarjeta con el menú "Mover a…" cambia los conteos', async ({ page }) => {
    const before = {
      from: await columnCount(page, 'POR_CONTACTAR'),
      to: await columnCount(page, 'CONTACTADO'),
    };
    const card = page
      .locator('section[data-status="POR_CONTACTAR"] [data-testid^="card-"]')
      .first();
    await card.getByRole('button', { name: /^Mover a…/ }).click();
    await page.getByRole('menuitem', { name: 'Contactado' }).click();

    await expect.poll(() => columnCount(page, 'POR_CONTACTAR')).toBe(before.from - 1);
    await expect.poll(() => columnCount(page, 'CONTACTADO')).toBe(before.to + 1);
  });

  test('descartar pide una nota obligatoria', async ({ page }) => {
    const before = await columnCount(page, 'DESCARTADO');
    const card = page
      .locator('section[data-status="POR_CONTACTAR"] [data-testid^="card-"]')
      .first();
    await card.getByRole('button', { name: /^Mover a…/ }).click();
    await page.getByRole('menuitem', { name: 'Descartado' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox').fill('No le interesa (prueba E2E)');
    await dialog.getByRole('button', { name: 'Mover a Descartado' }).click();
    await expect.poll(() => columnCount(page, 'DESCARTADO')).toBe(before + 1);
  });

  test('arrastrar y soltar una tarjeta en otra columna (dnd-kit, sensor de ratón)', async ({
    page,
  }) => {
    const before = {
      from: await columnCount(page, 'POR_CONTACTAR'),
      to: await columnCount(page, 'CONTACTADO'),
    };
    const card = page
      .locator('section[data-status="POR_CONTACTAR"] [data-testid^="card-"]')
      .first();
    const target = page.locator('section[data-status="CONTACTADO"]');
    await card.scrollIntoViewIfNeeded();

    const from = await card.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('No se pudo medir la tarjeta o la columna');
    // Se agarra por un punto de la tarjeta alejado del botón del menú (esquina superior derecha)
    const start = { x: from.x + from.width / 2, y: from.y + from.height - 8 };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 12, start.y + 12, { steps: 4 }); // supera la distancia de activación
    await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 12 });
    // la columna destino se resalta cuando el backend confirmó que la transición es válida
    await expect(target).toHaveAttribute('data-drop-allowed', 'true');
    await page.mouse.up();

    await expect.poll(() => columnCount(page, 'POR_CONTACTAR')).toBe(before.from - 1);
    await expect.poll(() => columnCount(page, 'CONTACTADO')).toBe(before.to + 1);
  });

  test('una transición no permitida no mueve la tarjeta (POR_CONTACTAR → CONTRATO_ACTIVO)', async ({
    page,
  }) => {
    const before = await columnCount(page, 'POR_CONTACTAR');
    const card = page
      .locator('section[data-status="POR_CONTACTAR"] [data-testid^="card-"]')
      .first();
    await card.getByRole('button', { name: /^Mover a…/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Contactado' })).toBeVisible();
    // El menú solo ofrece los destinos que el backend permite
    await expect(page.getByRole('menuitem', { name: 'Contrato activo' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    expect(await columnCount(page, 'POR_CONTACTAR')).toBe(before);
  });
});

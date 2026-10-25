import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';

test('el ADMIN importa un .xlsx sintético y ve el trabajo completarse', async ({
  page,
}, testInfo) => {
  const prefix = `E2I${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
  const file = testInfo.outputPath('empresas-e2e.xlsx');
  // Playwright corre en Node y no puede cargar exceljs: el libro se genera en un proceso de Bun
  const backend = resolve(import.meta.dirname, '../../backend');
  execFileSync(process.env.BUN_BIN ?? 'bun', ['test/support/write-xlsx.ts', file, prefix, '4'], {
    cwd: backend,
  });

  await loginAs(page, 'admin');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Importación' })
    .click();
  await expect(page.getByRole('heading', { name: 'Importación', level: 1 })).toBeVisible();

  await page.getByLabel('Archivo Excel (.xlsx)').setInputFiles(file);
  await expect(page.getByText('Importación iniciada')).toBeVisible();
  await expect(page.getByText('empresas-e2e.xlsx').first()).toBeVisible();
  await expect(page.getByText('Completado', { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });

  // Las empresas importadas ya se pueden buscar
  await page.goto('/empresas');
  await page.getByLabel('Buscar empresas').fill(prefix);
  await expect(
    page
      .getByLabel(new RegExp(`Abrir ficha de Importada Sintética ${prefix}`))
      .filter({ visible: true }),
  ).toHaveCount(4);
});

test('un archivo que no es .xlsx se rechaza en el cliente', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('datos.csv');
  await writeFile(file, 'RUC,RAZONSOCIAL_EMPRESA\nX1,Y\n');
  await loginAs(page, 'admin');
  await page.goto('/importacion');
  await page.getByLabel('Archivo Excel (.xlsx)').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText(/xlsx/i);
});

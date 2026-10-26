import { expect, type Page, test } from '@playwright/test';
import { apiAs } from '../support/api';
import { loginAs, logout } from '../support/auth';

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name, exact: true });

/** Un flujo de humo por pantalla de la ola 3. Los dos primeros comparten la rotación ejecutada. */
test.describe
  .serial('pantallas de la ola 3', () => {
    test('Mi semana: el ADMIN ejecuta la rotación y el EJECUTIVO ve su plan de ≥ 20 empresas', async ({
      page,
    }) => {
      await loginAs(page, 'admin');
      await nav(page, 'Mi semana').click();
      await expect(page.getByText('Aún no hay un ciclo activo')).toBeVisible();

      await page.getByRole('button', { name: 'Ejecutar rotación semanal' }).click();
      await page.getByRole('button', { name: 'Ejecutar ahora' }).click();
      // El resumen sobrevive al refresco de la pantalla (el diálogo vive fuera del estado vacío).
      await expect(page.getByTestId('run-weekly-result')).toContainText('abierto');
      await page.getByRole('button', { name: 'Listo' }).click();
      await expect(page.getByText('Aún no hay un ciclo activo')).toBeHidden();
      await expect(page.getByRole('combobox', { name: 'Ejecutivo' })).toBeVisible();
      await logout(page);

      await loginAs(page, 'exec1');
      await expect(page.getByRole('heading', { name: 'Mi semana', level: 1 })).toBeVisible();
      const plan = page.getByRole('list', { name: 'Plan semanal' });
      await expect(plan).toBeVisible();
      // El plan se pagina de 7 en 7; el total (≥ 20) se lee del pie de paginación.
      await expect(plan.locator('> li')).toHaveCount(7);
      const range = await page.getByText(/^1–7 de \d+ empresas$/).textContent();
      expect(Number(range?.match(/de (\d+)/)?.[1])).toBeGreaterThanOrEqual(20);
    });

    test('Cartera: el SUPERVISOR ve la cobertura de ambos ejecutivos y sus asignaciones', async ({
      page,
    }) => {
      await loginAs(page, 'supervisor');
      await nav(page, 'Cartera').click();
      await expect(page.getByRole('heading', { name: 'Cartera', level: 1 })).toBeVisible();
      const cycle = page.getByRole('region', { name: 'Ciclo actual' });
      await expect(cycle).toContainText('Ejecutivo Uno');
      await expect(cycle).toContainText('Ejecutivo Dos');
      const assignments = page.getByRole('region', { name: 'Asignaciones' });
      await expect(assignments.getByRole('button', { name: /^Liberar / }).first()).toBeVisible();
    });

    test('Tablero: muestra los indicadores y el embudo', async ({ page }) => {
      await loginAs(page, 'admin');
      await nav(page, 'Tablero').click();
      await expect(page.getByRole('heading', { name: 'Tablero', level: 1 })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Indicadores clave' })).toBeVisible();
      const funnel = page.getByRole('list', { name: 'Etapas del embudo' });
      await expect(funnel).toBeVisible();
      expect(await funnel.locator('> li').count()).toBeGreaterThanOrEqual(5);
    });

    test('Citas: agendar desde la pantalla una cita para una empresa CON_RESPUESTA y verla en la lista', async ({
      page,
      request,
    }) => {
      const name = `Empresa Citas E2E ${Date.now().toString(36)}`;
      await (await apiAs(request, 'admin')).companyWithResponse(name);

      await loginAs(page, 'admin');
      await nav(page, 'Citas').click();
      await expect(page.getByRole('heading', { name: 'Citas', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Nueva cita' }).click();

      const dialog = page.getByRole('dialog', { name: 'Agendar cita' });
      await dialog.getByLabel('Empresa').click();
      await page.getByRole('combobox', { name: 'Nombre o RUC de la empresa' }).fill(name);
      await page.getByRole('option', { name }).click();
      const when = `${new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 11)}10:00`;
      await dialog.getByLabel('Fecha y hora (Managua)').fill(when);
      await dialog.getByLabel('Modalidad').selectOption({ label: 'Telefónica' });
      await dialog.getByRole('button', { name: 'Agendar cita' }).click();
      await expect(page.getByText(`Cita agendada con ${name}.`)).toBeVisible();

      await page.getByRole('tab', { name: 'Lista' }).click();
      await expect(page.getByText(name).first()).toBeVisible();
    });

    test('Contratos: crear un contrato para una empresa con cita y verlo como Borrador', async ({
      page,
      request,
    }) => {
      const name = `Empresa Contratos E2E ${Date.now().toString(36)}`;
      const api = await apiAs(request, 'admin');
      const company = await api.companyWithResponse(name);
      await api.post('/appointments', {
        companyId: company.id,
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        mode: 'VIRTUAL',
      });

      await loginAs(page, 'admin');
      await nav(page, 'Contratos').click();
      await expect(page.getByRole('heading', { name: 'Contratos', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Nuevo contrato' }).click();

      const dialog = page.getByRole('dialog', { name: 'Crear contrato' });
      await dialog.getByLabel('Empresa').click();
      await page.getByRole('combobox', { name: 'Nombre o RUC de la empresa' }).fill(name);
      await page.getByRole('option', { name }).click();
      await dialog.getByLabel('Inicio').fill(new Date().toISOString().slice(0, 10));
      await dialog.getByLabel('Monto').fill('2500.50');
      await dialog.getByRole('button', { name: 'Crear contrato' }).click();

      // Al crear, la pantalla abre el detalle del contrato nuevo (Borrador)
      const detail = page.getByRole('dialog', { name: /^CT-\d{4}-\d{6} Borrador$/ });
      await expect(detail).toBeVisible();
      await expect(detail.getByRole('link', { name })).toBeVisible();
      await expect(detail).toContainText('2,500.50');
      const code =
        /CT-\d{4}-\d{6}/.exec((await detail.getByRole('heading').textContent()) ?? '')?.[0] ?? '';
      await detail.getByRole('button', { name: 'Cerrar' }).first().click();

      // y aparece en el listado
      const row = page.getByRole('row').filter({ hasText: code });
      await expect(row).toContainText(name);
      await expect(row).toContainText('Borrador');
    });
  });

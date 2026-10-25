import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * BUG CONOCIDO (rotación del refresh token sin ventana de gracia): si se recarga la página mientras
 * la restauración de sesión (POST /api/auth/refresh) sigue en vuelo, el servidor ya rotó el token pero
 * el navegador no llegó a guardar la cookie nueva; la siguiente carga reutiliza el token viejo, se
 * interpreta como robo y se revoca toda la familia: el usuario queda en /login.
 * `test.fail` mantiene la suite en verde mientras exista; cuando se corrija, Playwright avisará para
 * quitarlo.
 */
test('recargar dos veces seguidas no debería cerrar la sesión (BUG: carrera de refresh)', async ({
  page,
}) => {
  test.fail(true, 'Rotación de refresh sin ventana de gracia: ver comentario del archivo');
  await loginAs(page, 'exec2');
  for (let i = 0; i < 3; i++) {
    await page.goto('/pipeline');
    await page.reload();
  }
  await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
});

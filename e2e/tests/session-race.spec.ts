import { expect, test } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * BUG CONOCIDO (rotación del refresh token sin ventana de gracia): si se recarga la página mientras
 * la restauración de sesión (POST /api/auth/refresh) sigue en vuelo, el servidor ya rotó el token pero
 * el navegador no llegó a guardar la cookie nueva; la siguiente carga reutiliza el token viejo, se
 * interpreta como robo y se revoca toda la familia: el usuario queda en /login.
 *
 * Determinista: la petición de refresh llega al servidor (que rota el token) pero se aborta antes de
 * que el navegador reciba la respuesta, justo lo que pasa al recargar con la petición en vuelo.
 * `test.fail` mantiene la suite en verde mientras exista el bug; cuando se corrija, Playwright avisará
 * para quitarlo.
 */
test('un refresh interrumpido tras rotar el token no debería cerrar la sesión (BUG: carrera de refresh)', async ({
  page,
}) => {
  test.fail(true, 'Rotación de refresh sin ventana de gracia: ver comentario del archivo');
  await loginAs(page, 'exec2');

  let interrupted = false;
  await page.route('**/api/auth/refresh', async (route) => {
    if (interrupted) return route.continue();
    interrupted = true;
    const response = await route.fetch(); // el servidor rota el token…
    await response.dispose();
    await route.abort('failed'); // …pero el navegador nunca ve la respuesta
  });

  await page.goto('/pipeline'); // la restauración de sesión falla a mitad de camino
  await page.unroute('**/api/auth/refresh');
  await page.goto('/pipeline'); // segunda carga con la cookie que tenía el navegador
  await expect(page.getByRole('heading', { name: 'Pipeline', level: 1 })).toBeVisible();
});

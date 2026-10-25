/**
 * Servidor de la API para las pruebas E2E (Playwright): el AppModule real contra AxiomCRM_Test,
 * con el mismo cableado que main.ts pero sin el límite de intentos de login (los navegadores de
 * las pruebas comparten IP). Lo arranca e2e/playwright.config.ts con PORT y las variables de
 * backend/.env.test. Nunca se usa fuera de pruebas: exige que DATABASE_URL sea AxiomCRM_Test.
 */
import { bootApp } from './app';

const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) throw new Error('PORT inválido para el servidor E2E');

const t = await bootApp({ port, throttling: false });
console.log(`API E2E lista en ${t.baseUrl}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void t.close().finally(() => process.exit(0)));
}

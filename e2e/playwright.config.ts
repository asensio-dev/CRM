/**
 * E2E con Playwright (solo Chromium). No lo ejecutes directamente: `bun run test:e2e` recrea la
 * base AxiomCRM_Test, elige puertos libres y exporta E2E_API_PORT / E2E_WEB_PORT y las variables de
 * backend/.env.test. Aquí se arrancan la API (contra AxiomCRM_Test) y Vite con su proxy /api
 * apuntando a ella.
 */
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT;
const webPort = process.env.E2E_WEB_PORT;
if (!apiPort || !webPort || !process.env.DATABASE_URL?.includes('AxiomCRM_Test')) {
  throw new Error(
    'Ejecuta las pruebas E2E con `bun run test:e2e` (prepara la base AxiomCRM_Test).',
  );
}

const root = resolve(import.meta.dirname, '..');
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1, // las pruebas comparten una base de datos
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    locale: 'es-NI',
    timezoneId: 'America/Managua',
    trace: 'retain-on-failure', // contiene tokens: test-results/ está en .gitignore
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'bun test/support/e2e-server.ts',
      cwd: resolve(root, 'backend'),
      env: { PORT: apiPort, NODE_ENV: 'test' },
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `bun run dev --host 127.0.0.1 --port ${webPort}`,
      cwd: resolve(root, 'frontend'),
      env: { API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

/**
 * Ejecuta las pruebas E2E (Playwright, Chromium) contra AxiomCRM_Test:
 *  1. Recrea y siembra la base de pruebas (backend/scripts/test-db.ts) salvo con --no-reset.
 *  2. Carga backend/.env.test (URL de la base de pruebas, secretos y contraseñas generados).
 *  3. Elige dos puertos libres para la API y Vite.
 *  4. Lanza `playwright test` (que arranca ambos servidores y los detiene al terminar).
 *
 * Primera vez en una máquina: `bunx playwright install chromium`.
 * Uso: bun run test:e2e [--no-reset] [argumentos de playwright…]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const backendDir = join(root, 'backend');
const args = process.argv.slice(2);
const reset = !args.includes('--no-reset');
const passthrough = args.filter((a) => a !== '--no-reset');

if (reset) {
  const prep = Bun.spawnSync(['bun', 'scripts/test-db.ts'], {
    cwd: backendDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (prep.exitCode !== 0) process.exit(prep.exitCode ?? 1);
}

const envFile = join(backendDir, '.env.test');
if (!existsSync(envFile)) {
  console.error('Falta backend/.env.test: ejecuta `bun run --filter @axiom/backend test:db`.');
  process.exit(1);
}
const testEnv: Record<string, string> = {};
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m?.[1]) testEnv[m[1]] = (m[2] ?? '').trim().replace(/^["']|["']$/g, '');
}

function freePort(): number {
  const server = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = server.port;
  server.stop(true);
  return port;
}

const run = Bun.spawnSync(
  ['bunx', 'playwright', 'test', '-c', 'e2e/playwright.config.ts', ...passthrough],
  {
    cwd: root,
    env: {
      ...process.env,
      ...testEnv,
      BUN_BIN: process.execPath, // los specs de Node lanzan procesos de Bun (p. ej. generar el .xlsx)
      E2E_API_PORT: String(freePort()),
      E2E_WEB_PORT: String(freePort()),
    },
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
process.exit(run.exitCode ?? 1);

/**
 * Ejecuta las pruebas de integración contra AxiomCRM_Test:
 *  1. Recrea y siembra la base (scripts/test-db.ts) salvo que pases --no-reset.
 *  2. Carga backend/.env.test en el entorno del proceso de prueba (el entorno explícito gana a
 *     cualquier backend/.env, así que la base de desarrollo nunca se usa).
 *  3. bun test test/integration [argumentos…]
 *
 * Uso: bun run test:integration [--no-reset] [filtro-o-archivo…]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const backendDir = join(import.meta.dir, '..');
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
  console.error('Falta backend/.env.test: ejecuta `bun run test:db` primero.');
  process.exit(1);
}
const testEnv: Record<string, string> = {};
for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m?.[1]) testEnv[m[1]] = (m[2] ?? '').trim().replace(/^["']|["']$/g, '');
}

const run = Bun.spawnSync(
  [
    'bun',
    'test',
    '--timeout',
    '90000',
    ...(passthrough.length ? passthrough : ['test/integration']),
  ],
  { cwd: backendDir, env: { ...process.env, ...testEnv }, stdout: 'inherit', stderr: 'inherit' },
);
process.exit(run.exitCode ?? 1);

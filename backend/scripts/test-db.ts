/**
 * Prepara la base de pruebas AxiomCRM_Test en el MISMO servidor que DATABASE_URL:
 *  1. La elimina si existe y la crea de nuevo (collation Modern_Spanish_CI_AS).
 *  2. Aplica `prisma migrate deploy` sobre ella.
 *  3. Siembra datos sintéticos deterministas (test/support/seed-test-data.ts).
 *  4. Escribe backend/.env.test (ignorado por git) con la URL de la base de pruebas, secretos JWT
 *     aleatorios y las contraseñas de los usuarios de prueba. Nunca se imprimen.
 *
 * DATABASE_URL (entorno o backend/.env) solo aporta servidor y credenciales: el nombre de la base
 * se fuerza a AxiomCRM_Test. Nunca se toca la base de desarrollo.
 *
 * Uso: bun run test:db   (desde backend/)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../src/generated/prisma/client';
import { randomSecret, seedTestData } from '../test/support/seed-test-data';
import {
  assertTestDatabase,
  passwordVar,
  TEST_DB_NAME,
  TEST_USERS,
  withDatabase,
} from '../test/support/test-database';

const backendDir = join(import.meta.dir, '..');
const envTestPath = join(backendDir, '.env.test');

function readDotenvValue(file: string, key: string): string | undefined {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = new RegExp(`^${key}\\s*=\\s*(.*)$`).exec(line);
    if (m) return (m[1] ?? '').trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

const baseUrl =
  process.env.DATABASE_URL || readDotenvValue(join(backendDir, '.env'), 'DATABASE_URL');
if (!baseUrl) {
  console.error(
    'DATABASE_URL no está definida (entorno o backend/.env): no se sabe en qué servidor crear la base.',
  );
  process.exit(1);
}
const testUrl = withDatabase(baseUrl, TEST_DB_NAME);
assertTestDatabase(testUrl);

// 1. Recrear la base (conectando a master del mismo servidor)
const admin = new PrismaClient({ adapter: new PrismaMssql(withDatabase(baseUrl, 'master')) });
try {
  await admin.$executeRawUnsafe(
    `IF DB_ID(N'${TEST_DB_NAME}') IS NOT NULL BEGIN ALTER DATABASE [${TEST_DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${TEST_DB_NAME}]; END`,
  );
  await admin.$executeRawUnsafe(`CREATE DATABASE [${TEST_DB_NAME}] COLLATE Modern_Spanish_CI_AS`);
} finally {
  await admin.$disconnect();
}

// 2. Migraciones (DATABASE_URL explícita: el entorno gana a backend/.env)
const migrate = Bun.spawnSync(['bunx', 'prisma', 'migrate', 'deploy'], {
  cwd: backendDir,
  env: { ...process.env, DATABASE_URL: testUrl },
  stdout: 'pipe',
  stderr: 'pipe',
});
if (migrate.exitCode !== 0) {
  console.error('prisma migrate deploy falló:');
  console.error(migrate.stdout.toString(), migrate.stderr.toString());
  process.exit(migrate.exitCode ?? 1);
}

// 3. Datos sintéticos
const prisma = new PrismaClient({ adapter: new PrismaMssql(testUrl) });
let passwords: Awaited<ReturnType<typeof seedTestData>>['passwords'];
try {
  ({ passwords } = await seedTestData(prisma));
} finally {
  await prisma.$disconnect();
}

// 4. .env.test (gitignored)
const lines = [
  '# Generado por scripts/test-db.ts — NO versionar (está en .gitignore)',
  `DATABASE_URL="${testUrl}"`,
  'SHADOW_DATABASE_URL=',
  `JWT_ACCESS_SECRET=${randomSecret()}`,
  `JWT_REFRESH_SECRET=${randomSecret()}`,
  'JWT_ACCESS_TTL=15m',
  'JWT_REFRESH_TTL=7d',
  'TZ=America/Managua',
  ...TEST_USERS.map((u) => `${passwordVar(u.key)}=${passwords[u.key]}`),
  '',
];
writeFileSync(envTestPath, lines.join('\n'));
console.log(
  `Base ${TEST_DB_NAME} recreada, migrada y sembrada (300 empresas, ${TEST_USERS.length} usuarios). Credenciales en backend/.env.test.`,
);

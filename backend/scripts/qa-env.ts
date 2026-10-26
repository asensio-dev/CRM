/**
 * Entorno QA "tipo producción" sobre la base AxiomCRM_QA (ver docs/qa.md). Nunca toca AxiomCRM
 * (desarrollo) ni AxiomCRM_Test (pruebas).
 *
 *   bun run qa:setup [--server localhost] [--port 1433] [--reset]
 *       1. Crea AxiomCRM_QA (Modern_Spanish_CI_AS) si no existe (--reset la borra antes).
 *       2. Crea/actualiza dos logins de mínimo privilegio:
 *            axiom_qa_migrator → db_ddladmin + db_datareader + db_datawriter (solo `migrate deploy`)
 *            axiom_qa_app      → db_datareader + db_datawriter + EXECUTE (la API y los scripts)
 *       3. `prisma migrate deploy` con el login de migración y `prisma migrate status`.
 *       4. `prisma db seed` (parámetros, sectores, admin) con el login de la aplicación.
 *       5. Usuarios QA: 10 EJECUTIVO + 2 SUPERVISOR (misma contraseña generada, QA_USER_PASSWORD).
 *       6. Comprobaciones: CHECKs, índice único filtrado, columna calculada, índices, drift vacío y
 *          que el login de la app NO puede hacer DDL.
 *   bun scripts/qa-env.ts verify            solo el paso 6
 *   bun scripts/qa-env.ts rotate            ejecuta la rotación semanal (caso de uso real)
 *   bun scripts/qa-env.ts api               arranca la API con NODE_ENV=production contra QA
 *   bun scripts/qa-env.ts run -- <cmd…>     ejecuta un comando con el entorno QA (login de la app)
 *
 * Idempotente. Las contraseñas y secretos se generan la primera vez y se guardan SOLO en
 * backend/.env.qa (ignorado por git, patrón `.env.*`); nunca se imprimen. La creación de la base y
 * de los logins usa autenticación de Windows (`sqlcmd -E`) y el SQL viaja por stdin.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const DB_NAME = 'AxiomCRM_QA';
const MIGRATOR = 'axiom_qa_migrator';
const APP_LOGIN = 'axiom_qa_app';
const FORBIDDEN_DBS = new Set(['axiomcrm', 'axiomcrm_test']);
const QA_USERS = [
  ...Array.from({ length: 10 }, (_, i) => ({
    email: `qa.ejecutivo${String(i + 1).padStart(2, '0')}@axiom.qa`,
    fullName: `Ejecutivo QA ${String(i + 1).padStart(2, '0')}`,
    role: 'EJECUTIVO',
  })),
  { email: 'qa.supervisor1@axiom.qa', fullName: 'Supervisor QA 1', role: 'SUPERVISOR' },
  { email: 'qa.supervisor2@axiom.qa', fullName: 'Supervisor QA 2', role: 'SUPERVISOR' },
] as const;

const backendDir = join(import.meta.dir, '..');
const envQaPath = join(backendDir, '.env.qa');

const separator = process.argv.indexOf('--');
const ownArgs = separator >= 0 ? process.argv.slice(2, separator) : process.argv.slice(2);
const passthrough = separator >= 0 ? process.argv.slice(separator + 1) : [];
const { values: flags, positionals } = parseArgs({
  args: ownArgs,
  allowPositionals: true,
  options: {
    server: { type: 'string', default: 'localhost' },
    port: { type: 'string', default: '1433' },
    reset: { type: 'boolean', default: false },
  },
});
const command = positionals[0] ?? 'setup';

// ───────────────────────────── .env.qa ─────────────────────────────

function randomSecret(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // Mayúscula + minúscula + dígito garantizados (política de contraseñas de SQL Server)
  return `Qa7${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

function readEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m?.[1]) out[m[1]] = (m[2] ?? '').trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function sqlUrl(server: string, port: string, user: string, password: string): string {
  // trustServerCertificate=true solo porque el servidor local usa un certificado autofirmado;
  // en un servidor QA/producción real va `false` con un certificado válido (docs/despliegue.md §2.3).
  return `sqlserver://${server}:${port};database=${DB_NAME};user=${user};password=${password};encrypt=true;trustServerCertificate=true`;
}

function loadOrCreateEnv(): Record<string, string> {
  const current = readEnvFile(envQaPath);
  const server = current.QA_SQL_SERVER || (flags.server as string);
  const port = current.QA_SQL_PORT || (flags.port as string);
  const v = {
    QA_SQL_SERVER: server,
    QA_SQL_PORT: port,
    QA_MIGRATOR_PASSWORD: current.QA_MIGRATOR_PASSWORD || randomSecret(29),
    QA_APP_PASSWORD: current.QA_APP_PASSWORD || randomSecret(29),
    JWT_ACCESS_SECRET: current.JWT_ACCESS_SECRET || randomSecret(48),
    JWT_REFRESH_SECRET: current.JWT_REFRESH_SECRET || randomSecret(48),
    SEED_ADMIN_EMAIL: current.SEED_ADMIN_EMAIL || 'admin@axiom.qa',
    SEED_ADMIN_PASSWORD: current.SEED_ADMIN_PASSWORD || randomSecret(17),
    QA_USER_PASSWORD: current.QA_USER_PASSWORD || randomSecret(17),
    PORT: current.PORT || '3100',
    CORS_ORIGIN: current.CORS_ORIGIN || 'http://localhost:4173',
    // La prueba de carga simula varios clientes tras un proxy local (X-Forwarded-For).
    TRUST_PROXY: current.TRUST_PROXY || 'loopback',
    TZ: 'America/Managua',
    JWT_ACCESS_TTL: current.JWT_ACCESS_TTL || '15m',
    JWT_REFRESH_TTL: current.JWT_REFRESH_TTL || '7d',
  };
  const env = {
    ...v,
    DATABASE_URL: sqlUrl(server, port, APP_LOGIN, v.QA_APP_PASSWORD),
    QA_MIGRATION_DATABASE_URL: sqlUrl(server, port, MIGRATOR, v.QA_MIGRATOR_PASSWORD),
  };
  const lines = [
    '# Generado por scripts/qa-env.ts — NO versionar (patrón .env.* en .gitignore)',
    ...Object.entries(env).map(([k, val]) => `${k}="${val}"`),
    '',
  ];
  writeFileSync(envQaPath, lines.join('\n'));
  return env;
}

function loadEnv(): Record<string, string> {
  if (!existsSync(envQaPath)) {
    console.error('Falta backend/.env.qa: ejecuta primero `bun run qa:setup`.');
    process.exit(1);
  }
  return readEnvFile(envQaPath);
}

/**
 * Entorno de los procesos QA: el de la consola + .env.qa. Bun carga backend/.env (desarrollo) al
 * arrancar cualquier proceso en backend/, pero las variables del proceso tienen prioridad, así que
 * se fijan explícitamente (y se vacían las de desarrollo que no deben heredarse).
 */
function qaProcessEnv(qa: Record<string, string>, databaseUrl = qa.DATABASE_URL) {
  const url = databaseUrl ?? '';
  const dbMatch = /database=([^;]+)/i.exec(url);
  if (!dbMatch?.[1] || FORBIDDEN_DBS.has(dbMatch[1].toLowerCase())) {
    throw new Error('La URL QA no apunta a AxiomCRM_QA: abortado.');
  }
  return {
    ...process.env,
    ...qa,
    DATABASE_URL: url,
    SHADOW_DATABASE_URL: '',
    SEED_DEMO_PASSWORD: '',
  } as Record<string, string>;
}

// ───────────────────────────── utilidades ─────────────────────────────

async function sqlcmd(server: string, port: string, sql: string, database = 'master') {
  const proc = Bun.spawn(
    ['sqlcmd', '-S', `${server},${port}`, '-E', '-C', '-I', '-b', '-d', database, '-h', '-1', '-W'],
    { stdin: new TextEncoder().encode(sql), stdout: 'pipe', stderr: 'pipe' },
  );
  const [code, out, err] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`sqlcmd falló (${code}): ${err || out}`);
  return out;
}

function run(cmd: string[], env: Record<string, string>, label: string, quiet = false): string {
  const p = Bun.spawnSync(cmd, { cwd: backendDir, env, stdout: 'pipe', stderr: 'pipe' });
  const out = `${p.stdout.toString()}${p.stderr.toString()}`;
  if (p.exitCode !== 0) {
    console.error(`${label} falló:\n${out}`);
    process.exit(p.exitCode ?? 1);
  }
  if (!quiet) console.log(`✔ ${label}`);
  return out;
}

// ───────────────────────────── pasos ─────────────────────────────

async function createDatabaseAndLogins(env: Record<string, string>) {
  const { QA_SQL_SERVER: server = 'localhost', QA_SQL_PORT: port = '1433' } = env;
  if (flags.reset) {
    await sqlcmd(
      server,
      port,
      `IF DB_ID(N'${DB_NAME}') IS NOT NULL BEGIN ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${DB_NAME}]; END`,
    );
    console.log(`✔ ${DB_NAME} eliminada (--reset)`);
  }
  const login = (name: string, password: string) => `
IF SUSER_ID(N'${name}') IS NULL
  CREATE LOGIN [${name}] WITH PASSWORD = N'${password}', CHECK_POLICY = ON, DEFAULT_DATABASE = [${DB_NAME}];
ELSE
  ALTER LOGIN [${name}] WITH PASSWORD = N'${password}', DEFAULT_DATABASE = [${DB_NAME}];`;
  const user = (name: string, roles: string[], dropRoles: string[]) => `
IF USER_ID(N'${name}') IS NULL CREATE USER [${name}] FOR LOGIN [${name}];
${roles.map((r) => `ALTER ROLE [${r}] ADD MEMBER [${name}];`).join('\n')}
${dropRoles
  .map((r) => `IF IS_ROLEMEMBER(N'${r}', N'${name}') = 1 ALTER ROLE [${r}] DROP MEMBER [${name}];`)
  .join('\n')}`;
  await sqlcmd(
    server,
    port,
    `SET NOCOUNT ON;
IF DB_ID(N'${DB_NAME}') IS NULL CREATE DATABASE [${DB_NAME}] COLLATE Modern_Spanish_CI_AS;
GO
${login(MIGRATOR, env.QA_MIGRATOR_PASSWORD ?? '')}
${login(APP_LOGIN, env.QA_APP_PASSWORD ?? '')}
GO
USE [${DB_NAME}];
${user(MIGRATOR, ['db_ddladmin', 'db_datareader', 'db_datawriter'], ['db_owner'])}
${user(APP_LOGIN, ['db_datareader', 'db_datawriter'], ['db_owner', 'db_ddladmin', 'db_securityadmin'])}
GRANT EXECUTE TO [${APP_LOGIN}];
GO
`,
  );
  console.log(`✔ Base ${DB_NAME} y logins ${MIGRATOR} / ${APP_LOGIN} listos`);
}

function migrate(env: Record<string, string>) {
  const migEnv = qaProcessEnv(env, env.QA_MIGRATION_DATABASE_URL);
  run(['bunx', 'prisma', 'migrate', 'deploy'], migEnv, `prisma migrate deploy (${MIGRATOR})`);
  const status = run(
    ['bunx', 'prisma', 'migrate', 'status'],
    migEnv,
    'prisma migrate status',
    true,
  );
  const upToDate = /Database schema is up to date/i.test(status);
  console.log(`${upToDate ? '✔' : '✖'} migrate status: ${upToDate ? 'al día' : 'PENDIENTE'}`);
  if (!upToDate) process.exit(1);
}

function seed(env: Record<string, string>) {
  run(['bunx', 'prisma', 'db', 'seed'], qaProcessEnv(env), `prisma db seed (${APP_LOGIN})`);
}

async function seedQaUsers(env: Record<string, string>) {
  process.env.DATABASE_URL = qaProcessEnv(env).DATABASE_URL;
  const { PrismaMssql } = await import('@prisma/adapter-mssql');
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const prisma = new PrismaClient({ adapter: new PrismaMssql(process.env.DATABASE_URL) });
  const password = env.QA_USER_PASSWORD ?? '';
  let created = 0;
  let updated = 0;
  try {
    for (const u of QA_USERS) {
      const existing = await prisma.user.findUnique({ where: { email: u.email } });
      if (!existing) {
        const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
        await prisma.user.create({ data: { ...u, passwordHash } });
        created++;
      } else if (
        !existing.isActive ||
        !(await Bun.password.verify(password, existing.passwordHash))
      ) {
        const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
        await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, isActive: true },
        });
        updated++;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(
    `✔ Usuarios QA: ${created} creados, ${updated} actualizados, ${QA_USERS.length - created - updated} sin cambios`,
  );
}

async function verify(env: Record<string, string>) {
  const { QA_SQL_SERVER: server = 'localhost', QA_SQL_PORT: port = '1433' } = env;
  const out = await sqlcmd(
    server,
    port,
    `SET NOCOUNT ON;
SELECT 'collation=' + CONVERT(nvarchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation'));
SELECT 'checks=' + CAST(COUNT(*) AS varchar(10)) FROM sys.check_constraints;
SELECT 'filtered_unique=' + CAST(COUNT(*) AS varchar(10)) FROM sys.indexes
  WHERE name = 'portfolio_assignments_one_active_per_company' AND is_unique = 1 AND has_filter = 1;
SELECT 'computed_searchText=' + CAST(COUNT(*) AS varchar(10)) FROM sys.computed_columns
  WHERE object_id = OBJECT_ID('dbo.companies') AND name = 'searchText' AND is_persisted = 1;
SELECT 'indexes=' + CAST(COUNT(*) AS varchar(10)) FROM sys.indexes i
  JOIN sys.tables t ON t.object_id = i.object_id WHERE i.type > 0;
SELECT 'idx:' + t.name + '.' + i.name FROM sys.indexes i JOIN sys.tables t ON t.object_id = i.object_id
  WHERE i.type = 2 ORDER BY t.name, i.name;
SELECT 'migrations=' + CAST(COUNT(*) AS varchar(10)) FROM dbo._prisma_migrations WHERE finished_at IS NOT NULL;
SELECT 'app_roles=' + ISNULL(STRING_AGG(r.name, ','), '') FROM sys.database_role_members m
  JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
  JOIN sys.database_principals u ON u.principal_id = m.member_principal_id WHERE u.name = N'${APP_LOGIN}';
`,
    DB_NAME,
  );
  const lines = out.split(/\r?\n/).filter(Boolean);
  const get = (k: string) => lines.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1);
  const indexLines = lines.filter((l) => l.startsWith('idx:'));
  console.log('Comprobaciones de esquema (AxiomCRM_QA):');
  for (const k of [
    'collation',
    'migrations',
    'checks',
    'filtered_unique',
    'computed_searchText',
    'indexes',
    'app_roles',
  ]) {
    console.log(`  ${k.padEnd(20)} ${get(k)}`);
  }
  console.log(`  índices no agrupados: ${indexLines.length}`);
  for (const l of indexLines) console.log(`    ${l.slice(4)}`);

  // Drift: el esquema de Prisma frente a la base QA debe ser idéntico.
  const diff = run(
    [
      'bunx',
      'prisma',
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
    ],
    qaProcessEnv(env, env.QA_MIGRATION_DATABASE_URL),
    'prisma migrate diff',
    true,
  );
  const empty = /empty migration/i.test(diff) || diff.replace(/--.*$/gm, '').trim() === '';
  console.log(`  drift (migrate diff)  ${empty ? 'vacío' : 'HAY DIFERENCIAS'}`);

  // Mínimo privilegio: la app lee/escribe pero no puede hacer DDL.
  const { PrismaMssql } = await import('@prisma/adapter-mssql');
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const prisma = new PrismaClient({ adapter: new PrismaMssql(qaProcessEnv(env).DATABASE_URL) });
  let ddlBlocked = false;
  try {
    const perms = await prisma.$queryRawUnsafe<{ owner: number; ddl: number; create: number }[]>(
      `SELECT IS_ROLEMEMBER('db_owner') AS owner, IS_ROLEMEMBER('db_ddladmin') AS ddl,
              HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS [create]`,
    );
    try {
      await prisma.$executeRawUnsafe('CREATE TABLE [dbo].[__qa_ddl_probe] ([i] INT)');
      await prisma.$executeRawUnsafe('DROP TABLE [dbo].[__qa_ddl_probe]');
    } catch {
      ddlBlocked = true;
    }
    const p = perms[0];
    console.log(
      `  login app: db_owner=${p?.owner} db_ddladmin=${p?.ddl} CREATE TABLE=${p?.create} → DDL ${ddlBlocked ? 'bloqueado' : 'PERMITIDO'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
  const ok =
    empty &&
    ddlBlocked &&
    get('filtered_unique') === '1' &&
    get('computed_searchText') === '1' &&
    get('collation') === 'Modern_Spanish_CI_AS';
  if (!ok) {
    console.error('✖ Alguna comprobación falló');
    process.exit(1);
  }
  console.log('✔ Comprobaciones OK');
}

async function rotate(env: Record<string, string>) {
  Object.assign(process.env, qaProcessEnv(env));
  await import('reflect-metadata');
  const { Module } = await import('@nestjs/common');
  const { NestFactory } = await import('@nestjs/core');
  const { EventEmitterModule } = await import('@nestjs/event-emitter');
  const { PortfolioModule, RunWeeklyRotationUseCase } = await import('../src/modules/portfolio');
  const { SharedModule } = await import('../src/shared/infrastructure/shared.module');
  @Module({ imports: [EventEmitterModule.forRoot(), SharedModule, PortfolioModule] })
  class QaRotateModule {}
  const app = await NestFactory.createApplicationContext(QaRotateModule, { logger: ['error'] });
  try {
    const started = performance.now();
    const r = await app.get(RunWeeklyRotationUseCase).execute();
    console.log(
      `Ciclo ${r.week.cycle.number}, semana ${r.week.weekNumber}/${r.week.totalWeeks}: ` +
        `${r.refill.executives} ejecutivos, ${r.refill.assigned} asignaciones nuevas, ` +
        `${r.refill.shortfall} huecos; planes ${r.plans.generated} generados (${r.plans.items} ítems), ` +
        `${r.plans.existing} ya existían — ${Math.round(performance.now() - started)} ms`,
    );
  } finally {
    await app.close();
  }
}

// ───────────────────────────── main ─────────────────────────────

if (command === 'setup') {
  const env = loadOrCreateEnv();
  await createDatabaseAndLogins(env);
  migrate(env);
  seed(env);
  await seedQaUsers(env);
  await verify(env);
  console.log('Entorno QA listo. Credenciales en backend/.env.qa (no se muestran).');
} else if (command === 'verify') {
  await verify(loadEnv());
} else if (command === 'rotate') {
  await rotate(loadEnv());
  process.exit(0);
} else if (command === 'api' || command === 'run') {
  const env = qaProcessEnv(loadEnv());
  const cmd = command === 'api' ? ['bun', 'src/main.ts'] : passthrough;
  if (cmd.length === 0) {
    console.error('Uso: bun scripts/qa-env.ts run -- <comando…>');
    process.exit(1);
  }
  if (command === 'api') env.NODE_ENV = 'production';
  const child = Bun.spawn(cmd, { cwd: backendDir, env, stdout: 'inherit', stderr: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
  process.exit(await child.exited);
} else {
  console.error(`Comando desconocido: ${command} (setup | verify | rotate | api | run -- …)`);
  process.exit(1);
}

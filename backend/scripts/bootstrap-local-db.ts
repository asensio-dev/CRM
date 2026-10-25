/**
 * Prepara la base de datos LOCAL de desarrollo (solo para tu máquina):
 *  1. Crea la base AxiomCRM (collation Modern_Spanish_CI_AS) si no existe.
 *  2. Crea el login `axiom_dev` con una contraseña aleatoria (dbcreator para la base sombra de Prisma).
 *  3. Escribe backend/.env (ignorado por git) con DATABASE_URL y secretos JWT aleatorios.
 *
 * Se conecta con autenticación de Windows (`sqlcmd -E`); la contraseña viaja por stdin,
 * nunca por argumentos de línea de comandos ni por consola.
 *
 * Uso: bun run db:bootstrap [--server localhost] [--force]
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const serverArg = args.indexOf('--server');
const server = serverArg >= 0 ? (args[serverArg + 1] ?? 'localhost') : 'localhost';
const force = args.includes('--force');

const DB_NAME = 'AxiomCRM';
const LOGIN = 'axiom_dev';
const envPath = join(import.meta.dir, '..', '.env');

if (existsSync(envPath) && !force) {
  console.log(
    'backend/.env ya existe; no se modifica nada. Usa --force para regenerar la contraseña.',
  );
  process.exit(0);
}

function randomSecret(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // Garantiza mayúscula, minúscula y dígito (política de contraseñas de SQL Server)
  return `Ax9${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

const password = randomSecret(29);

const sql = `
SET NOCOUNT ON;
IF DB_ID(N'${DB_NAME}') IS NULL
  CREATE DATABASE [${DB_NAME}] COLLATE Modern_Spanish_CI_AS;
GO
IF SUSER_ID(N'${LOGIN}') IS NULL
  CREATE LOGIN [${LOGIN}] WITH PASSWORD = N'${password}', CHECK_POLICY = ON, DEFAULT_DATABASE = [${DB_NAME}];
ELSE
  ALTER LOGIN [${LOGIN}] WITH PASSWORD = N'${password}';
ALTER SERVER ROLE [dbcreator] ADD MEMBER [${LOGIN}];
GO
USE [${DB_NAME}];
IF USER_ID(N'${LOGIN}') IS NULL
  CREATE USER [${LOGIN}] FOR LOGIN [${LOGIN}];
ALTER ROLE [db_owner] ADD MEMBER [${LOGIN}];
GO
`;

const proc = Bun.spawn(['sqlcmd', '-S', server, '-E', '-b', '-C'], {
  stdin: new TextEncoder().encode(sql),
  stdout: 'pipe',
  stderr: 'pipe',
});
const code = await proc.exited;
if (code !== 0) {
  console.error(
    'sqlcmd falló:',
    await new Response(proc.stderr).text(),
    await new Response(proc.stdout).text(),
  );
  process.exit(code);
}

const url = `sqlserver://${server}:1433;database=${DB_NAME};user=${LOGIN};password=${password};encrypt=true;trustServerCertificate=true`;

const env = `# Generado por scripts/bootstrap-local-db.ts — NO versionar (está en .gitignore)
DATABASE_URL="${url}"
SHADOW_DATABASE_URL=
JWT_ACCESS_SECRET=${randomSecret(48)}
JWT_REFRESH_SECRET=${randomSecret(48)}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
PORT=3000
CORS_ORIGIN=http://localhost:5173
TZ=America/Managua
SEED_ADMIN_EMAIL=admin@axiom.local
SEED_ADMIN_PASSWORD=${randomSecret(17)}
`;
await Bun.write(envPath, env);

console.log(
  `Base ${DB_NAME} y login ${LOGIN} listos en ${server}. Credenciales escritas en backend/.env.`,
);

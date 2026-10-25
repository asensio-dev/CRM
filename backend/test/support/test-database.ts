/**
 * Utilidades para la base de pruebas AxiomCRM_Test. Regla dura: ninguna prueba toca la base de
 * desarrollo `AxiomCRM`. El nombre de la base de pruebas es una constante (nunca viene del entorno).
 */
export const TEST_DB_NAME = 'AxiomCRM_Test';

/** Cambia el nombre de la base en una cadena `sqlserver://host:1433;database=X;user=…`. */
export function withDatabase(url: string, database: string): string {
  if (!/(^|;)database=/i.test(url)) return `${url.replace(/;+$/, '')};database=${database}`;
  return url.replace(/((?:^|;)database=)[^;]*/i, `$1${database}`);
}

export function databaseOf(url: string): string | undefined {
  return /(?:^|;)database=([^;]*)/i.exec(url)?.[1];
}

/** Lanza si la URL no apunta a la base de pruebas. */
export function assertTestDatabase(url: string | undefined): asserts url is string {
  if (!url) throw new Error('DATABASE_URL no está definida para las pruebas');
  if (databaseOf(url) !== TEST_DB_NAME) {
    throw new Error(
      `Las pruebas solo pueden usar la base ${TEST_DB_NAME}; DATABASE_URL apunta a "${databaseOf(url) ?? '?'}". ` +
        'Ejecuta `bun run test:integration` (recrea la base de pruebas y fija las variables).',
    );
  }
}

export const TEST_USERS = [
  { key: 'admin', email: 'admin@test.axiom', fullName: 'Admin Prueba', role: 'ADMIN' },
  {
    key: 'supervisor',
    email: 'supervisor@test.axiom',
    fullName: 'Supervisora Prueba',
    role: 'SUPERVISOR',
  },
  { key: 'exec1', email: 'ejecutivo1@test.axiom', fullName: 'Ejecutivo Uno', role: 'EJECUTIVO' },
  { key: 'exec2', email: 'ejecutivo2@test.axiom', fullName: 'Ejecutivo Dos', role: 'EJECUTIVO' },
] as const;
export type TestUserKey = (typeof TEST_USERS)[number]['key'];

/** Variable de entorno con la contraseña de cada usuario de prueba, p. ej. TEST_PASSWORD_ADMIN. */
export const passwordVar = (key: TestUserKey): string => `TEST_PASSWORD_${key.toUpperCase()}`;

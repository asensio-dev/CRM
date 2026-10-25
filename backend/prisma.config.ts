// Configuración del CLI de Prisma 7. Las variables vienen de backend/.env (ignorado por git)
// o del entorno (CI / servidores). Prisma 7 ya no carga .env por sí solo.
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita conexión, por eso no se exige aquí; migrate fallará si falta.
    url: process.env.DATABASE_URL ?? '',
    // Opcional: si no se define, Prisma crea y borra una base sombra temporal (requiere dbcreator).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});

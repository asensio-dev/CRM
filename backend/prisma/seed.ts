/**
 * Datos iniciales idempotentes (se puede ejecutar varias veces): parámetros, sectores y admin.
 * La contraseña del admin se lee de SEED_ADMIN_PASSWORD; nunca está en el código.
 */
import { SETTING_DEFAULTS } from '@axiom/contracts';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../src/generated/prisma/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL no está definida (backend/.env)');

const prisma = new PrismaClient({ adapter: new PrismaMssql(url) });

const SECTORS = [
  'PRIVADA NACIONAL',
  'PRIVADO EXTRANJERO',
  'ESTADO',
  'MINISTERIOS E INSTIT',
  'PRIVADO NACIONAL EXT',
  'ALCALDIAS',
  'MIXTA MINORITARIA',
  'MIXTA MAYORITARIA',
  'NO DEFINIDO',
];

async function main() {
  for (const [key, { value, description }] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value, description },
      update: { description }, // no pisa valores que un admin ya cambió
    });
  }

  for (const name of SECTORS) {
    await prisma.economicSector.upsert({ where: { name }, create: { name }, update: {} });
  }

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const passwordHash = await Bun.password.hash(password, { algorithm: 'argon2id' });
    await prisma.user.upsert({
      where: { email },
      create: { email, fullName: 'Administrador', role: 'ADMIN', passwordHash },
      update: {},
    });
    console.log(`Admin inicial: ${email}`);
  } else {
    console.warn('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no definidos: no se crea el admin.');
  }

  console.log(
    `Seed listo: ${Object.keys(SETTING_DEFAULTS).length} parámetros, ${SECTORS.length} sectores.`,
  );
}

await main().finally(() => prisma.$disconnect());

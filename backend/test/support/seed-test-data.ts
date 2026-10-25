/**
 * Datos SINTÉTICOS y deterministas para AxiomCRM_Test (nada del Excel real).
 *  - parámetros y sectores como el seed real, 4 actividades de ficción
 *  - 300 empresas `TST000000001…300`; la nº 1 es «Ñandú Test S.A.» (prueba de acentos);
 *    cada 25.ª no tiene teléfono; el resto sí
 *  - 4 usuarios (ADMIN, SUPERVISOR, 2 EJECUTIVO) con contraseñas aleatorias generadas al vuelo
 */
import { SETTING_DEFAULTS } from '@axiom/contracts';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { TEST_USERS, type TestUserKey } from './test-database';

export const COMPANY_COUNT = 300;
export const rucOf = (n: number): string => `TST${String(n).padStart(9, '0')}`;
/** Empresas sin teléfono (nunca entran al pool automático). */
export const hasPhone = (n: number): boolean => n % 25 !== 0;
export const phoneOf = (n: number): string => `2270${String(n).padStart(4, '0')}`;
export const employeesOf = (n: number): number => 5 + ((n * 37) % 400);

const SECTORS = ['PRIVADA NACIONAL', 'ESTADO', 'NO DEFINIDO'];
const ACTIVITIES = [
  'COMERCIO AL POR MAYOR DE PRUEBA',
  'SERVICIOS TECNICOS DE PRUEBA',
  'MANUFACTURA DE PRUEBA',
  'AGRICULTURA DE PRUEBA',
];

function randomPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return `Tt9${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}

export function randomSecret(length = 48): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) =>
    (b % 36).toString(36),
  ).join('');
}

export function companyName(n: number): string {
  return n === 1 ? 'Ñandú Test S.A.' : `Empresa Sintética ${String(n).padStart(3, '0')} S.A.`;
}

export type SeedResult = { passwords: Record<TestUserKey, string> };

export async function seedTestData(prisma: PrismaClient): Promise<SeedResult> {
  for (const [key, { value, description }] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value, description },
      update: { value },
    });
  }
  for (const name of SECTORS) {
    await prisma.economicSector.upsert({ where: { name }, create: { name }, update: {} });
  }
  for (const name of ACTIVITIES) {
    await prisma.economicActivity.upsert({ where: { name }, create: { name }, update: {} });
  }
  const sectors = await prisma.economicSector.findMany({ orderBy: { id: 'asc' } });
  const activities = await prisma.economicActivity.findMany({ orderBy: { id: 'asc' } });

  const rows = Array.from({ length: COMPANY_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      ruc: rucOf(n),
      legalName: companyName(n),
      tradeName: n % 3 === 0 ? `Marca Sintética ${n}` : null,
      legalRepName: `Representante ${n}`,
      legalRepIdNumber: `001-010190-${String(n).padStart(4, '0')}X`,
      employeeCount: employeesOf(n),
      phone: hasPhone(n) ? phoneOf(n) : null,
      shippingAddress: `Calle de prueba ${n}, Managua`,
      activityId: activities[n % activities.length]?.id,
      sectorId: sectors[n % sectors.length]?.id,
      source: 'EXCEL',
    };
  });
  for (let i = 0; i < rows.length; i += 50) {
    await prisma.company.createMany({ data: rows.slice(i, i + 50) });
  }

  const passwords = {} as Record<TestUserKey, string>;
  for (const user of TEST_USERS) {
    const password = randomPassword();
    passwords[user.key] = password;
    await prisma.user.create({
      data: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        passwordHash: await Bun.password.hash(password, { algorithm: 'argon2id' }),
      },
    });
  }
  return { passwords };
}

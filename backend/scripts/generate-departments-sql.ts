/**
 * Genera un script SQL autónomo (SQL Server) que crea la columna `companies.department` si no
 * existe y rellena el departamento de TODA la base, identificando cada empresa por su RUC.
 * Sirve para aplicarlo en otro servidor (QA, producción) con SSMS o `sqlcmd -I -i <archivo>`
 * sin instalar Bun ni el proyecto.
 *
 * El archivo contiene RUC (que en personas naturales es la cédula): por defecto se escribe en
 * data/ (ignorado por git). Imprime solo cifras agregadas.
 *
 * Uso: bun run db:sql:departments [--out ../data/departamentos.sql] [--only dental]
 *  - --only dental  solo las clínicas dentales (mismo criterio que export-dental-clinics.ts).
 */
import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEPARTMENTS, type Department, inferDepartment } from '@axiom/contracts';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { SharedModule } from '../src/shared/infrastructure/shared.module';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '../data/departamentos.sql' },
    only: { type: 'string' },
  },
});
if (args.only && args.only !== 'dental') {
  console.error('--only solo admite "dental"');
  process.exit(1);
}
const dentalOnly = args.only === 'dental';
const outPath = resolve(
  dentalOnly && args.out === '../data/departamentos.sql'
    ? '../data/departamentos-clinicas-dentales.sql'
    : (args.out as string),
);

/** Filas por sentencia UPDATE (cada RUC es un literal, no un parámetro: no hay tope de 2 100). */
const RUCS_PER_UPDATE = 500;
const NAME_KEYWORDS = ['DENTAL', 'DENTIST', 'ODONTO', 'ORTODON'];

const sqlString = (value: string) => `N'${value.replace(/'/g, "''")}'`;

@Module({ imports: [EventEmitterModule.forRoot(), SharedModule] })
class SqlCliModule {}

const app = await NestFactory.createApplicationContext(SqlCliModule, { logger: ['error'] });
const db = app.get(PrismaService).db;
let exitCode = 0;

try {
  let where = {};
  if (dentalOnly) {
    const activities = await db.economicActivity.findMany({
      where: { name: { contains: 'odontol' } },
      select: { id: true, name: true },
    });
    const ids = activities
      .filter((a) => !/m[eé]dicos/i.test(a.name) && !/taller/i.test(a.name))
      .map((a) => a.id);
    where = {
      OR: [
        { activityId: { in: ids } },
        ...NAME_KEYWORDS.flatMap((k) => [
          { legalName: { contains: k } },
          { tradeName: { contains: k } },
        ]),
      ],
    };
  }

  const byDepartment = new Map<Department, string[]>();
  let total = 0;
  let cursor = 0;
  for (;;) {
    const rows = await db.company.findMany({
      where: { ...where, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: 5000,
      select: { id: true, ruc: true, shippingAddress: true, particularAddress: true, phone: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id ?? cursor;
    total += rows.length;
    for (const r of rows) {
      const department = inferDepartment({
        addresses: [r.shippingAddress, r.particularAddress],
        phone: r.phone,
      })?.department;
      if (!department) continue;
      const rucs = byDepartment.get(department) ?? [];
      rucs.push(r.ruc);
      byDepartment.set(department, rucs);
    }
  }

  const assigned = [...byDepartment.values()].reduce((n, rucs) => n + rucs.length, 0);
  const allowed = DEPARTMENTS.map((d) => `N''${d}''`).join(', ');
  const out: string[] = [
    '-- AXIOM CRM: departamento de cada empresa (companies.department)',
    `-- Generado: ${new Date().toISOString()} | ${dentalOnly ? 'solo clínicas dentales' : 'toda la base'}`,
    `-- Empresas analizadas: ${total} | con departamento: ${assigned}`,
    '-- Idempotente: se puede ejecutar varias veces. Ejecutar con: sqlcmd -I -i <archivo>',
    'SET NOCOUNT ON;',
    'SET XACT_ABORT ON;',
    'GO',
    '',
    '-- 1. Columna, índice y CHECK (equivalente a la migración company_department).',
    "IF COL_LENGTH(N'dbo.companies', N'department') IS NULL",
    '  ALTER TABLE [dbo].[companies] ADD [department] NVARCHAR(30) NULL;',
    'GO',
    "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'companies_department_status_idx')",
    "  EXEC(N'CREATE NONCLUSTERED INDEX [companies_department_status_idx] ON [dbo].[companies]([department], [status]);');",
    "IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'companies_department_check')",
    `  EXEC(N'ALTER TABLE [dbo].[companies] ADD CONSTRAINT [companies_department_check] CHECK ([department] IS NULL OR [department] IN (${allowed}));');`,
    'GO',
    '',
    '-- 2. Departamento por RUC.',
    'BEGIN TRAN;',
  ];
  if (!dentalOnly) {
    out.push('-- Se recalcula todo: primero se vacía, luego se asigna.');
    out.push('UPDATE [dbo].[companies] SET [department] = NULL WHERE [department] IS NOT NULL;');
  }
  for (const [department, rucs] of [...byDepartment].sort((a, b) => b[1].length - a[1].length)) {
    out.push('', `-- ${department}: ${rucs.length}`);
    for (let i = 0; i < rucs.length; i += RUCS_PER_UPDATE) {
      const list = rucs
        .slice(i, i + RUCS_PER_UPDATE)
        .map(sqlString)
        .join(',');
      out.push(
        `UPDATE [dbo].[companies] SET [department] = N'${department}' WHERE [ruc] IN (${list});`,
      );
    }
  }
  out.push(
    '',
    'COMMIT TRAN;',
    'GO',
    '',
    '-- 3. Comprobación.',
    "SELECT ISNULL([department], N'(sin departamento)') AS departamento, COUNT(*) AS empresas",
    'FROM [dbo].[companies] GROUP BY [department] ORDER BY COUNT(*) DESC;',
    'GO',
    '',
  );

  mkdirSync(dirname(outPath), { recursive: true });
  await Bun.write(outPath, out.join('\n'));
  console.log(`Empresas analizadas:   ${total}`);
  console.log(`Con departamento:      ${assigned}`);
  console.log(`Sin departamento:      ${total - assigned}`);
  console.log(`Script SQL: ${outPath}`);
} catch (error) {
  console.error(`Generación fallida: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

/**
 * Exporta a Excel TODAS las clínicas dentales con su departamento. Una empresa cuenta como
 * clínica dental si su actividad económica es odontológica ("Clínicas odontológicas") o si su
 * razón social / nombre comercial menciona DENTAL, DENTIST, ODONTO u ORTODON.
 * El departamento se recalcula en el momento con `inferDepartment` (mismo criterio que
 * scripts/backfill-departments.ts) y, con --save, también se guarda en companies.department.
 *
 * El archivo contiene datos personales: por defecto se escribe en data/ (ignorado por git).
 *
 * Uso: bun run db:export:dental [--out ../data/clinicas-dentales.xlsx] [--save]
 */
import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  DEPARTMENT_LABELS,
  type Department,
  type DepartmentEvidence,
  inferDepartment,
} from '@axiom/contracts';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import ExcelJS from 'exceljs';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { SharedModule } from '../src/shared/infrastructure/shared.module';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: '../data/clinicas-dentales.xlsx' },
    save: { type: 'boolean', default: false },
  },
});
const outPath = resolve(args.out as string);

const NAME_KEYWORDS = ['DENTAL', 'DENTIST', 'ODONTO', 'ORTODON'];
const ACTIVITY_KEYWORDS = ['odontol'];
const EVIDENCE_LABELS: Record<DepartmentEvidence | 'NONE', string> = {
  ADDRESS: 'Dirección',
  PHONE: 'Teléfono fijo',
  NONE: 'Sin datos suficientes',
};

@Module({ imports: [EventEmitterModule.forRoot(), SharedModule] })
class ExportCliModule {}

const app = await NestFactory.createApplicationContext(ExportCliModule, { logger: ['error'] });
const db = app.get(PrismaService).db;
let exitCode = 0;

try {
  // "Actividades de médicos y odontólogos" mezcla médicos: esas solo entran por el nombre.
  const activities = await db.economicActivity.findMany({
    where: { OR: ACTIVITY_KEYWORDS.map((k) => ({ name: { contains: k } })) },
    select: { id: true, name: true },
  });
  const dentalActivityIds = activities
    .filter((a) => !/m[eé]dicos/i.test(a.name) && !/taller/i.test(a.name))
    .map((a) => a.id);

  const companies = await db.company.findMany({
    where: {
      OR: [
        { activityId: { in: dentalActivityIds } },
        ...NAME_KEYWORDS.flatMap((k) => [
          { legalName: { contains: k } },
          { tradeName: { contains: k } },
        ]),
      ],
    },
    orderBy: { legalName: 'asc' },
    select: {
      id: true,
      ruc: true,
      legalName: true,
      tradeName: true,
      phone: true,
      shippingAddress: true,
      particularAddress: true,
      employeeCount: true,
      status: true,
      department: true,
      activity: { select: { name: true } },
    },
  });

  const rows = companies.map((c) => {
    const inferred = inferDepartment({
      addresses: [c.shippingAddress, c.particularAddress],
      phone: c.phone,
    });
    return { ...c, inferred };
  });

  if (args.save) {
    const byDepartment = new Map<Department | null, number[]>();
    for (const r of rows) {
      const next = r.inferred?.department ?? null;
      if (next === r.department) continue;
      const ids = byDepartment.get(next) ?? [];
      ids.push(r.id);
      byDepartment.set(next, ids);
    }
    let saved = 0;
    for (const [department, ids] of byDepartment) {
      await db.company.updateMany({ where: { id: { in: ids } }, data: { department } });
      saved += ids.length;
    }
    console.log(`Departamentos guardados en la base: ${saved}`);
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Clínicas dentales', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'RUC', key: 'ruc', width: 18 },
    { header: 'Razón social', key: 'legalName', width: 40 },
    { header: 'Nombre comercial', key: 'tradeName', width: 36 },
    { header: 'Departamento', key: 'department', width: 20 },
    { header: 'Deducido por', key: 'evidence', width: 20 },
    { header: 'Dirección de envío', key: 'shippingAddress', width: 60 },
    { header: 'Dirección particular', key: 'particularAddress', width: 60 },
    { header: 'Teléfono', key: 'phone', width: 14 },
    { header: 'Actividad económica', key: 'activity', width: 36 },
    { header: 'Empleados', key: 'employeeCount', width: 11 },
    { header: 'Estado', key: 'status', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: 'K1' };
  for (const r of rows) {
    sheet.addRow({
      ruc: r.ruc,
      legalName: r.legalName,
      tradeName: r.tradeName,
      department: r.inferred ? DEPARTMENT_LABELS[r.inferred.department] : '',
      evidence: EVIDENCE_LABELS[r.inferred?.evidence ?? 'NONE'],
      shippingAddress: r.shippingAddress,
      particularAddress: r.particularAddress,
      phone: r.phone,
      activity: r.activity?.name ?? '',
      employeeCount: r.employeeCount,
      status: r.status,
    });
  }

  const counts = new Map<string, number>();
  for (const r of rows) {
    const label = r.inferred ? DEPARTMENT_LABELS[r.inferred.department] : '(sin departamento)';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const summary = wb.addWorksheet('Resumen por departamento');
  summary.columns = [
    { header: 'Departamento', key: 'label', width: 24 },
    { header: 'Clínicas', key: 'count', width: 10 },
  ];
  summary.getRow(1).font = { bold: true };
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  for (const [label, count] of sorted) summary.addRow({ label, count });
  summary.addRow({ label: 'Total', count: rows.length }).font = { bold: true };

  mkdirSync(dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);

  const withDepartment = rows.filter((r) => r.inferred).length;
  console.log(`Clínicas dentales: ${rows.length}`);
  console.log(`  Con departamento: ${withDepartment}`);
  console.log(`  Sin departamento: ${rows.length - withDepartment}`);
  for (const [label, count] of sorted) console.log(`    ${label.padEnd(22)} ${count}`);
  console.log(`Archivo: ${outPath}`);
} catch (error) {
  console.error(`Exportación fallida: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

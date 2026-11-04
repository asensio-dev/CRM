/**
 * Rellena `companies.department` para TODA la base a partir de las direcciones (envío y
 * particular) y el teléfono fijo de cada empresa, con `inferDepartment` de @axiom/contracts.
 * Idempotente: solo escribe las filas cuyo departamento cambia, así que se puede volver a
 * ejecutar tras mejorar el nomenclátor. Imprime solo cifras agregadas, nunca filas.
 *
 * Uso: bun run db:backfill:departments [--dry-run] [--only-missing] [--batch 2000]
 *  - --dry-run       calcula y muestra el resumen sin escribir nada.
 *  - --only-missing  solo empresas con department = null (por defecto recalcula todas).
 */
import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { DEPARTMENT_LABELS, type Department, inferDepartment } from '@axiom/contracts';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service';
import { SharedModule } from '../src/shared/infrastructure/shared.module';

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'only-missing': { type: 'boolean', default: false },
    batch: { type: 'string', default: '2000' },
  },
});
const dryRun = args['dry-run'];
const batchSize = Math.min(Math.max(Number(args.batch) || 2000, 100), 2000);

/** SQL Server admite 2 100 parámetros por sentencia: los `IN (...)` van en trozos de 1 000. */
const IN_CHUNK = 1000;

@Module({ imports: [EventEmitterModule.forRoot(), SharedModule] })
class BackfillCliModule {}

const app = await NestFactory.createApplicationContext(BackfillCliModule, { logger: ['error'] });
const db = app.get(PrismaService).db;

const perDepartment = new Map<Department | null, number>();
const perEvidence = { ADDRESS: 0, PHONE: 0, NONE: 0 };
let processed = 0;
let changed = 0;
let exitCode = 0;
const started = Date.now();

try {
  const where = args['only-missing'] ? { department: null } : {};
  const total = await db.company.count({ where });
  console.log(
    `${dryRun ? '[simulación] ' : ''}Empresas a procesar: ${total}` +
      (args['only-missing'] ? ' (solo sin departamento)' : ''),
  );

  let cursor = 0;
  for (;;) {
    const rows = await db.company.findMany({
      where: { ...where, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: batchSize,
      select: {
        id: true,
        shippingAddress: true,
        particularAddress: true,
        phone: true,
        department: true,
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id ?? cursor;

    // Agrupa por departamento nuevo para escribir con updateMany (una sentencia por grupo).
    const updates = new Map<Department | null, number[]>();
    for (const row of rows) {
      const result = inferDepartment({
        addresses: [row.shippingAddress, row.particularAddress],
        phone: row.phone,
      });
      const next = result?.department ?? null;
      perDepartment.set(next, (perDepartment.get(next) ?? 0) + 1);
      perEvidence[result?.evidence ?? 'NONE']++;
      if (next !== row.department) {
        const ids = updates.get(next) ?? [];
        ids.push(row.id);
        updates.set(next, ids);
      }
    }

    for (const [department, ids] of updates) {
      changed += ids.length;
      if (dryRun) continue;
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        await db.company.updateMany({
          where: { id: { in: ids.slice(i, i + IN_CHUNK) } },
          data: { department },
        });
      }
    }

    processed += rows.length;
    const rate = Math.round(processed / ((Date.now() - started) / 1000));
    console.log(`  ${processed}/${total} | ${changed} con cambio | ${rate} filas/s`);
  }

  const pct = (n: number) => (processed ? ((n / processed) * 100).toFixed(1) : '0.0');
  console.log(`\nResumen${dryRun ? ' (simulación, nada escrito)' : ''}`);
  console.log(`  Empresas procesadas:        ${processed}`);
  console.log(`  ${`Filas ${dryRun ? 'que cambiarían' : 'actualizadas'}:`.padEnd(28)}${changed}`);
  console.log(
    `  Deducido por dirección:     ${perEvidence.ADDRESS} (${pct(perEvidence.ADDRESS)} %)`,
  );
  console.log(`  Deducido por teléfono fijo: ${perEvidence.PHONE} (${pct(perEvidence.PHONE)} %)`);
  console.log(`  Sin departamento:           ${perEvidence.NONE} (${pct(perEvidence.NONE)} %)`);
  console.log('\n  Por departamento:');
  const sorted = [...perDepartment].sort((a, b) => b[1] - a[1]);
  for (const [department, count] of sorted) {
    const label = department ? DEPARTMENT_LABELS[department] : '(sin departamento)';
    console.log(`    ${label.padEnd(22)} ${String(count).padStart(7)}  ${pct(count)} %`);
  }
  console.log(`  Duración: ${((Date.now() - started) / 1000).toFixed(1)} s`);
} catch (error) {
  console.error(`Relleno fallido: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

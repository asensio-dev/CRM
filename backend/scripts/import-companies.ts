/**
 * Importa el Excel de empresas desde la línea de comandos (misma lógica que POST /api/import).
 * Idempotente: se puede ejecutar varias veces. Imprime solo cifras agregadas, nunca filas.
 *
 * Uso: bun run db:import <ruta-al-xlsx>
 */
import 'reflect-metadata';
import { basename, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import {
  CreateImportJobUseCase,
  ImportCompaniesUseCase,
  ImportModule,
} from '../src/modules/import';
import { SharedModule } from '../src/shared/infrastructure/shared.module';

const path = process.argv[2];
if (!path) {
  console.error('Uso: bun run db:import <ruta-al-xlsx>');
  process.exit(1);
}
const filePath = resolve(path);

@Module({ imports: [EventEmitterModule.forRoot(), SharedModule, ImportModule] })
class ImportCliModule {}

const app = await NestFactory.createApplicationContext(ImportCliModule, { logger: ['error'] });
let exitCode = 0;
try {
  const job = await app.get(CreateImportJobUseCase).execute({ fileName: basename(filePath) });
  console.log(`Importación #${job.id}: ${basename(filePath)}`);

  const summary = await app.get(ImportCompaniesUseCase).execute({
    jobId: job.id,
    filePath,
    onProgress: (p) => {
      const rate = Math.round(p.totalRows / (p.durationMs / 1000));
      console.log(
        `  ${p.totalRows} filas | ${p.inserted} nuevas | ${p.updated} actualizadas | ` +
          `${p.branchesInserted} sucursales | ${p.rejected} rechazadas | ${rate} filas/s`,
      );
    },
  });

  console.log('\nResumen');
  console.log(`  Filas leídas:                  ${summary.totalRows}`);
  console.log(`  Empresas nuevas:               ${summary.inserted}`);
  console.log(`  Empresas actualizadas:         ${summary.updated}`);
  console.log(`  Empresas sin cambios:          ${summary.unchanged}`);
  console.log(`  Empresas MANUAL omitidas:      ${summary.skippedManual}`);
  console.log(`  Sucursales nuevas:             ${summary.branchesInserted}`);
  console.log(`  Sucursales ya existentes:      ${summary.branchesExisting}`);
  console.log(`  Filas duplicadas omitidas:     ${summary.duplicateRows}`);
  console.log(`  Filas con texto recortado:     ${summary.truncatedRows}`);
  console.log(`  Actividades nuevas:            ${summary.newActivities}`);
  console.log(`  Filas rechazadas:              ${summary.rejected}`);
  for (const [reason, count] of Object.entries(summary.rejectionsByReason)) {
    console.log(`    - ${reason}: ${count}`);
  }
  console.log(`  Duración:                      ${(summary.durationMs / 1000).toFixed(1)} s`);
} catch (error) {
  console.error(`Importación fallida: ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await app.close();
}
process.exit(exitCode);

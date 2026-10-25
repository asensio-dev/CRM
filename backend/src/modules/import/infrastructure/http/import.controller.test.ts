import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import JSZip from 'jszip';
import { DomainExceptionFilter } from '../../../../shared/infrastructure/http/domain-exception.filter';
import { ImportCompaniesUseCase } from '../../application/use-cases/import-companies.use-case';
import {
  CreateImportJobUseCase,
  GetImportJobUseCase,
  ListImportRejectionsUseCase,
} from '../../application/use-cases/import-job-queries';
import { describeError, ImportController, sanitizeUploadName } from './import.controller';

const UPLOAD_DIR = join(tmpdir(), 'axiom-import');

let app: INestApplication;
let base: string;
let finishImport: () => void = () => undefined;
const createdNames: string[] = [];
let failCreate = false;

const importCompanies = {
  execute: () =>
    new Promise<void>((resolve) => {
      finishImport = resolve;
    }),
};
const createJob = {
  execute: async (input: { fileName: string }) => {
    if (failCreate) throw new Error('db caída');
    createdNames.push(input.fileName);
    return { id: createdNames.length };
  },
};

async function xlsxBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function upload(bytes: Uint8Array | string, name: string) {
  const form = new FormData();
  form.append('file', new Blob([bytes]), name);
  return fetch(`${base}/import`, { method: 'POST', body: form });
}

async function uploadedFiles(): Promise<string[]> {
  return readdir(UPLOAD_DIR).catch(() => []);
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [ImportController],
    providers: [
      { provide: CreateImportJobUseCase, useValue: createJob },
      { provide: ImportCompaniesUseCase, useValue: importCompanies },
      { provide: GetImportJobUseCase, useValue: {} },
      { provide: ListImportRejectionsUseCase, useValue: {} },
    ],
  }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.listen(0);
  base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost');
});

afterAll(async () => {
  finishImport();
  await app.close();
});

describe('POST /import (endurecido)', () => {
  test('rechaza un .xlsx que no es ZIP y borra el temporal', async () => {
    const before = await uploadedFiles();
    const res = await upload('no soy un zip', 'falso.xlsx');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toContain('no es un .xlsx');
    expect(await uploadedFiles()).toEqual(before);
  });

  test('si falla la creación del job no queda el temporal huérfano', async () => {
    const before = await uploadedFiles();
    failCreate = true;
    const res = await upload(await xlsxBytes(), 'ok.xlsx');
    failCreate = false;
    expect(res.status).toBe(500);
    expect(await uploadedFiles()).toEqual(before);
  });

  test('una importación a la vez: la segunda responde 409 hasta que termina la primera', async () => {
    const first = await upload(await xlsxBytes(), '../../etc/empresas.xlsx');
    expect(first.status).toBe(202);
    expect(createdNames.at(-1)).toBe('empresas.xlsx');

    const second = await upload(await xlsxBytes(), 'otra.xlsx');
    expect(second.status).toBe(409);

    finishImport();
    await Bun.sleep(20);
    const third = await upload(await xlsxBytes(), 'tercera.xlsx');
    expect(third.status).toBe(202);
    finishImport();
  });
});

describe('sanitizeUploadName / describeError', () => {
  test('quita rutas y caracteres de control y acota la longitud', () => {
    expect(sanitizeUploadName('C:\\temp\\x\\datos.xlsx')).toBe('datos.xlsx');
    expect(sanitizeUploadName('a\u0000b\nc.xlsx')).toBe('abc.xlsx');
    expect(sanitizeUploadName('/')).toBe('archivo.xlsx');
    expect(sanitizeUploadName(`${'n'.repeat(400)}.xlsx`)).toHaveLength(255);
  });

  test('describeError nunca incluye el mensaje (puede llevar datos de filas)', () => {
    const error = Object.assign(new Error('Juan Pérez 001-010101-0000A'), { code: 'P2002' });
    expect(describeError(error)).toBe('Error P2002');
    expect(describeError('x')).toBe('error desconocido');
  });
});

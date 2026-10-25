import { afterEach, describe, expect, test } from 'bun:test';
import type { ImportJobDto } from '@axiom/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonResponse, mockFetch, mountApp } from '@/test/helpers';
import { validateImportFile } from './queries';

let mocked: ReturnType<typeof mockFetch>;
afterEach(() => mocked?.restore());

const job = (over: Partial<ImportJobDto>): ImportJobDto => ({
  id: 9,
  fileName: 'padron.xlsx',
  status: 'PROCESANDO',
  totalRows: 0,
  insertedCount: 0,
  updatedCount: 0,
  branchCount: 0,
  rejectedCount: 0,
  errorMessage: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  ...over,
});

const xlsx = (name = 'padron.xlsx', size = 1024) =>
  new File([new Uint8Array(size)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

describe('validateImportFile', () => {
  test('rechaza extensión, vacío y tamaño', () => {
    expect(validateImportFile(xlsx('a.csv'))).toContain('.xlsx');
    expect(validateImportFile(xlsx('a.xlsx', 0))).toContain('vacío');
    const big = { name: 'a.xlsx', size: 51 * 1024 * 1024 } as File;
    expect(validateImportFile(big)).toContain('50 MB');
    expect(validateImportFile(xlsx())).toBeNull();
  });
});

describe('ImportPage', () => {
  test('explica que reimportar es idempotente y bloquea archivos inválidos', async () => {
    mocked = mockFetch(() => undefined);
    await mountApp('/importacion');
    expect(await screen.findByText(/idempotente/)).toBeTruthy();
    const input = (await screen.findByLabelText('Archivo Excel (.xlsx)')) as HTMLInputElement;
    // `applyAccept: false`: simula un archivo arrastrado con otra extensión.
    await userEvent.setup({ applyAccept: false }).upload(input, xlsx('datos.csv'));
    expect(await screen.findByText('Solo se aceptan archivos .xlsx.')).toBeTruthy();
    expect(mocked.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  test('sube el archivo, consulta cada 2 s hasta completar y lista los rechazos', async () => {
    let polls = 0;
    mocked = mockFetch(({ url, method }) => {
      if (method === 'POST' && url.pathname === '/api/import') {
        return jsonResponse({ jobId: 9 }, 202);
      }
      if (url.pathname === '/api/import/9') {
        polls++;
        return jsonResponse(
          polls < 2
            ? job({ status: 'PROCESANDO' })
            : job({
                status: 'COMPLETADO',
                totalRows: 120,
                insertedCount: 100,
                updatedCount: 15,
                branchCount: 3,
                rejectedCount: 2,
                finishedAt: '2026-01-01T00:01:00.000Z',
              }),
        );
      }
      if (url.pathname === '/api/import/9/rejections') {
        return jsonResponse({
          items: [{ id: 1, rowNumber: 14, reason: 'RUC vacío' }],
          page: 1,
          pageSize: 20,
          total: 2,
        });
      }
      return undefined;
    });
    await mountApp('/importacion');
    const input = (await screen.findByLabelText('Archivo Excel (.xlsx)')) as HTMLInputElement;
    await userEvent.setup().upload(input, xlsx());

    const post = mocked.calls.find((c) => c.method === 'POST');
    expect(post?.body).toBeInstanceOf(FormData);
    expect(await screen.findByText('Procesando', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();

    // Segunda consulta a los 2 s: el trabajo termina.
    await waitFor(() => expect(screen.getByText('Completado')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText('120')).toBeTruthy();
    expect(await screen.findByText('RUC vacío')).toBeTruthy();
    const before = polls;
    await new Promise((r) => setTimeout(r, 2300));
    expect(polls).toBe(before); // ya no consulta
    // Historial de la sesión.
    expect(screen.getByText(/#9 · padron\.xlsx/)).toBeTruthy();
  }, 15_000);

  test('un trabajo FALLIDO muestra el mensaje de error', async () => {
    mocked = mockFetch(({ url, method }) => {
      if (method === 'POST') return jsonResponse({ jobId: 3 }, 202);
      if (url.pathname === '/api/import/3') {
        return jsonResponse(job({ id: 3, status: 'FALLIDO', errorMessage: 'Hoja no encontrada' }));
      }
      return undefined;
    });
    await mountApp('/importacion');
    await userEvent
      .setup()
      .upload((await screen.findByLabelText('Archivo Excel (.xlsx)')) as HTMLInputElement, xlsx());
    expect(await screen.findByText('Hoja no encontrada')).toBeTruthy();
    expect(screen.getByText('Fallido')).toBeTruthy();
  });
});

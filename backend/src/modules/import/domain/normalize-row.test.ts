import { describe, expect, test } from 'bun:test';
import { ImportDeduplicator } from './import-deduplicator';
import { type CompanyCandidate, type ImportRow, missingColumns } from './import-row';
import { normalizeRow } from './normalize-row';

const row = (cells: Record<string, unknown>, rowNumber = 2): ImportRow => ({
  rowNumber,
  cells: {
    RUC: 'J0000000000001',
    RAZONSOCIAL_EMPRESA: 'Empresa Ficticia S.A.',
    ...cells,
  },
});

function candidate(cells: Record<string, unknown> = {}): CompanyCandidate {
  const r = normalizeRow(row(cells));
  if (!r.ok) throw new Error(r.reason);
  return r.candidate;
}

describe('normalizeRow', () => {
  test('normaliza RUC numérico, espacios, teléfono y empleados', () => {
    const c = candidate({
      RUC: ' j-0000 000000002 ',
      CANTIDAD_EMPLEADOS: '12',
      TELEFONO: 2222_3333,
      NOMBRE_COMERCIAL_NOMINA: '  Tienda   Falsa ',
      DIRECCION_ENVIO: 'Calle 1',
      DIRECCION_PARTICULAR: 'Calle 2',
    });
    expect(c.ruc).toBe('J0000000000002');
    expect(c.employeeCount).toBe(12);
    expect(c.phone).toBe('22223333');
    expect(c.tradeName).toBe('Tienda Falsa');
    expect(c.address).toBe('Calle 1');
  });

  test('RUC numérico del Excel se guarda como texto', () => {
    expect(candidate({ RUC: 1234567890123 }).ruc).toBe('1234567890123');
  });

  test('rechaza RUC faltante, RUC demasiado largo y razón social faltante', () => {
    expect(normalizeRow(row({ RUC: null }))).toEqual({ ok: false, reason: 'RUC faltante' });
    expect(normalizeRow(row({ RUC: '   ' })).ok).toBe(false);
    const long = normalizeRow(row({ RUC: 'J'.repeat(21) }));
    expect(long.ok).toBe(false);
    const noName = normalizeRow(row({ RAZONSOCIAL_EMPRESA: ' ' }));
    expect(noName).toEqual({ ok: false, reason: 'Razón social faltante' });
  });

  test('teléfono ausente o inválido queda en null sin rechazar la fila', () => {
    expect(candidate({ TELEFONO: null }).phone).toBeNull();
    expect(candidate({ TELEFONO: '123' }).phone).toBeNull();
  });

  test('con varios teléfonos usa el primero válido', () => {
    expect(candidate({ TELEFONO: '12 / 2222-3333 / 8888-9999' }).phone).toBe('22223333');
  });

  test('empleados inválidos o negativos → 0', () => {
    expect(candidate({ CANTIDAD_EMPLEADOS: 'muchos' }).employeeCount).toBe(0);
    expect(candidate({ CANTIDAD_EMPLEADOS: -5 }).employeeCount).toBe(0);
    expect(candidate({ CANTIDAD_EMPLEADOS: 7.9 }).employeeCount).toBe(7);
  });

  test('recorta textos largos y marca la fila; la cédula demasiado larga se descarta', () => {
    const c = candidate({
      RAZONSOCIAL_EMPRESA: 'x'.repeat(250),
      DIRECCION_ENVIO: 'y'.repeat(400),
      CEDULA_REP_LEGAL: '9'.repeat(30),
    });
    expect(c.legalName).toHaveLength(200);
    expect(c.shippingAddress).toHaveLength(300);
    expect(c.legalRepIdNumber).toBeNull();
    expect(c.truncated).toBe(true);
    expect(candidate().truncated).toBe(false);
  });

  test('dirección de sucursal cae a la particular si no hay de envío', () => {
    expect(candidate({ DIRECCION_PARTICULAR: 'Casa 5' }).address).toBe('Casa 5');
  });
});

describe('missingColumns', () => {
  test('detecta columnas obligatorias ausentes', () => {
    expect(missingColumns(['RUC', 'TELEFONO'])).toEqual(['RAZONSOCIAL_EMPRESA']);
    expect(missingColumns(['RUC', 'RAZONSOCIAL_EMPRESA'])).toEqual([]);
  });
});

describe('ImportDeduplicator', () => {
  test('primera fila = empresa, distintas = sucursales, idénticas = duplicado', () => {
    const d = new ImportDeduplicator();
    const first = candidate({ NOMBRE_COMERCIAL_NOMINA: 'A', TELEFONO: '22223333' });
    const other = candidate({ NOMBRE_COMERCIAL_NOMINA: 'B', TELEFONO: '22223333' });
    const sameAsFirst = candidate({
      NOMBRE_COMERCIAL_NOMINA: 'a',
      TELEFONO: '22223333',
      CANTIDAD_EMPLEADOS: 50,
    });
    const otherRuc = candidate({ RUC: 'J0000000000009' });

    expect(d.classify(first)).toBe('COMPANY');
    expect(d.classify(other)).toBe('BRANCH');
    expect(d.classify(sameAsFirst)).toBe('DUPLICATE');
    expect(d.classify(other)).toBe('DUPLICATE');
    expect(d.classify(otherRuc)).toBe('COMPANY');
  });
});

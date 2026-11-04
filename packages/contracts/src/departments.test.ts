import { describe, expect, test } from 'bun:test';
import { departmentFromPhone, inferDepartment, normalizeAddressText } from './departments';

const dep = (address: string, phone?: string): string | null =>
  inferDepartment({ addresses: [address], phone })?.department ?? null;

describe('normalizeAddressText', () => {
  test('quita tildes, signos y unifica kilómetros', () => {
    expect(normalizeAddressText('Km. 11 1/2 Carr. a Masaya, León')).toBe(
      'KM 11.5 CARRETERA A MASAYA LEON',
    );
    expect(normalizeAddressText('KILOMETRO 13.2 CARRETERA')).toBe('KM 13.2 CARRETERA');
  });
});

describe('inferDepartment', () => {
  test.each([
    ['BARRIO SUBTIAVA ASILO DE ANCIANOS 1C.NORTE.1/2C.OESTE', 'LEON'],
    ['BOMBEROS MERCADO ROBERTO HUEMBES 75 VARAS SURESTE', 'MANAGUA'],
    ['DE TIP TOP LOS ROBLES, 1 1/2 CUADRA AL OESTE CONTIGUO A EMBAJADA DE TAIWAN', 'MANAGUA'],
    ['ROTONDA BELLO HORIZONTE 3 CUADRAS AL NORTE', 'MANAGUA'],
    ['PLAYA GUASACATE CASA MAURI 50 METROS AL SUR', 'RIVAS'],
    ['COMARCA EL ARENAL, MASATEPE', 'MASAYA'],
    ['DEL PARQUE CENTRAL 2C AL SUR, JUIGALPA, CHONTALES', 'CHONTALES'],
    ['BARRIO EL CALVARIO, BLUEFIELDS', 'COSTA_CARIBE_SUR'],
  ])('%s → %s', (address, expected) => {
    expect(dep(address)).toBe(expected);
  });

  test('el destino de una carretera no es la ubicación', () => {
    expect(dep('KM 11 1/2 CARRETERA MASAYA ESQUIPULAS RESIDENCIAL DONATELLO')).toBe('MANAGUA');
    expect(dep('KM 14 CARRETERA NUEVA A LEON, CASA L2-29')).toBe('MANAGUA');
    expect(dep('KM 12 CARRETERA MANAGUA-MASAYA')).toBe('MANAGUA');
    expect(dep('SALIDA A GRANADA 2 CUADRAS AL SUR', '25223344')).toBe('MASAYA');
    expect(dep('KM 26 CARRETERA A MASAYA')).toBe('MASAYA');
  });

  test('sin pistas en la dirección decide el teléfono fijo', () => {
    expect(inferDepartment({ addresses: ['FRENTE A GASOLINERA PUMA'], phone: '23112233' })).toEqual(
      {
        department: 'LEON',
        evidence: 'PHONE',
      },
    );
    expect(dep('FRENTE A GASOLINERA PUMA', '88887777')).toBeNull();
  });

  test('la dirección explícita pesa más que el teléfono', () => {
    expect(
      inferDepartment({ addresses: ['BARRIO SAN FELIPE, GRANADA'], phone: '22701234' }),
    ).toEqual({ department: 'GRANADA', evidence: 'ADDRESS' });
  });

  test('sin datos o con empate devuelve null', () => {
    expect(inferDepartment({ addresses: [null, ''] })).toBeNull();
    expect(dep('ENTRE LEON Y CHINANDEGA')).toBeNull();
  });
});

describe('departmentFromPhone', () => {
  test('fijos por prefijo; celulares sin ubicación', () => {
    expect(departmentFromPhone('22700320')).toBe('MANAGUA');
    expect(departmentFromPhone('50527721234')).toBe('MATAGALPA');
    expect(departmentFromPhone('25521234')).toBe('GRANADA');
    expect(departmentFromPhone('84561234')).toBeNull();
    expect(departmentFromPhone(null)).toBeNull();
  });
});

import { z } from 'zod';

/**
 * Departamentos y regiones autónomas de Nicaragua. Los códigos se guardan en
 * `companies.department` (CHECK companies_department_check); si cambias la lista, crea una
 * migración nueva con el CHECK actualizado (schema-consistency.test.ts lo verifica).
 */
export const DEPARTMENTS = [
  'BOACO',
  'CARAZO',
  'CHINANDEGA',
  'CHONTALES',
  'COSTA_CARIBE_NORTE',
  'COSTA_CARIBE_SUR',
  'ESTELI',
  'GRANADA',
  'JINOTEGA',
  'LEON',
  'MADRIZ',
  'MANAGUA',
  'MASAYA',
  'MATAGALPA',
  'NUEVA_SEGOVIA',
  'RIO_SAN_JUAN',
  'RIVAS',
] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const DepartmentSchema = z.enum(DEPARTMENTS);

export const DEPARTMENT_LABELS: Record<Department, string> = {
  BOACO: 'Boaco',
  CARAZO: 'Carazo',
  CHINANDEGA: 'Chinandega',
  CHONTALES: 'Chontales',
  COSTA_CARIBE_NORTE: 'Costa Caribe Norte',
  COSTA_CARIBE_SUR: 'Costa Caribe Sur',
  ESTELI: 'Estelí',
  GRANADA: 'Granada',
  JINOTEGA: 'Jinotega',
  LEON: 'León',
  MADRIZ: 'Madriz',
  MANAGUA: 'Managua',
  MASAYA: 'Masaya',
  MATAGALPA: 'Matagalpa',
  NUEVA_SEGOVIA: 'Nueva Segovia',
  RIO_SAN_JUAN: 'Río San Juan',
  RIVAS: 'Rivas',
};

// ───────────────────────────── Nomenclátor ─────────────────────────────
// Pesos: 3 = nombre de departamento o municipio inequívoco; 2 = punto de referencia o nombre que
// también es apellido frecuente; 1 = nombre ambiguo (existe como barrio/lugar en otro departamento).

type Entry = readonly [term: string, department: Department, weight: number];

const GAZETTEER: readonly Entry[] = [
  // Managua: departamento, municipios y lugares
  ['MANAGUA', 'MANAGUA', 3],
  ['MGA', 'MANAGUA', 3],
  ['CIUDAD SANDINO', 'MANAGUA', 3],
  ['TIPITAPA', 'MANAGUA', 3],
  ['MATEARE', 'MANAGUA', 3],
  ['VILLA EL CARMEN', 'MANAGUA', 3],
  ['VILLA CARLOS FONSECA', 'MANAGUA', 3],
  ['SAN RAFAEL DEL SUR', 'MANAGUA', 3],
  ['TICUANTEPE', 'MANAGUA', 3],
  ['EL CRUCERO', 'MANAGUA', 3],
  ['SAN FRANCISCO LIBRE', 'MANAGUA', 3],
  ['MASACHAPA', 'MANAGUA', 2],
  ['POCHOMIL', 'MANAGUA', 2],
  ['LOS BRASILES', 'MANAGUA', 2],
  ['SAN ISIDRO DE BOLAS', 'MANAGUA', 2],
  ['SABANA GRANDE', 'MANAGUA', 2],
  ['CARRETERA NORTE', 'MANAGUA', 2],
  ['CARRETERA SUR', 'MANAGUA', 2],
  ['CARRETERA A MASAYA', 'MANAGUA', 2],
  ['CARRETERA MASAYA', 'MANAGUA', 2],
  ['CARRETERA NUEVA A LEON', 'MANAGUA', 2],
  ['CARRETERA VIEJA A LEON', 'MANAGUA', 2],
  ['CARRETERA A TIPITAPA', 'MANAGUA', 2],
  ['CAMINO DE ORIENTE', 'MANAGUA', 2],
  ['PISTA JUAN PABLO', 'MANAGUA', 2],
  ['JUAN PABLO II', 'MANAGUA', 2],
  ['PISTA SUBURBANA', 'MANAGUA', 2],
  ['PISTA DE LA RESISTENCIA', 'MANAGUA', 2],
  ['PISTA SABANA GRANDE', 'MANAGUA', 2],
  ['PISTA EL DORADO', 'MANAGUA', 2],
  ['HUEMBES', 'MANAGUA', 2],
  ['HUEMBE', 'MANAGUA', 2],
  ['MAYOREO', 'MANAGUA', 2],
  ['MERCADO ORIENTAL', 'MANAGUA', 2],
  ['IVAN MONTENEGRO', 'MANAGUA', 2],
  ['ISRAEL LEWITES', 'MANAGUA', 2],
  ['LOS ROBLES', 'MANAGUA', 2],
  ['BELLO HORIZONTE', 'MANAGUA', 2],
  ['ALTAMIRA', 'MANAGUA', 2],
  ['BOLONIA', 'MANAGUA', 2],
  ['METROCENTRO', 'MANAGUA', 2],
  ['GALERIAS SANTO DOMINGO', 'MANAGUA', 2],
  ['MULTICENTRO', 'MANAGUA', 2],
  ['PLAZA INTER', 'MANAGUA', 2],
  ['PLAZA ESPANA', 'MANAGUA', 2],
  ['ROTONDA EL GUEGUENSE', 'MANAGUA', 2],
  ['ROTONDA GUEGUENSE', 'MANAGUA', 2],
  ['ROTONDA RUBEN DARIO', 'MANAGUA', 2],
  ['ROTONDA SANTO DOMINGO', 'MANAGUA', 2],
  ['ROTONDA UNIVERSITARIA', 'MANAGUA', 2],
  ['ROTONDA CRISTO REY', 'MANAGUA', 2],
  ['ROTONDA BELLO HORIZONTE', 'MANAGUA', 2],
  ['ROTONDA LA VIRGEN', 'MANAGUA', 2],
  ['ROTONDA EL PERIODISTA', 'MANAGUA', 2],
  ['ROTONDA CENTROAMERICA', 'MANAGUA', 2],
  ['JEAN PAUL GENIE', 'MANAGUA', 2],
  ['COLONIA CENTROAMERICA', 'MANAGUA', 2],
  ['COL CENTROAMERICA', 'MANAGUA', 2],
  ['COLONIA NICARAO', 'MANAGUA', 2],
  ['MIGUEL BONILLA', 'MANAGUA', 2],
  ['14 DE SEPTIEMBRE', 'MANAGUA', 1],
  ['VILLA FONTANA', 'MANAGUA', 2],
  ['LAS COLINAS', 'MANAGUA', 2],
  ['LINDA VISTA', 'MANAGUA', 2],
  ['ALTAGRACIA', 'MANAGUA', 2],
  ['MONSENOR LEZCANO', 'MANAGUA', 2],
  ['VILLA LIBERTAD', 'MANAGUA', 2],
  ['VILLA VENEZUELA', 'MANAGUA', 2],
  ['VILLA PROGRESO', 'MANAGUA', 2],
  ['VILLA AUSTRIA', 'MANAGUA', 2],
  ['VILLA REVOLUCION', 'MANAGUA', 2],
  ['BATAHOLA', 'MANAGUA', 2],
  ['LOS LAURELES', 'MANAGUA', 1],
  ['SAN JUDAS', 'MANAGUA', 2],
  ['VILLA FLOR', 'MANAGUA', 2],
  ['TEODOLINDA', 'MANAGUA', 2],
  ['SEMINOLE', 'MANAGUA', 2],
  ['SEMINOLLE', 'MANAGUA', 2],
  ['CROWNE PLAZA', 'MANAGUA', 2],
  ['HOSPITAL MILITAR', 'MANAGUA', 2],
  ['LENIN FONSECA', 'MANAGUA', 2],
  ['BERTHA CALDERON', 'MANAGUA', 2],
  ['VELEZ PAIZ', 'MANAGUA', 2],
  ['MANOLO MORALES', 'MANAGUA', 2],
  ['ZUMEN', 'MANAGUA', 2],
  ['ENABUS', 'MANAGUA', 2],
  ['CAMPO BRUCE', 'MANAGUA', 2],
  ['GEORGINO ANDRADE', 'MANAGUA', 2],
  ['JOSE BENITO ESCOBAR', 'MANAGUA', 2],
  ['RUBENIA', 'MANAGUA', 2],
  ['CIUDAD JARDIN', 'MANAGUA', 2],
  ['REPARTO SCHICK', 'MANAGUA', 2],
  ['SCHICK', 'MANAGUA', 2],
  ['ANDRES CASTRO', 'MANAGUA', 1],
  ['PANCASAN', 'MANAGUA', 1],
  ['TISCAPA', 'MANAGUA', 2],
  ['PLAZA DE LA REVOLUCION', 'MANAGUA', 2],
  ['ASAMBLEA NACIONAL', 'MANAGUA', 2],
  ['CASA PRESIDENCIAL', 'MANAGUA', 2],
  ['EMBAJADA', 'MANAGUA', 2],
  ['AEROPUERTO INTERNACIONAL', 'MANAGUA', 2],
  ['AEROPUERTO AUGUSTO', 'MANAGUA', 2],
  ['LAS MERCEDES', 'MANAGUA', 1],
  ['LA SUBASTA', 'MANAGUA', 2],
  ['RIGUERO', 'MANAGUA', 2],
  ['MARTHA QUEZADA', 'MANAGUA', 2],
  ['ACAHUALINCA', 'MANAGUA', 2],
  ['CARLOS MARX', 'MANAGUA', 2],
  ['LOMAS DE GUADALUPE', 'MANAGUA', 1],
  ['NEJAPA', 'MANAGUA', 2],
  ['SIERRITAS', 'MANAGUA', 2],
  ['SANTO DOMINGO', 'MANAGUA', 1],
  ['ESQUIPULAS', 'MANAGUA', 1],
  ['LARREYNAGA', 'MANAGUA', 1],
  ['WASPAN', 'MANAGUA', 1],
  ['UNAN MANAGUA', 'MANAGUA', 3],
  ['UCA', 'MANAGUA', 1],
  ['TIP TOP LOS ROBLES', 'MANAGUA', 2],
  ['CAMINO VIEJO A SANTO DOMINGO', 'MANAGUA', 2],
  ['VICKY', 'MANAGUA', 2],
  ['27 DE MAYO', 'MANAGUA', 2],
  ['MONTE DE LOS OLIVOS', 'MANAGUA', 2],
  ['MONTES DE LOS OLIVOS', 'MANAGUA', 2],
  ['TICA BUS', 'MANAGUA', 2],
  ['TICABUS', 'MANAGUA', 2],
  ['MONTOYA', 'MANAGUA', 2],
  ['HOLIDAY INN', 'MANAGUA', 2],
  ['OFIPLAZA', 'MANAGUA', 2],
  ['EL RETIRO', 'MANAGUA', 1],
  ['INVERCASA', 'MANAGUA', 2],
  ['ENABAS', 'MANAGUA', 1],
  ['TENDERI', 'MANAGUA', 2],
  ['CRUZ AZUL', 'MANAGUA', 1],
  ['COLEGIO AMERICANO', 'MANAGUA', 2],
  ['LOZELSA', 'MANAGUA', 2],
  ['LLANTASA', 'MANAGUA', 2],
  ['MIGUEL GUTIERREZ', 'MANAGUA', 2],
  ['PIO X', 'MANAGUA', 2],
  ['PIPITOS', 'MANAGUA', 1],
  ['POLISAL', 'MANAGUA', 2],
  ['VIVIAN PELLAS', 'MANAGUA', 2],
  ['HOSPITAL METROPOLITANO', 'MANAGUA', 2],
  ['CANAL 2', 'MANAGUA', 2],
  ['EL PERIODISTA', 'MANAGUA', 2],
  ['ROTONDA PERIODISTA', 'MANAGUA', 2],
  ['JULIO MARTINEZ', 'MANAGUA', 2],
  ['EL CHAMAN', 'MANAGUA', 2],
  ['C SANDINO', 'MANAGUA', 2],
  ['CLUB TERRAZA', 'MANAGUA', 2],
  ['VILLA FRATERNIDAD', 'MANAGUA', 2],
  ['VI VENEZUELA', 'MANAGUA', 2],
  ['LAS AMERICAS', 'MANAGUA', 1],
  ['AL LAGO', 'MANAGUA', 1],
  // Masaya
  ['MASAYA', 'MASAYA', 3],
  ['NINDIRI', 'MASAYA', 3],
  ['TISMA', 'MASAYA', 3],
  ['CATARINA', 'MASAYA', 2],
  ['SAN JUAN DE ORIENTE', 'MASAYA', 3],
  ['NIQUINOHOMO', 'MASAYA', 3],
  ['NANDASMO', 'MASAYA', 3],
  ['MASATEPE', 'MASAYA', 3],
  ['LA CONCEPCION', 'MASAYA', 1],
  ['SAN JUAN DE LA CONCEPCION', 'MASAYA', 3],
  ['MONIMBO', 'MASAYA', 2],
  ['COYOTEPE', 'MASAYA', 2],
  // Granada
  ['GRANADA', 'GRANADA', 3],
  ['DIRIOMO', 'GRANADA', 3],
  ['DIRIA', 'GRANADA', 3],
  ['NANDAIME', 'GRANADA', 3],
  ['MALACATOYA', 'GRANADA', 2],
  ['XALTEVA', 'GRANADA', 2],
  ['LAS ISLETAS', 'GRANADA', 2],
  ['LA CALZADA', 'GRANADA', 1],
  ['CALLE ATRAVESADA', 'GRANADA', 2],
  // Carazo
  ['CARAZO', 'CARAZO', 2],
  ['JINOTEPE', 'CARAZO', 3],
  ['DIRIAMBA', 'CARAZO', 3],
  ['SAN MARCOS', 'CARAZO', 1],
  ['DOLORES', 'CARAZO', 1],
  ['LA PAZ DE CARAZO', 'CARAZO', 3],
  ['EL ROSARIO', 'CARAZO', 1],
  ['SANTA TERESA', 'CARAZO', 1],
  ['LA CONQUISTA', 'CARAZO', 2],
  ['LA BOQUITA', 'CARAZO', 2],
  ['CASARES', 'CARAZO', 2],
  ['HUEHUETE', 'CARAZO', 2],
  // Rivas
  ['RIVAS', 'RIVAS', 2],
  ['TOLA', 'RIVAS', 2],
  ['BELEN', 'RIVAS', 1],
  ['POTOSI', 'RIVAS', 1],
  ['BUENOS AIRES', 'RIVAS', 1],
  ['MOYOGALPA', 'RIVAS', 3],
  ['ALTAGRACIA OMETEPE', 'RIVAS', 3],
  ['OMETEPE', 'RIVAS', 3],
  ['SAN JORGE', 'RIVAS', 1],
  ['SAN JUAN DEL SUR', 'RIVAS', 3],
  ['CARDENAS', 'RIVAS', 1],
  ['GUASACATE', 'RIVAS', 2],
  ['POPOYO', 'RIVAS', 2],
  ['PENAS BLANCAS', 'RIVAS', 2],
  ['GIGANTE', 'RIVAS', 1],
  // León
  ['LEON', 'LEON', 3],
  ['NAGAROTE', 'LEON', 3],
  ['LA PAZ CENTRO', 'LEON', 3],
  ['EL JICARAL', 'LEON', 3],
  ['SANTA ROSA DEL PENON', 'LEON', 3],
  ['MALPAISILLO', 'LEON', 3],
  ['TELICA', 'LEON', 3],
  ['QUEZALGUAQUE', 'LEON', 3],
  ['EL SAUCE', 'LEON', 3],
  ['ACHUAPA', 'LEON', 3],
  ['MINA EL LIMON', 'LEON', 3],
  ['SUBTIAVA', 'LEON', 2],
  ['SUTIAVA', 'LEON', 2],
  ['PONELOYA', 'LEON', 2],
  ['LAS PENITAS', 'LEON', 2],
  ['LA RECOLECCION', 'LEON', 2],
  // Chinandega
  ['CHINANDEGA', 'CHINANDEGA', 3],
  ['EL VIEJO', 'CHINANDEGA', 2],
  ['CORINTO', 'CHINANDEGA', 3],
  ['CHICHIGALPA', 'CHINANDEGA', 3],
  ['POSOLTEGA', 'CHINANDEGA', 3],
  ['EL REALEJO', 'CHINANDEGA', 3],
  ['PUERTO MORAZAN', 'CHINANDEGA', 3],
  ['SOMOTILLO', 'CHINANDEGA', 3],
  ['VILLANUEVA', 'CHINANDEGA', 1],
  ['SANTO TOMAS DEL NORTE', 'CHINANDEGA', 3],
  ['CINCO PINOS', 'CHINANDEGA', 3],
  ['SAN FRANCISCO DEL NORTE', 'CHINANDEGA', 3],
  ['SAN PEDRO DEL NORTE', 'CHINANDEGA', 3],
  ['JIQUILILLO', 'CHINANDEGA', 2],
  ['GUASAULE', 'CHINANDEGA', 2],
  ['INGENIO SAN ANTONIO', 'CHINANDEGA', 2],
  // Estelí
  ['ESTELI', 'ESTELI', 3],
  ['CONDEGA', 'ESTELI', 3],
  ['PUEBLO NUEVO', 'ESTELI', 1],
  ['SAN JUAN DE LIMAY', 'ESTELI', 3],
  ['LA TRINIDAD', 'ESTELI', 1],
  ['SAN NICOLAS', 'ESTELI', 1],
  ['MIRAFLOR', 'ESTELI', 2],
  // Madriz
  ['MADRIZ', 'MADRIZ', 3],
  ['SOMOTO', 'MADRIZ', 3],
  ['TOTOGALPA', 'MADRIZ', 3],
  ['TELPANECA', 'MADRIZ', 3],
  ['SAN JUAN DE RIO COCO', 'MADRIZ', 3],
  ['PALACAGUINA', 'MADRIZ', 3],
  ['YALAGUINA', 'MADRIZ', 3],
  ['LAS SABANAS', 'MADRIZ', 2],
  ['SAN LUCAS', 'MADRIZ', 1],
  ['CUSMAPA', 'MADRIZ', 3],
  // Nueva Segovia
  ['NUEVA SEGOVIA', 'NUEVA_SEGOVIA', 3],
  ['OCOTAL', 'NUEVA_SEGOVIA', 3],
  ['JALAPA', 'NUEVA_SEGOVIA', 3],
  ['EL JICARO', 'NUEVA_SEGOVIA', 3],
  ['QUILALI', 'NUEVA_SEGOVIA', 3],
  ['WIWILI', 'NUEVA_SEGOVIA', 1],
  ['MURRA', 'NUEVA_SEGOVIA', 3],
  ['CIUDAD ANTIGUA', 'NUEVA_SEGOVIA', 3],
  ['MOZONTE', 'NUEVA_SEGOVIA', 3],
  ['DIPILTO', 'NUEVA_SEGOVIA', 3],
  ['MACUELIZO', 'NUEVA_SEGOVIA', 3],
  ['LAS MANOS', 'NUEVA_SEGOVIA', 1],
  ['INSTITUTO NACIONAL DE SEGOVIA', 'NUEVA_SEGOVIA', 2],
  // Jinotega
  ['JINOTEGA', 'JINOTEGA', 3],
  ['SAN RAFAEL DEL NORTE', 'JINOTEGA', 3],
  ['SAN SEBASTIAN DE YALI', 'JINOTEGA', 3],
  ['YALI', 'JINOTEGA', 2],
  ['LA CONCORDIA', 'JINOTEGA', 1],
  ['PANTASMA', 'JINOTEGA', 3],
  ['EL CUA', 'JINOTEGA', 3],
  ['BOCAY', 'JINOTEGA', 3],
  ['WIWILI DE JINOTEGA', 'JINOTEGA', 3],
  // Matagalpa
  ['MATAGALPA', 'MATAGALPA', 3],
  ['SEBACO', 'MATAGALPA', 3],
  ['SAN ISIDRO', 'MATAGALPA', 1],
  ['CIUDAD DARIO', 'MATAGALPA', 3],
  ['TERRABONA', 'MATAGALPA', 3],
  ['SAN DIONISIO', 'MATAGALPA', 2],
  ['MUY MUY', 'MATAGALPA', 3],
  ['SAN RAMON', 'MATAGALPA', 1],
  ['MATIGUAS', 'MATAGALPA', 3],
  ['RIO BLANCO', 'MATAGALPA', 2],
  ['RANCHO GRANDE', 'MATAGALPA', 2],
  ['LA DALIA', 'MATAGALPA', 2],
  ['EL TUMA', 'MATAGALPA', 3],
  ['SELVA NEGRA', 'MATAGALPA', 2],
  ['GUANUCA', 'MATAGALPA', 2],
  // Boaco
  ['BOACO', 'BOACO', 3],
  ['CAMOAPA', 'BOACO', 3],
  ['SAN JOSE DE LOS REMATES', 'BOACO', 3],
  ['SAN LORENZO', 'BOACO', 1],
  ['SANTA LUCIA', 'BOACO', 1],
  ['TEUSTEPE', 'BOACO', 3],
  // Chontales
  ['CHONTALES', 'CHONTALES', 3],
  ['JUIGALPA', 'CHONTALES', 3],
  ['ACOYAPA', 'CHONTALES', 3],
  ['COMALAPA', 'CHONTALES', 3],
  ['CUAPA', 'CHONTALES', 3],
  ['EL CORAL', 'CHONTALES', 2],
  ['LA LIBERTAD', 'CHONTALES', 1],
  ['LOVAGO', 'CHONTALES', 3],
  ['SANTO TOMAS', 'CHONTALES', 2],
  ['VILLA SANDINO', 'CHONTALES', 3],
  // Río San Juan
  ['RIO SAN JUAN', 'RIO_SAN_JUAN', 3],
  ['SAN CARLOS', 'RIO_SAN_JUAN', 1],
  ['EL CASTILLO', 'RIO_SAN_JUAN', 2],
  ['MORRITO', 'RIO_SAN_JUAN', 3],
  ['EL ALMENDRO', 'RIO_SAN_JUAN', 2],
  ['SAN MIGUELITO', 'RIO_SAN_JUAN', 2],
  ['SAN JUAN DE NICARAGUA', 'RIO_SAN_JUAN', 3],
  ['SAN JUAN DEL NORTE', 'RIO_SAN_JUAN', 3],
  // Costa Caribe Norte
  ['COSTA CARIBE NORTE', 'COSTA_CARIBE_NORTE', 3],
  ['CARIBE NORTE', 'COSTA_CARIBE_NORTE', 3],
  ['RACCN', 'COSTA_CARIBE_NORTE', 3],
  ['RAAN', 'COSTA_CARIBE_NORTE', 3],
  ['BILWI', 'COSTA_CARIBE_NORTE', 3],
  ['PUERTO CABEZAS', 'COSTA_CARIBE_NORTE', 3],
  ['PTO CABEZAS', 'COSTA_CARIBE_NORTE', 3],
  ['WASPAM', 'COSTA_CARIBE_NORTE', 2],
  ['ROSITA', 'COSTA_CARIBE_NORTE', 1],
  ['BONANZA', 'COSTA_CARIBE_NORTE', 1],
  ['SIUNA', 'COSTA_CARIBE_NORTE', 3],
  ['PRINZAPOLKA', 'COSTA_CARIBE_NORTE', 3],
  ['MULUKUKU', 'COSTA_CARIBE_NORTE', 3],
  ['WASLALA', 'COSTA_CARIBE_NORTE', 3],
  // Costa Caribe Sur
  ['COSTA CARIBE SUR', 'COSTA_CARIBE_SUR', 3],
  ['CARIBE SUR', 'COSTA_CARIBE_SUR', 3],
  ['RACCS', 'COSTA_CARIBE_SUR', 3],
  ['RAAS', 'COSTA_CARIBE_SUR', 3],
  ['BLUEFIELDS', 'COSTA_CARIBE_SUR', 3],
  ['CORN ISLAND', 'COSTA_CARIBE_SUR', 3],
  ['ISLA DEL MAIZ', 'COSTA_CARIBE_SUR', 3],
  ['LAGUNA DE PERLAS', 'COSTA_CARIBE_SUR', 3],
  ['PEARL LAGOON', 'COSTA_CARIBE_SUR', 3],
  ['EL RAMA', 'COSTA_CARIBE_SUR', 3],
  ['CIUDAD RAMA', 'COSTA_CARIBE_SUR', 3],
  ['NUEVA GUINEA', 'COSTA_CARIBE_SUR', 3],
  ['MUELLE DE LOS BUEYES', 'COSTA_CARIBE_SUR', 3],
  ['KUKRA HILL', 'COSTA_CARIBE_SUR', 3],
  ['EL TORTUGUERO', 'COSTA_CARIBE_SUR', 3],
  ['CRUZ DE RIO GRANDE', 'COSTA_CARIBE_SUR', 3],
  ['PAIWAS', 'COSTA_CARIBE_SUR', 3],
];

/**
 * Prefijo de teléfono fijo (8 dígitos que empiezan por 2) → departamento. Los celulares (5, 7, 8)
 * no indican ubicación.
 */
const LANDLINE_PREFIXES: ReadonlyArray<readonly [prefix: string, department: Department]> = [
  ['22', 'MANAGUA'],
  ['231', 'LEON'],
  ['234', 'CHINANDEGA'],
  ['251', 'CHONTALES'],
  ['252', 'MASAYA'],
  ['253', 'CARAZO'],
  ['254', 'BOACO'],
  ['255', 'GRANADA'],
  ['256', 'RIVAS'],
  ['257', 'COSTA_CARIBE_SUR'],
  ['258', 'RIO_SAN_JUAN'],
  ['271', 'ESTELI'],
  ['272', 'MADRIZ'],
  ['273', 'NUEVA_SEGOVIA'],
  ['277', 'MATAGALPA'],
  ['278', 'JINOTEGA'],
  ['279', 'COSTA_CARIBE_NORTE'],
];

const PHONE_WEIGHT = 2;
/** Puntuación mínima del ganador para asignar departamento. */
const MIN_SCORE = 2;

/** Vías cuyo nombre puede llevar el destino pegado: "CARRETERA MASAYA", "PANAMERICANA LEON". */
const DIRECT_ROUTE_WORDS = new Set(['CARRETERA', 'PANAMERICANA', 'BYPASS']);
/** Palabras que, seguidas de "A/HACIA/PARA", convierten el lugar en destino ("SALIDA A MASAYA"). */
const ROUTE_WORDS = new Set([
  ...DIRECT_ROUTE_WORDS,
  'CAMINO',
  'SALIDA',
  'EMPALME',
  'RUTA',
  'BUSES',
  'BUS',
  'EXPRESOS',
  'EXPRESO',
  'VIA',
  'NUEVA',
  'VIEJA',
  'ANTIGUA',
]);
const DESTINATION_CONNECTORS = new Set(['A', 'HACIA', 'PARA', 'RUMBO']);
const FILLER = new Set(['AL', 'LA', 'EL', 'DE', 'DEL']);

/**
 * Carreteras que salen de Managua: hasta el km indicado el punto sigue en el departamento de
 * Managua; a partir de `beyond.fromKm` (si existe) pertenece a otro departamento.
 */
const KM_ROADS: ReadonlyArray<{
  pattern: RegExp;
  managuaUntilKm: number;
  beyond?: { fromKm: number; untilKm: number; department: Department };
}> = [
  {
    pattern: /\bCARRETERA (MANAGUA )?(A )?MASAYA\b/,
    managuaUntilKm: 19,
    beyond: { fromKm: 20, untilKm: 31, department: 'MASAYA' },
  },
  { pattern: /\bCARRETERA NORTE\b/, managuaUntilKm: 30 },
  { pattern: /\bCARRETERA SUR\b/, managuaUntilKm: 27 },
  { pattern: /\bCARRETERA VIEJA (A )?LEON\b/, managuaUntilKm: 30 },
  { pattern: /\bCARRETERA (MANAGUA )?(NUEVA )?(A )?LEON\b/, managuaUntilKm: 40 },
  { pattern: /\bCARRETERA (MANAGUA )?(A )?TIPITAPA\b/, managuaUntilKm: 30 },
];

/** Mayúsculas, sin tildes ni signos; "KM.11" → "KM 11"; "1/2" y "11.5" → número decimal. */
export function normalizeAddressText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/(\d+)\s*1\/2/g, '$1.5')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^A-Z0-9.]+/g, ' ')
    .replace(/\.(?!\d)|(?<!\d)\./g, ' ')
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bKILOMETROS?\b|\bKMS?\b|\bKLM\b/g, 'KM')
    .replace(/\bCARR(ET)?\b|\bCTRA\b/g, 'CARRETERA');
}

interface CompiledEntry {
  tokens: string[];
  department: Department;
  weight: number;
}

const COMPILED: CompiledEntry[] = GAZETTEER.map(([term, department, weight]) => ({
  tokens: normalizeAddressText(term).split(' '),
  department,
  weight,
})).sort((a, b) => b.tokens.length - a.tokens.length);

const FIRST_TOKEN_INDEX = new Map<string, CompiledEntry[]>();
for (const entry of COMPILED) {
  const first = entry.tokens[0] as string;
  const list = FIRST_TOKEN_INDEX.get(first) ?? [];
  list.push(entry);
  FIRST_TOKEN_INDEX.set(first, list);
}

/** ¿El lugar que empieza en `start` es destino de una vía ("CARRETERA A LEON", "SALIDA A MASAYA")? */
function isRouteDestination(tokens: string[], start: number): boolean {
  const previous = tokens[start - 1];
  if (previous && DIRECT_ROUTE_WORDS.has(previous)) return true;
  let sawConnector = false;
  for (let i = start - 1; i >= Math.max(0, start - 5); i--) {
    const token = tokens[i] as string;
    if (DESTINATION_CONNECTORS.has(token)) sawConnector = true;
    else if (ROUTE_WORDS.has(token)) return sawConnector;
    else if (!FILLER.has(token) && !/^\d/.test(token)) return false;
  }
  return false;
}

function scoreKmRoads(text: string, scores: Map<Department, number>): void {
  const km = text.match(/\bKM (\d+(?:\.\d+)?)/);
  if (!km) return;
  const value = Number(km[1]);
  for (const road of KM_ROADS) {
    if (!road.pattern.test(text)) continue;
    if (value <= road.managuaUntilKm) add(scores, 'MANAGUA', 2);
    else if (road.beyond && value >= road.beyond.fromKm && value <= road.beyond.untilKm) {
      add(scores, road.beyond.department, 2);
    }
    return;
  }
}

function add(scores: Map<Department, number>, department: Department, weight: number): void {
  scores.set(department, (scores.get(department) ?? 0) + weight);
}

/** Puntúa una dirección: suma el peso de cada lugar reconocido (coincidencia más larga primero). */
export function scoreAddress(raw: string): Map<Department, number> {
  const scores = new Map<Department, number>();
  const text = normalizeAddressText(raw);
  if (text.length === 0) return scores;
  const tokens = text.split(' ');
  const hasKmRoad = /\bKM \d/.test(text);
  // Fin del último lugar leído como destino de una vía: "CARRETERA MANAGUA MASAYA" encadena dos.
  let routeEnd = -1;

  for (let i = 0; i < tokens.length; i++) {
    const candidates = FIRST_TOKEN_INDEX.get(tokens[i] as string);
    if (!candidates) continue;
    const entry = candidates.find((c) => c.tokens.every((t, k) => tokens[i + k] === t));
    if (!entry) continue;
    const isRoadName = entry.tokens[0] === 'CARRETERA';
    // Con km, la carretera la puntúa scoreKmRoads (que distingue Managua de Masaya).
    if (isRoadName && hasKmRoad) {
      i += entry.tokens.length - 1;
      continue;
    }
    if (!isRoadName && (i === routeEnd || isRouteDestination(tokens, i))) {
      routeEnd = i + entry.tokens.length;
      i += entry.tokens.length - 1;
      continue;
    }
    add(scores, entry.department, entry.weight);
    i += entry.tokens.length - 1;
  }
  scoreKmRoads(text, scores);
  // Rutas de bus urbano de Managua (101–199): "TERMINAL RUTA 112", "TERMINAL 165".
  if (/\bTERMINAL (DE )?(LA )?(RUTA )?1\d\d\b/.test(text)) add(scores, 'MANAGUA', 2);
  return scores;
}

/** Departamento según el prefijo del teléfono fijo, o null si es celular o no es de Nicaragua. */
export function departmentFromPhone(phone: string | null | undefined): Department | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '').replace(/^505(?=\d{8}$)/, '');
  if (digits.length !== 8 || !digits.startsWith('2')) return null;
  for (const [prefix, department] of LANDLINE_PREFIXES) {
    if (digits.startsWith(prefix)) return department;
  }
  return null;
}

export type DepartmentEvidence = 'ADDRESS' | 'PHONE';

export interface DepartmentInference {
  department: Department;
  /** ADDRESS si la dirección aportó al resultado; PHONE si solo lo decidió el teléfono fijo. */
  evidence: DepartmentEvidence;
}

/**
 * Deduce el departamento de una empresa a partir de sus direcciones y su teléfono. Función pura.
 * Devuelve null si no hay pistas o si dos departamentos empatan.
 */
export function inferDepartment(input: {
  addresses: ReadonlyArray<string | null | undefined>;
  phone?: string | null;
}): DepartmentInference | null {
  const total = new Map<Department, number>();
  const unique = new Set(
    input.addresses.filter((a): a is string => !!a && a.trim().length > 0).map((a) => a.trim()),
  );
  for (const address of unique) {
    for (const [department, weight] of scoreAddress(address)) add(total, department, weight);
  }
  const fromAddress = new Set(total.keys());
  const phoneDepartment = departmentFromPhone(input.phone);
  if (phoneDepartment) add(total, phoneDepartment, PHONE_WEIGHT);

  let best: Department | null = null;
  let bestScore = 0;
  let tie = false;
  for (const [department, score] of total) {
    if (score > bestScore) {
      best = department;
      bestScore = score;
      tie = false;
    } else if (score === bestScore) tie = true;
  }
  // Un único nombre ambiguo (peso 1) no basta para decidir.
  if (!best || tie || bestScore < MIN_SCORE) return null;
  return { department: best, evidence: fromAddress.has(best) ? 'ADDRESS' : 'PHONE' };
}

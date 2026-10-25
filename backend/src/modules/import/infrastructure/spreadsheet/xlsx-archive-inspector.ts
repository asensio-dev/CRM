import { open } from 'node:fs/promises';

/**
 * Inspección barata de un .xlsx (ZIP) ANTES de entregarlo a ExcelJS, para rechazar archivos que no
 * son ZIP o que son "bombas" de descompresión. Solo lee la firma y el directorio central (metadatos):
 * nunca descomprime nada. Los tamaños declarados podrían mentir; el tope de filas del caso de uso
 * cubre ese resto.
 */
export interface XlsxArchiveLimits {
  /** Suma máxima de tamaños descomprimidos declarados. */
  maxUncompressedBytes: number;
  /** Relación máxima descomprimido/comprimido de una entrada (las bombas usan > 1000:1). */
  maxEntryRatio: number;
  maxEntries: number;
}

export const DEFAULT_XLSX_LIMITS: XlsxArchiveLimits = {
  // El Excel real (~15 MB, 127 k filas) declara ~79 MB descomprimidos con ratio < 10:1; margen amplio.
  maxUncompressedBytes: 1024 * 1024 * 1024,
  maxEntryRatio: 100,
  maxEntries: 10_000,
};

export type XlsxInspection =
  | { ok: true; entries: number; uncompressedBytes: number }
  | { ok: false; reason: string };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;
const EOCD_MIN = 22;
const EOCD_MAX_SEARCH = EOCD_MIN + 0xffff; // el comentario del ZIP mide como mucho 64 KiB
/** Entradas pequeñas comprimen mucho de forma legítima (XML repetitivo): no se mide su ratio. */
const RATIO_MIN_UNCOMPRESSED = 1024 * 1024;

export async function inspectXlsxArchive(
  filePath: string,
  limits: XlsxArchiveLimits = DEFAULT_XLSX_LIMITS,
): Promise<XlsxInspection> {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    if (size < EOCD_MIN + 4) return { ok: false, reason: 'El archivo no es un .xlsx válido' };

    const signature = Buffer.alloc(4);
    await handle.read(signature, 0, 4, 0);
    if (signature.readUInt32LE(0) !== LOCAL_HEADER) {
      return { ok: false, reason: 'El archivo no es un .xlsx válido' };
    }

    const tailLength = Math.min(size, EOCD_MAX_SEARCH);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    let eocd = -1;
    for (let i = tailLength - EOCD_MIN; i >= 0; i--) {
      if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIR) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return { ok: false, reason: 'El archivo no es un .xlsx válido' };

    const entries = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    // ZIP64 (marcadores 0xFFFF / 0xFFFFFFFF): un .xlsx de ≤ 50 MB no lo necesita.
    if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      return { ok: false, reason: 'Formato ZIP64 no admitido' };
    }
    if (entries > limits.maxEntries)
      return { ok: false, reason: 'Demasiadas entradas en el .xlsx' };
    if (cdOffset + cdSize > size) return { ok: false, reason: 'El archivo no es un .xlsx válido' };

    const cd = Buffer.alloc(cdSize);
    await handle.read(cd, 0, cdSize, cdOffset);
    let offset = 0;
    let total = 0;
    for (let n = 0; n < entries; n++) {
      if (offset + 46 > cd.length || cd.readUInt32LE(offset) !== CENTRAL_HEADER) {
        return { ok: false, reason: 'El archivo no es un .xlsx válido' };
      }
      const compressed = cd.readUInt32LE(offset + 20);
      const uncompressed = cd.readUInt32LE(offset + 24);
      if (compressed === 0xffffffff || uncompressed === 0xffffffff) {
        return { ok: false, reason: 'Formato ZIP64 no admitido' };
      }
      total += uncompressed;
      if (total > limits.maxUncompressedBytes) {
        return { ok: false, reason: 'El contenido descomprimido del .xlsx es demasiado grande' };
      }
      if (
        uncompressed >= RATIO_MIN_UNCOMPRESSED &&
        uncompressed > Math.max(compressed, 1) * limits.maxEntryRatio
      ) {
        return { ok: false, reason: 'Compresión anómala en el .xlsx' };
      }
      offset +=
        46 +
        cd.readUInt16LE(offset + 28) +
        cd.readUInt16LE(offset + 30) +
        cd.readUInt16LE(offset + 32);
    }
    return { ok: true, entries, uncompressedBytes: total };
  } finally {
    await handle.close();
  }
}

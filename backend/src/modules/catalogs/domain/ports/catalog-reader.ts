import type { CatalogItem } from '@axiom/contracts';

/** Lectura de catálogos (sectores económicos y actividades). */
export interface CatalogReader {
  listSectors(): Promise<CatalogItem[]>;
  /** `q` filtra por nombre (contiene). Son ~900 actividades; se devuelven todas ordenadas por nombre. */
  listActivities(q?: string): Promise<CatalogItem[]>;
}

export const CATALOG_READER = Symbol('CatalogReader');

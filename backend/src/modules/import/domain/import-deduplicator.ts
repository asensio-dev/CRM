import type { BranchData, CompanyCandidate } from './import-row';

/**
 * Política de deduplicación:
 *  - la primera fila válida de un RUC crea la empresa (COMPANY);
 *  - las siguientes filas con el mismo RUC son sucursales (BRANCH);
 *  - una fila cuya combinación tradeName+dirección+teléfono ya se vio para ese RUC (incluida la
 *    de la propia empresa) se omite (DUPLICATE).
 * Estado en memoria: ~127 k claves, unos pocos MB.
 */
export type RowKind = 'COMPANY' | 'BRANCH' | 'DUPLICATE';

export function branchKey(b: Pick<BranchData, 'tradeName' | 'address' | 'phone'>): string {
  return [b.tradeName, b.address, b.phone].map((v) => (v ?? '').toLowerCase()).join('|');
}

export class ImportDeduplicator {
  private readonly seen = new Map<string, Set<string>>();

  classify(candidate: CompanyCandidate): RowKind {
    const key = branchKey(candidate);
    const keys = this.seen.get(candidate.ruc);
    if (!keys) {
      this.seen.set(candidate.ruc, new Set([key]));
      return 'COMPANY';
    }
    if (keys.has(key)) return 'DUPLICATE';
    keys.add(key);
    return 'BRANCH';
  }
}

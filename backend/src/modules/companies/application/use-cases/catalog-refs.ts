import { DomainError } from '../../../../shared/domain';
import type { CompanyReader } from '../../domain';

/** Verifica que sector y actividad referenciados existan (evita un 500 por violación de FK). */
export async function assertCatalogRefsExist(
  reader: CompanyReader,
  refs: { sectorId: number | null; activityId: number | null },
): Promise<void> {
  if (refs.sectorId === null && refs.activityId === null) return;
  const missing = await reader.findMissingCatalogRef(refs);
  if (missing === 'sector') {
    throw DomainError.validation('COMPANY_SECTOR_NOT_FOUND', 'El sector económico no existe');
  }
  if (missing === 'activity') {
    throw DomainError.validation('COMPANY_ACTIVITY_NOT_FOUND', 'La actividad económica no existe');
  }
}

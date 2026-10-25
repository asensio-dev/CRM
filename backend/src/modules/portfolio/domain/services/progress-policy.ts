import type { PipelineStatus } from '@axiom/contracts';

/**
 * Estados "más allá del bucle de contacto" (POR_CONTACTAR → CONTACTADO ⇄ SIN_RESPUESTA).
 * Llegar a cualquiera de ellos significa que la empresa respondió (ver ADR 0006).
 */
export const ADVANCED_STATUSES: readonly PipelineStatus[] = [
  'CON_RESPUESTA',
  'AGENDANDO_CITA',
  'EN_PROCESO_CONTRATO',
  'CONTRATO_ACTIVO',
];

export const isAdvancedStatus = (status: string): boolean =>
  (ADVANCED_STATUSES as readonly string[]).includes(status);

/** Hechos de una empresa dentro de la ventana [inicio, fin] del ciclo que se cierra. */
export interface CycleEvidence {
  companyId: number;
  /** Estado actual de la empresa. */
  currentStatus: string;
  /** Filas de `status_history` en la ventana cuyo `toStatus` ∈ ADVANCED_STATUSES. */
  advancedTransitions: number;
  /** Interacciones registradas en la ventana (por cualquier usuario). */
  interactions: number;
}

/**
 * "Avance" en un ciclo ⇔
 *   (a) al menos una transición hacia un estado avanzado dentro del ciclo, o
 *   (b) la empresa ya está en un estado avanzado y tuvo al menos una interacción en el ciclo
 *       (una negociación viva no es estancamiento aunque no cambie de columna).
 * Ir y volver entre CONTACTADO y SIN_RESPUESTA, solo intentar llamar o no hacer nada NO es avance.
 */
export function madeProgress(evidence: CycleEvidence | undefined): boolean {
  if (!evidence) return false;
  if (evidence.advancedTransitions > 0) return true;
  return isAdvancedStatus(evidence.currentStatus) && evidence.interactions > 0;
}

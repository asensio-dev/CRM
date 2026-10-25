import type { InteractionOutcome } from '@axiom/contracts';
import type { PipelineStatusCode } from '../value-objects/pipeline-status';

/**
 * Patrón Strategy: decide qué transiciones automáticas provoca el resultado de una interacción.
 * Solo PROPONE pasos; el agregado los valida uno a uno contra la máquina de estados.
 */
export interface OutcomePolicy {
  automaticTransitions(
    current: PipelineStatusCode,
    outcome: InteractionOutcome,
  ): PipelineStatusCode[];
}

/** Estados desde los que una interacción cuenta como (re)intento de contacto → CONTACTADO. */
const ATTEMPT_FROM: readonly PipelineStatusCode[] = ['POR_CONTACTAR', 'SIN_RESPUESTA'];

const OUTCOME_STEP: Record<InteractionOutcome, PipelineStatusCode | null> = {
  NO_CONTESTO: 'SIN_RESPUESTA',
  NUMERO_EQUIVOCADO: 'SIN_RESPUESTA',
  CONTESTO: 'CON_RESPUESTA',
  INTERESADO: 'CON_RESPUESTA',
  VOLVER_A_LLAMAR: 'CON_RESPUESTA',
  // Descartar es una decisión explícita del usuario (con motivo), nunca automática.
  NO_INTERESADO: null,
};

/**
 * Política por defecto (ver docs/adr/0003-pipeline-estados.md):
 *  1. Desde POR_CONTACTAR o SIN_RESPUESTA, la interacción es un intento → CONTACTADO.
 *  2. Estando en CONTACTADO (antes o tras el paso 1):
 *       NO_CONTESTO / NUMERO_EQUIVOCADO           → SIN_RESPUESTA
 *       CONTESTO / INTERESADO / VOLVER_A_LLAMAR   → CON_RESPUESTA
 *       NO_INTERESADO                             → sin cambio
 *  3. CON_RESPUESTA en adelante, CONTRATO_ACTIVO y DESCARTADO: solo se registra, sin transiciones.
 */
export class DefaultOutcomePolicy implements OutcomePolicy {
  automaticTransitions(
    current: PipelineStatusCode,
    outcome: InteractionOutcome,
  ): PipelineStatusCode[] {
    const steps: PipelineStatusCode[] = [];
    let status = current;
    if (ATTEMPT_FROM.includes(status)) {
      status = 'CONTACTADO';
      steps.push(status);
    }
    const next = OUTCOME_STEP[outcome];
    if (status === 'CONTACTADO' && next) steps.push(next);
    return steps;
  }
}

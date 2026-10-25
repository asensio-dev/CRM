import { describe, expect, test } from 'bun:test';
import { INTERACTION_OUTCOMES, type InteractionOutcome, PIPELINE_STATUSES } from '@axiom/contracts';
import { PipelineStatus, type PipelineStatusCode } from '../value-objects/pipeline-status';
import { DefaultOutcomePolicy } from './outcome-policy';

const policy = new DefaultOutcomePolicy();

const NO_ANSWER: InteractionOutcome[] = ['NO_CONTESTO', 'NUMERO_EQUIVOCADO'];
const ANSWER: InteractionOutcome[] = ['CONTESTO', 'INTERESADO', 'VOLVER_A_LLAMAR'];

/** Resultado esperado para cada (estado, resultado). */
function expected(from: PipelineStatusCode, outcome: InteractionOutcome): PipelineStatusCode[] {
  const steps: PipelineStatusCode[] = [];
  const attempt = from === 'POR_CONTACTAR' || from === 'SIN_RESPUESTA';
  if (attempt) steps.push('CONTACTADO');
  if (attempt || from === 'CONTACTADO') {
    if (NO_ANSWER.includes(outcome)) steps.push('SIN_RESPUESTA');
    if (ANSWER.includes(outcome)) steps.push('CON_RESPUESTA');
  }
  return steps;
}

const table = PIPELINE_STATUSES.flatMap((from) =>
  INTERACTION_OUTCOMES.map((outcome) => [from, outcome, expected(from, outcome)] as const),
);

describe('DefaultOutcomePolicy', () => {
  test.each(table)('%s + %s → %p', (from, outcome, steps) => {
    expect(policy.automaticTransitions(from, outcome)).toEqual(steps);
  });

  test('spot checks of the documented policy', () => {
    expect(policy.automaticTransitions('POR_CONTACTAR', 'NO_CONTESTO')).toEqual([
      'CONTACTADO',
      'SIN_RESPUESTA',
    ]);
    expect(policy.automaticTransitions('SIN_RESPUESTA', 'INTERESADO')).toEqual([
      'CONTACTADO',
      'CON_RESPUESTA',
    ]);
    expect(policy.automaticTransitions('CONTACTADO', 'VOLVER_A_LLAMAR')).toEqual(['CON_RESPUESTA']);
    expect(policy.automaticTransitions('POR_CONTACTAR', 'NO_INTERESADO')).toEqual(['CONTACTADO']);
    expect(policy.automaticTransitions('CONTACTADO', 'NO_INTERESADO')).toEqual([]);
    expect(policy.automaticTransitions('CON_RESPUESTA', 'NO_CONTESTO')).toEqual([]);
    expect(policy.automaticTransitions('AGENDANDO_CITA', 'CONTESTO')).toEqual([]);
    expect(policy.automaticTransitions('CONTRATO_ACTIVO', 'CONTESTO')).toEqual([]);
    expect(policy.automaticTransitions('DESCARTADO', 'INTERESADO')).toEqual([]);
  });

  test('never proposes DESCARTADO', () => {
    for (const [from, outcome] of table) {
      expect(policy.automaticTransitions(from, outcome)).not.toContain('DESCARTADO');
    }
  });

  test('every proposed step is a valid transition for the least privileged role', () => {
    for (const [from, outcome] of table) {
      let status = PipelineStatus.of(from);
      for (const step of policy.automaticTransitions(from, outcome)) {
        status = status.transitionTo(step, 'EJECUTIVO');
      }
    }
  });
});

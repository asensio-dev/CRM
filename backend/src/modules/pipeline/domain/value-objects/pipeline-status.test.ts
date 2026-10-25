import { describe, expect, test } from 'bun:test';
import { PIPELINE_STATUSES, USER_ROLES, type UserRole } from '@axiom/contracts';
import { DomainError } from '../../../../shared/domain';
import { PipelineStatus, type PipelineStatusCode } from './pipeline-status';

/** Tabla de referencia, escrita a mano e independiente de la implementación. */
const EXPECTED: Record<PipelineStatusCode, PipelineStatusCode[]> = {
  POR_CONTACTAR: ['CONTACTADO', 'DESCARTADO'],
  CONTACTADO: ['SIN_RESPUESTA', 'CON_RESPUESTA', 'DESCARTADO'],
  SIN_RESPUESTA: ['CONTACTADO', 'DESCARTADO'],
  CON_RESPUESTA: ['AGENDANDO_CITA', 'SIN_RESPUESTA', 'DESCARTADO'],
  AGENDANDO_CITA: ['EN_PROCESO_CONTRATO', 'CON_RESPUESTA', 'DESCARTADO'],
  EN_PROCESO_CONTRATO: ['CONTRATO_ACTIVO', 'AGENDANDO_CITA', 'DESCARTADO'],
  CONTRATO_ACTIVO: [],
  DESCARTADO: ['POR_CONTACTAR'],
};

const isAllowed = (from: PipelineStatusCode, to: PipelineStatusCode, role: UserRole) => {
  if (from === 'DESCARTADO' && to === 'POR_CONTACTAR') return role !== 'EJECUTIVO';
  return EXPECTED[from].includes(to);
};

const matrix = USER_ROLES.flatMap((role) =>
  PIPELINE_STATUSES.flatMap((from) =>
    PIPELINE_STATUSES.map((to) => [role, from, to, isAllowed(from, to, role)] as const),
  ),
);

function catchError(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

describe('PipelineStatus — transition matrix (every role × from × to)', () => {
  test('matrix covers 3 roles × 8 × 8 pairs', () => {
    expect(matrix).toHaveLength(USER_ROLES.length * 64);
  });

  test.each(matrix)('%s: %s → %s allowed=%p', (role, from, to, allowed) => {
    const status = PipelineStatus.of(from);
    expect(status.canTransitionTo(to, role)).toBe(allowed);
    if (allowed) {
      expect(status.transitionTo(to, role).value).toBe(to);
      return;
    }
    const error = catchError(() => status.transitionTo(to, role));
    if (from === 'DESCARTADO' && to === 'POR_CONTACTAR') {
      expect(error.code).toBe('PIPELINE_REACTIVATION_FORBIDDEN');
      expect(error.kind).toBe('FORBIDDEN');
    } else {
      expect(error.code).toBe('PIPELINE_INVALID_TRANSITION');
      expect(error.kind).toBe('RULE');
    }
    expect(error.details).toEqual({ from, to, allowed: status.allowedTransitions(role) });
  });
});

describe('PipelineStatus — state rules', () => {
  test.each(PIPELINE_STATUSES)('allowedTransitions(%s) for ADMIN matches the table', (from) => {
    expect(PipelineStatus.of(from).allowedTransitions('ADMIN')).toEqual(EXPECTED[from]);
  });

  test('DESCARTADO is reachable from every non-terminal state', () => {
    for (const from of PIPELINE_STATUSES) {
      const reachable = PipelineStatus.of(from).canTransitionTo('DESCARTADO', 'EJECUTIVO');
      expect(reachable).toBe(from !== 'CONTRATO_ACTIVO' && from !== 'DESCARTADO');
    }
  });

  test('only CONTRATO_ACTIVO is terminal', () => {
    const terminal = PIPELINE_STATUSES.filter((s) => PipelineStatus.of(s).isTerminal);
    expect(terminal).toEqual(['CONTRATO_ACTIVO']);
  });

  test('reactivation: ADMIN and SUPERVISOR yes, EJECUTIVO no', () => {
    const descartado = PipelineStatus.of('DESCARTADO');
    expect(descartado.allowedTransitions('ADMIN')).toEqual(['POR_CONTACTAR']);
    expect(descartado.allowedTransitions('SUPERVISOR')).toEqual(['POR_CONTACTAR']);
    expect(descartado.allowedTransitions('EJECUTIVO')).toEqual([]);
  });

  test('a status never transitions to itself', () => {
    for (const s of PIPELINE_STATUSES) {
      expect(PipelineStatus.of(s).canTransitionTo(s, 'ADMIN')).toBe(false);
    }
  });

  test('unknown statuses are rejected as VALIDATION', () => {
    const error = catchError(() => PipelineStatus.of('GANADO'));
    expect(error.kind).toBe('VALIDATION');
    expect(error.code).toBe('PIPELINE_UNKNOWN_STATUS');
  });

  test('value object equality and note rule', () => {
    expect(PipelineStatus.of('CONTACTADO').equals(PipelineStatus.of('CONTACTADO'))).toBe(true);
    expect(PipelineStatus.INITIAL.value).toBe('POR_CONTACTAR');
    expect(PipelineStatus.requiresNote('DESCARTADO')).toBe(true);
    expect(PipelineStatus.requiresNote('CONTACTADO')).toBe(false);
  });
});

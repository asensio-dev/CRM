import { describe, expect, test } from 'bun:test';
import { DomainError } from '../../../../shared/domain';
import { CompanyStatusChanged, InteractionRegistered } from '../events/pipeline-events';
import { DefaultOutcomePolicy } from '../services/outcome-policy';
import type { PipelineStatusCode } from '../value-objects/pipeline-status';
import { type Actor, CompanyPipeline } from './company-pipeline';

const now = new Date('2026-10-24T15:00:00Z');
const exec: Actor = { userId: 7, role: 'EJECUTIVO' };
const admin: Actor = { userId: 1, role: 'ADMIN' };
const policy = new DefaultOutcomePolicy();

const pipeline = (
  status: PipelineStatusCode = 'POR_CONTACTAR',
  lastContactAt: Date | null = null,
) => CompanyPipeline.restore({ companyId: 42, status, version: 3, lastContactAt });

function catchError(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error('se esperaba un DomainError');
}

describe('CompanyPipeline.changeStatus', () => {
  test('records history entry and CompanyStatusChanged event', () => {
    const p = pipeline('CONTACTADO');
    const transition = p.changeStatus('CON_RESPUESTA', exec, '  habló con gerente ', now);

    expect(transition).toEqual({ from: 'CONTACTADO', to: 'CON_RESPUESTA' });
    expect(p.status.value).toBe('CON_RESPUESTA');
    expect(p.version).toBe(3); // la versión solo cambia al persistir
    expect(p.pendingChanges().history).toEqual([
      {
        companyId: 42,
        userId: 7,
        fromStatus: 'CONTACTADO',
        toStatus: 'CON_RESPUESTA',
        note: 'habló con gerente',
        changedAt: now,
      },
    ]);
    const events = p.pullEvents();
    expect(events).toHaveLength(1);
    const event = events[0] as CompanyStatusChanged;
    expect(event).toBeInstanceOf(CompanyStatusChanged);
    expect(event.name).toBe('pipeline.company-status-changed');
    expect({ ...event }).toEqual({
      name: 'pipeline.company-status-changed',
      companyId: 42,
      from: 'CONTACTADO',
      to: 'CON_RESPUESTA',
      userId: 7,
      occurredAt: now,
    });
  });

  test('invalid transition leaves the aggregate untouched', () => {
    const p = pipeline('POR_CONTACTAR');
    const error = catchError(() => p.changeStatus('CONTRATO_ACTIVO', exec, null, now));
    expect(error.code).toBe('PIPELINE_INVALID_TRANSITION');
    expect(error.details).toEqual({
      from: 'POR_CONTACTAR',
      to: 'CONTRATO_ACTIVO',
      allowed: ['CONTACTADO', 'DESCARTADO'],
    });
    expect(p.status.value).toBe('POR_CONTACTAR');
    expect(p.hasChanges).toBe(false);
    expect(p.pullEvents()).toEqual([]);
  });

  test('DESCARTADO requires a non-blank note', () => {
    for (const note of [undefined, null, '', '   ']) {
      const p = pipeline('CON_RESPUESTA');
      const error = catchError(() => p.changeStatus('DESCARTADO', exec, note, now));
      expect(error.code).toBe('PIPELINE_NOTE_REQUIRED');
      expect(error.kind).toBe('VALIDATION');
      expect(p.status.value).toBe('CON_RESPUESTA');
      expect(p.hasChanges).toBe(false);
    }
    const p = pipeline('CON_RESPUESTA');
    p.changeStatus('DESCARTADO', exec, 'No tiene presupuesto', now);
    expect(p.status.value).toBe('DESCARTADO');
  });

  test('note longer than 1000 chars is rejected', () => {
    const error = catchError(() =>
      pipeline('CONTACTADO').changeStatus('CON_RESPUESTA', exec, 'x'.repeat(1001), now),
    );
    expect(error.code).toBe('PIPELINE_NOTE_TOO_LONG');
  });

  test('reactivation needs ADMIN/SUPERVISOR', () => {
    const error = catchError(() =>
      pipeline('DESCARTADO').changeStatus('POR_CONTACTAR', exec, null, now),
    );
    expect(error.kind).toBe('FORBIDDEN');
    const p = pipeline('DESCARTADO');
    p.changeStatus('POR_CONTACTAR', admin, 'Nuevo gerente', now);
    expect(p.status.value).toBe('POR_CONTACTAR');
    expect(p.allowedNextStatuses('EJECUTIVO')).toEqual(['CONTACTADO', 'DESCARTADO']);
  });

  test('assertVersion only fails on a different explicit version', () => {
    const p = pipeline();
    expect(() => p.assertVersion(undefined)).not.toThrow();
    expect(() => p.assertVersion(null)).not.toThrow();
    expect(() => p.assertVersion(3)).not.toThrow();
    const error = catchError(() => p.assertVersion(2));
    expect(error.code).toBe('PIPELINE_VERSION_MISMATCH');
    expect(error.kind).toBe('CONFLICT');
  });

  test('markPersisted bumps version and clears pending changes', () => {
    const p = pipeline('CONTACTADO');
    p.changeStatus('SIN_RESPUESTA', exec, null, now);
    p.markPersisted(4);
    expect(p.version).toBe(4);
    expect(p.hasChanges).toBe(false);
  });
});

describe('CompanyPipeline.registerInteraction', () => {
  const call = { channel: 'LLAMADA', occurredAt: now } as const;

  test('POR_CONTACTAR + NO_CONTESTO → CONTACTADO → SIN_RESPUESTA with history and events', () => {
    const p = pipeline('POR_CONTACTAR');
    const { transitions, interaction } = p.registerInteraction(
      { ...call, outcome: 'NO_CONTESTO', notes: 'buzón', planItemId: 9 },
      exec,
      policy,
      now,
    );
    expect(transitions).toEqual([
      { from: 'POR_CONTACTAR', to: 'CONTACTADO' },
      { from: 'CONTACTADO', to: 'SIN_RESPUESTA' },
    ]);
    expect(p.status.value).toBe('SIN_RESPUESTA');
    expect(p.lastContactAt).toEqual(now);
    expect(interaction.props).toMatchObject({
      companyId: 42,
      userId: 7,
      outcome: 'NO_CONTESTO',
      notes: 'buzón',
      planItemId: 9,
      nextFollowUpAt: null,
    });
    const { history, interactions } = p.pendingChanges();
    expect(interactions).toHaveLength(1);
    expect(history.map((h) => [h.fromStatus, h.toStatus, h.note])).toEqual([
      ['POR_CONTACTAR', 'CONTACTADO', 'Automático: Llamada · No contestó'],
      ['CONTACTADO', 'SIN_RESPUESTA', 'Automático: Llamada · No contestó'],
    ]);
    const events = p.pullEvents();
    expect(events.map((e) => e.name)).toEqual([
      'pipeline.company-status-changed',
      'pipeline.company-status-changed',
      'pipeline.interaction-registered',
    ]);
    expect(events[2]).toBeInstanceOf(InteractionRegistered);
    expect((events[2] as InteractionRegistered).planItemId).toBe(9);
  });

  test('later stages: logged, no automatic transition, lastContactAt updated', () => {
    const p = pipeline('AGENDANDO_CITA');
    const { transitions } = p.registerInteraction(
      { ...call, outcome: 'CONTESTO' },
      exec,
      policy,
      now,
    );
    expect(transitions).toEqual([]);
    expect(p.status.value).toBe('AGENDANDO_CITA');
    expect(p.lastContactAt).toEqual(now);
    expect(p.pendingChanges().history).toEqual([]);
    expect(p.pendingChanges().interactions).toHaveLength(1);
    expect(p.pullEvents().map((e) => e.name)).toEqual(['pipeline.interaction-registered']);
  });

  test('explicit targetStatus is applied after the automatic steps', () => {
    const p = pipeline('POR_CONTACTAR');
    const { transitions } = p.registerInteraction(
      { ...call, outcome: 'INTERESADO', targetStatus: 'AGENDANDO_CITA', notes: 'cita el lunes' },
      exec,
      policy,
      now,
    );
    expect(transitions.map((t) => t.to)).toEqual(['CONTACTADO', 'CON_RESPUESTA', 'AGENDANDO_CITA']);
    expect(p.pendingChanges().history[2]?.note).toBe('cita el lunes');
  });

  test('targetStatus equal to the automatic result is not duplicated', () => {
    const p = pipeline('CONTACTADO');
    const { transitions } = p.registerInteraction(
      { ...call, outcome: 'CONTESTO', targetStatus: 'CON_RESPUESTA' },
      exec,
      policy,
      now,
    );
    expect(transitions).toEqual([{ from: 'CONTACTADO', to: 'CON_RESPUESTA' }]);
  });

  test('NO_INTERESADO + DESCARTADO target uses statusNote (or notes) as reason', () => {
    const p = pipeline('CONTACTADO');
    p.registerInteraction(
      {
        ...call,
        outcome: 'NO_INTERESADO',
        notes: 'colgó',
        targetStatus: 'DESCARTADO',
        statusNote: 'Ya tiene proveedor',
      },
      exec,
      policy,
      now,
    );
    expect(p.status.value).toBe('DESCARTADO');
    expect(p.pendingChanges().history.at(-1)?.note).toBe('Ya tiene proveedor');

    const q = pipeline('CONTACTADO');
    expect(() =>
      q.registerInteraction(
        { ...call, outcome: 'NO_INTERESADO', targetStatus: 'DESCARTADO' },
        exec,
        policy,
        now,
      ),
    ).toThrow(DomainError);
  });

  test('invalid explicit target is rejected by the state machine', () => {
    const p = pipeline('CONTACTADO');
    const error = catchError(() =>
      p.registerInteraction(
        { ...call, outcome: 'NO_CONTESTO', targetStatus: 'CON_RESPUESTA' },
        exec,
        policy,
        now,
      ),
    );
    expect(error.code).toBe('PIPELINE_INVALID_TRANSITION');
    expect(error.details).toMatchObject({ from: 'SIN_RESPUESTA', to: 'CON_RESPUESTA' });
    // todo o nada: ni los pasos automáticos quedan aplicados
    expect(p.status.value).toBe('CONTACTADO');
    expect(p.lastContactAt).toBeNull();
    expect(p.hasChanges).toBe(false);
    expect(p.pullEvents()).toEqual([]);
  });

  test('lastContactAt never moves backwards', () => {
    const later = new Date('2026-10-25T10:00:00Z');
    const p = pipeline('CON_RESPUESTA', later);
    p.registerInteraction({ ...call, outcome: 'CONTESTO' }, exec, policy, later);
    expect(p.lastContactAt).toEqual(later);
  });

  test('interaction validations', () => {
    const future = new Date(now.getTime() + 10 * 60_000);
    expect(
      catchError(() =>
        pipeline().registerInteraction(
          { channel: 'LLAMADA', outcome: 'CONTESTO', occurredAt: future },
          exec,
          policy,
          now,
        ),
      ).code,
    ).toBe('INTERACTION_IN_FUTURE');
    expect(
      catchError(() =>
        pipeline().registerInteraction(
          { ...call, outcome: 'CONTESTO', nextFollowUpAt: new Date('2026-10-01T00:00:00Z') },
          exec,
          policy,
          now,
        ),
      ).code,
    ).toBe('INTERACTION_FOLLOW_UP_BEFORE_CONTACT');
  });
});

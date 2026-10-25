import { describe, expect, test } from 'bun:test';
import { BoardQuerySchema, ChangeStatusSchema, RegisterInteractionSchema } from './pipeline';

describe('pipeline contracts', () => {
  test('ChangeStatusSchema trims notes and rejects unknown statuses', () => {
    expect(ChangeStatusSchema.parse({ to: 'DESCARTADO', note: '  sin interés ' })).toEqual({
      to: 'DESCARTADO',
      note: 'sin interés',
    });
    expect(ChangeStatusSchema.safeParse({ to: 'GANADO' }).success).toBe(false);
    expect(ChangeStatusSchema.safeParse({ to: 'CONTACTADO', expectedVersion: -1 }).success).toBe(
      false,
    );
  });

  test('RegisterInteractionSchema converts ISO dates with offset', () => {
    const parsed = RegisterInteractionSchema.parse({
      channel: 'LLAMADA',
      outcome: 'CONTESTO',
      occurredAt: '2026-10-24T08:30:00-06:00',
    });
    expect(parsed.occurredAt).toEqual(new Date('2026-10-24T14:30:00Z'));
    expect(
      RegisterInteractionSchema.safeParse({
        channel: 'LLAMADA',
        outcome: 'CONTESTO',
        occurredAt: '24/10/2026',
      }).success,
    ).toBe(false);
  });

  test('BoardQuerySchema coerces query strings and defaults the column size', () => {
    expect(BoardQuerySchema.parse({ sectorId: '2', q: ' acme ' })).toEqual({
      sectorId: 2,
      q: 'acme',
      limitPerColumn: 20,
    });
    expect(BoardQuerySchema.safeParse({ limitPerColumn: '101' }).success).toBe(false);
  });
});

import { describe, expect, test } from 'bun:test';
import type { TimelineEntryDto } from '@axiom/contracts';
import { render, screen } from '@testing-library/react';
import { Timeline } from './timeline';

const entries: TimelineEntryDto[] = [
  {
    type: 'INTERACTION',
    id: 1,
    occurredAt: '2026-10-20T15:00:00Z',
    user: { id: 1, fullName: 'Ana Pérez' },
    channel: 'WHATSAPP',
    outcome: 'INTERESADO',
    notes: 'Pidió propuesta',
    nextFollowUpAt: '2026-10-27T15:00:00Z',
    planItemId: null,
  },
  {
    type: 'STATUS_CHANGE',
    id: 2,
    occurredAt: '2026-10-20T15:00:01Z',
    user: { id: 2, fullName: 'Luis Gómez' },
    fromStatus: 'CONTACTADO',
    toStatus: 'DESCARTADO',
    note: 'Datos inválidos',
  },
];

describe('Timeline', () => {
  test('renderiza interacciones y cambios de estado', () => {
    render(<Timeline entries={entries} hasMore loadingMore={false} onLoadMore={() => {}} />);
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('Interesado')).toBeTruthy();
    expect(screen.getByText('Pidió propuesta')).toBeTruthy();
    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText(/Seguimiento:/)).toBeTruthy();
    expect(screen.getByText('Cambio de estado')).toBeTruthy();
    expect(screen.getByText('Luis Gómez')).toBeTruthy();
    expect(screen.getByText('Datos inválidos')).toBeTruthy();
    expect(screen.getByText('Descartado')).toBeTruthy();
    expect(document.querySelectorAll('time')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeTruthy();
  });
});

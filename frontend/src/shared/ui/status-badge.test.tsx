import { describe, expect, test } from 'bun:test';
import { PIPELINE_STATUS_LABELS, PIPELINE_STATUSES } from '@axiom/contracts';
import { render, screen } from '@testing-library/react';
import { PIPELINE_STATUS_STYLES } from '../lib/pipeline-status';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  test('define estilo y etiqueta para los 8 estados', () => {
    expect(PIPELINE_STATUSES).toHaveLength(8);
    for (const s of PIPELINE_STATUSES) {
      expect(PIPELINE_STATUS_STYLES[s].label).toBe(PIPELINE_STATUS_LABELS[s]);
      expect(PIPELINE_STATUS_STYLES[s].badge.length).toBeGreaterThan(0);
    }
  });

  for (const status of PIPELINE_STATUSES) {
    test(`renderiza ${status}`, () => {
      render(<StatusBadge status={status} />);
      const el = screen.getByText(PIPELINE_STATUS_LABELS[status]);
      expect(el.closest('[data-status]')?.getAttribute('data-status')).toBe(status);
    });
  }
});

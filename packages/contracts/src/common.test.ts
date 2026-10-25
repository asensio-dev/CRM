import { describe, expect, test } from 'bun:test';
import { PaginationQuerySchema } from './common';
import { PIPELINE_STATUS_LABELS, PIPELINE_STATUSES } from './pipeline';

describe('contracts', () => {
  test('pagination coerces query strings and caps page size', () => {
    expect(PaginationQuerySchema.parse({ page: '2', pageSize: '50' })).toEqual({
      page: 2,
      pageSize: 50,
    });
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(PaginationQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  test('every pipeline status has a label', () => {
    expect(Object.keys(PIPELINE_STATUS_LABELS).sort()).toEqual([...PIPELINE_STATUSES].sort());
  });
});

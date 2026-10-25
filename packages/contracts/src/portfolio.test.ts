import { describe, expect, test } from 'bun:test';
import {
  AssignmentsQuerySchema,
  BulkAssignSchema,
  MyWeekQuerySchema,
  ReassignSchema,
  ReleaseAssignmentSchema,
} from './portfolio';

describe('portfolio contracts', () => {
  test('coerce query params', () => {
    expect(MyWeekQuerySchema.parse({ userId: '4' })).toEqual({ userId: 4 });
    expect(AssignmentsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  test('reassign requires 1..500 positive ids', () => {
    expect(ReassignSchema.safeParse({ companyIds: [], toUserId: 1 }).success).toBe(false);
    expect(ReassignSchema.safeParse({ companyIds: [0], toUserId: 1 }).success).toBe(false);
    expect(ReassignSchema.parse({ companyIds: [1, 2], toUserId: 3 })).toEqual({
      companyIds: [1, 2],
      toUserId: 3,
    });
  });

  test('bulk assign defaults filters and caps the limit', () => {
    expect(BulkAssignSchema.parse({ toUserId: 2, limit: 10 })).toEqual({
      filters: {},
      toUserId: 2,
      limit: 10,
    });
    expect(BulkAssignSchema.safeParse({ toUserId: 2, limit: 501 }).success).toBe(false);
  });

  test('release reason is optional but must be known', () => {
    expect(ReleaseAssignmentSchema.parse(undefined)).toEqual({});
    expect(ReleaseAssignmentSchema.safeParse({ reason: 'OTRA' }).success).toBe(false);
  });
});

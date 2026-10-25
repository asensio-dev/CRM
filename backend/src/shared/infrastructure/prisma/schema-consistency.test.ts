import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTERACTION_CHANNELS,
  INTERACTION_OUTCOMES,
  PIPELINE_STATUSES,
  USER_ROLES,
} from '@axiom/contracts';

/**
 * Prisma no tiene enum en SQL Server: los valores válidos están duplicados entre
 * @axiom/contracts y los CHECK de las migraciones. Este test evita que se desincronicen.
 */
const migrationsDir = join(import.meta.dir, '../../../../prisma/migrations');

async function latestCheck(constraint: string): Promise<string> {
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const dir of dirs) {
    const sql = await Bun.file(join(migrationsDir, dir, 'migration.sql')).text();
    const match = sql.match(new RegExp(`\\[${constraint}\\]\\s+CHECK\\s*\\(([\\s\\S]*?)\\);`));
    if (match?.[1]) return match[1];
  }
  throw new Error(`No se encontró el CHECK ${constraint}`);
}

const valuesIn = (check: string) => [...check.matchAll(/N'([A-Z_]+)'/g)].map((m) => m[1]).sort();

describe('contracts ⇄ CHECK constraints', () => {
  test.each([
    ['companies_status_check', PIPELINE_STATUSES],
    ['status_history_to_status_check', PIPELINE_STATUSES],
    ['users_role_check', USER_ROLES],
    ['interactions_channel_check', INTERACTION_CHANNELS],
    ['interactions_outcome_check', INTERACTION_OUTCOMES],
  ] as const)('%s', async (constraint, values) => {
    expect(valuesIn(await latestCheck(constraint))).toEqual([...values].sort());
  });
});

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { CatalogItem } from '@axiom/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ListActivitiesUseCase } from '../../application/use-cases/list-activities.use-case';
import { ListSectorsUseCase } from '../../application/use-cases/list-sectors.use-case';
import { CATALOG_READER, type CatalogReader } from '../../domain';
import { CatalogsController } from './catalogs.controller';

const activities: CatalogItem[] = [
  { id: 1, name: 'COMERCIO AL POR MAYOR' },
  { id: 2, name: 'AGRICULTURA' },
];

const inMemoryReader: CatalogReader = {
  listSectors: async () => [{ id: 1, name: 'PRIVADA NACIONAL' }],
  listActivities: async (q) =>
    activities.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase())),
};

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [CatalogsController],
    providers: [
      { provide: CATALOG_READER, useValue: inMemoryReader },
      ListSectorsUseCase,
      ListActivitiesUseCase,
    ],
  }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

describe('CatalogsController', () => {
  test('GET /api/catalogs/sectors lists sectors', async () => {
    const res = await fetch(`${baseUrl}/api/catalogs/sectors`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1, name: 'PRIVADA NACIONAL' }]);
  });

  test('GET /api/catalogs/activities lists and filters activities', async () => {
    const all = (await (await fetch(`${baseUrl}/api/catalogs/activities`)).json()) as CatalogItem[];
    expect(all).toHaveLength(2);
    const filtered = (await (
      await fetch(`${baseUrl}/api/catalogs/activities?q=agri`)
    ).json()) as CatalogItem[];
    expect(filtered.map((a) => a.id)).toEqual([2]);
  });
});

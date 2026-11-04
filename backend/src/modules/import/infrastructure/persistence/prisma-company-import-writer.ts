import { inferDepartment } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { branchKey } from '../../domain/import-deduplicator';
import type { CompanyCandidate } from '../../domain/import-row';
import type {
  BatchResult,
  BranchCandidate,
  CompanyImportWriter,
  ImportBatch,
} from '../../domain/ports';
import { CatalogCache } from './catalog-cache';

/**
 * SQL Server admite 2 100 parámetros por sentencia. Una fila de `companies` usa ~14 columnas
 * (incluidas las de Prisma), así que 100 filas ≈ 1 400 parámetros. Los `IN (...)` de consulta
 * también quedan muy por debajo del límite.
 */
const CHUNK = 100;

type ExistingCompany = {
  id: number;
  ruc: string;
  source: string;
  legalName: string;
  tradeName: string | null;
  legalRepName: string | null;
  legalRepIdNumber: string | null;
  employeeCount: number;
  phone: string | null;
  shippingAddress: string | null;
  particularAddress: string | null;
  department: string | null;
  activityId: number | null;
  sectorId: number | null;
};

const EXISTING_SELECT = {
  id: true,
  ruc: true,
  source: true,
  legalName: true,
  tradeName: true,
  legalRepName: true,
  legalRepIdNumber: true,
  employeeCount: true,
  phone: true,
  shippingAddress: true,
  particularAddress: true,
  department: true,
  activityId: true,
  sectorId: true,
} as const;

/** Departamento deducido de las direcciones y el teléfono de la fila (null si no hay pistas). */
function departmentOf(c: CompanyCandidate): string | null {
  return (
    inferDepartment({ addresses: [c.shippingAddress, c.particularAddress], phone: c.phone })
      ?.department ?? null
  );
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * ETL masivo: escribe con Prisma directamente (sin pasar por el dominio de `companies`) por
 * rendimiento — ver docs/adr/0002-importacion-masiva.md. Es idempotente: una empresa EXCEL
 * existente solo actualiza campos base; una MANUAL no se toca. Nunca modifica
 * status / version / lastContactAt / createdById.
 */
@Injectable()
export class PrismaCompanyImportWriter implements CompanyImportWriter {
  private readonly activities: CatalogCache;
  private readonly sectors: CatalogCache;

  constructor(private readonly prisma: PrismaService) {
    this.activities = new CatalogCache({
      loadAll: () => this.prisma.db.economicActivity.findMany({ select: { id: true, name: true } }),
      createMany: async (names) => {
        await this.prisma.db.economicActivity.createMany({ data: names.map((name) => ({ name })) });
      },
      upsert: async (name) => {
        await this.prisma.db.economicActivity.upsert({
          where: { name },
          create: { name },
          update: {},
        });
      },
      findIdByName: async (name) =>
        (await this.prisma.db.economicActivity.findUnique({ where: { name } }))?.id ?? null,
    });
    this.sectors = new CatalogCache({
      loadAll: () => this.prisma.db.economicSector.findMany({ select: { id: true, name: true } }),
      createMany: async (names) => {
        await this.prisma.db.economicSector.createMany({ data: names.map((name) => ({ name })) });
      },
      upsert: async (name) => {
        await this.prisma.db.economicSector.upsert({
          where: { name },
          create: { name },
          update: {},
        });
      },
      findIdByName: async (name) =>
        (await this.prisma.db.economicSector.findUnique({ where: { name } }))?.id ?? null,
    });
  }

  async writeBatch(batch: ImportBatch): Promise<BatchResult> {
    const result: BatchResult = {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedManual: 0,
      branchesInserted: 0,
      branchesExisting: 0,
      newActivities: 0,
    };
    for (const part of chunks(batch.companies, CHUNK)) await this.writeCompanies(part, result);
    for (const part of chunks(batch.branches, CHUNK)) await this.writeBranches(part, result);
    return result;
  }

  private async writeCompanies(items: CompanyCandidate[], result: BatchResult): Promise<void> {
    if (items.length === 0) return;
    const db = this.prisma.db;

    result.newActivities += await this.activities.ensure(items.map((c) => c.activityName));
    await this.sectors.ensure(items.map((c) => c.sectorName));

    const existing = (await db.company.findMany({
      where: { ruc: { in: items.map((c) => c.ruc) } },
      select: EXISTING_SELECT,
    })) as ExistingCompany[];
    const byRuc = new Map(existing.map((e) => [e.ruc.toUpperCase(), e]));

    const toInsert: CompanyCandidate[] = [];
    const toUpdate: { id: number; data: Record<string, unknown> }[] = [];
    for (const c of items) {
      const current = byRuc.get(c.ruc);
      if (!current) {
        toInsert.push(c);
        continue;
      }
      if (current.source !== 'EXCEL') {
        result.skippedManual++;
        continue;
      }
      const data = this.diff(current, c);
      if (data) toUpdate.push({ id: current.id, data });
      else result.unchanged++;
    }

    if (toInsert.length > 0) {
      await db.company.createMany({
        data: toInsert.map((c) => ({
          ruc: c.ruc,
          legalName: c.legalName,
          tradeName: c.tradeName,
          legalRepName: c.legalRepName,
          legalRepIdNumber: c.legalRepIdNumber,
          employeeCount: c.employeeCount,
          phone: c.phone,
          shippingAddress: c.shippingAddress,
          particularAddress: c.particularAddress,
          department: departmentOf(c),
          activityId: this.activities.idOf(c.activityName),
          sectorId: this.sectors.idOf(c.sectorName),
          source: 'EXCEL',
        })),
      });
      result.inserted += toInsert.length;
    }

    for (const group of chunks(toUpdate, 10)) {
      await Promise.all(group.map((u) => db.company.update({ where: { id: u.id }, data: u.data })));
      result.updated += group.length;
    }
  }

  /** Campos base que cambiaron (null si nada cambió). Nunca incluye status/version/etc. */
  private diff(current: ExistingCompany, c: CompanyCandidate): Record<string, unknown> | null {
    const next = {
      legalName: c.legalName,
      tradeName: c.tradeName,
      legalRepName: c.legalRepName,
      legalRepIdNumber: c.legalRepIdNumber,
      employeeCount: c.employeeCount,
      phone: c.phone,
      shippingAddress: c.shippingAddress,
      particularAddress: c.particularAddress,
      department: departmentOf(c),
      activityId: this.activities.idOf(c.activityName),
      sectorId: this.sectors.idOf(c.sectorName),
    };
    const changed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      if ((current as Record<string, unknown>)[key] !== value) changed[key] = value;
    }
    return Object.keys(changed).length > 0 ? changed : null;
  }

  private async writeBranches(items: BranchCandidate[], result: BatchResult): Promise<void> {
    if (items.length === 0) return;
    const db = this.prisma.db;

    const parents = (await db.company.findMany({
      where: { ruc: { in: [...new Set(items.map((b) => b.ruc))] } },
      select: { id: true, ruc: true, source: true },
    })) as Pick<ExistingCompany, 'id' | 'ruc' | 'source'>[];
    const parentByRuc = new Map(parents.map((p) => [p.ruc.toUpperCase(), p]));

    const excelParents = parents.filter((p) => p.source === 'EXCEL').map((p) => p.id);
    const known = new Map<number, Set<string>>();
    if (excelParents.length > 0) {
      const rows = await db.companyBranch.findMany({
        where: { companyId: { in: excelParents } },
        select: { companyId: true, tradeName: true, address: true, phone: true },
      });
      for (const r of rows) {
        const set = known.get(r.companyId) ?? new Set<string>();
        set.add(branchKey(r));
        known.set(r.companyId, set);
      }
    }

    const data: {
      companyId: number;
      tradeName: string | null;
      address: string | null;
      phone: string | null;
      employeeCount: number;
    }[] = [];
    for (const b of items) {
      const parent = parentByRuc.get(b.ruc);
      if (parent?.source !== 'EXCEL') continue; // MANUAL: no se toca
      const key = branchKey(b);
      const set = known.get(parent.id) ?? new Set<string>();
      if (set.has(key)) {
        result.branchesExisting++;
        continue;
      }
      set.add(key);
      known.set(parent.id, set);
      data.push({
        companyId: parent.id,
        tradeName: b.tradeName,
        address: b.address,
        phone: b.phone,
        employeeCount: b.employeeCount,
      });
    }
    if (data.length > 0) {
      await db.companyBranch.createMany({ data });
      result.branchesInserted += data.length;
    }
  }
}

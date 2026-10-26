import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

/** Tras este tiempo se relee el catálogo aunque no falte ningún id. */
export const CATALOG_CACHE_TTL_MS = 10 * 60_000;

export interface CatalogNames {
  sector(id: number | null): string | null;
  activity(id: number | null): string | null;
}

/**
 * Nombres de sectores (9) y actividades (~900) en memoria para los listados de empresas. Antes,
 * cada página cargaba las relaciones con dos consultas extra. Los catálogos solo crecen (la
 * importación añade actividades; no hay renombrado ni borrado), así que basta releerlos cuando
 * aparece un id desconocido o vence el TTL. Varias instancias: cada una tiene su copia.
 */
@Injectable()
export class CatalogNameCache {
  private sectors = new Map<number, string>();
  private activities = new Map<number, string>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    refs: readonly { sectorId: number | null; activityId: number | null }[],
  ): Promise<CatalogNames> {
    const missing = refs.some(
      (r) =>
        (r.sectorId != null && !this.sectors.has(r.sectorId)) ||
        (r.activityId != null && !this.activities.has(r.activityId)),
    );
    if (missing || Date.now() - this.loadedAt > CATALOG_CACHE_TTL_MS) await this.reload();
    const sectors = this.sectors;
    const activities = this.activities;
    return {
      sector: (id) => (id == null ? null : (sectors.get(id) ?? null)),
      activity: (id) => (id == null ? null : (activities.get(id) ?? null)),
    };
  }

  private reload(): Promise<void> {
    this.loading ??= (async () => {
      const db = this.prisma.db;
      const [sectors, activities] = await Promise.all([
        db.economicSector.findMany({ select: { id: true, name: true } }),
        db.economicActivity.findMany({ select: { id: true, name: true } }),
      ]);
      this.sectors = new Map(sectors.map((s) => [s.id, s.name]));
      this.activities = new Map(activities.map((a) => [a.id, a.name]));
      this.loadedAt = Date.now();
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }
}

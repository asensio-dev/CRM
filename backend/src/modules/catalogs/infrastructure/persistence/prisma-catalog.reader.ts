import type { CatalogItem } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { CatalogReader } from '../../domain';

@Injectable()
export class PrismaCatalogReader implements CatalogReader {
  constructor(private readonly prisma: PrismaService) {}

  listSectors(): Promise<CatalogItem[]> {
    return this.prisma.db.economicSector.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  listActivities(q?: string): Promise<CatalogItem[]> {
    return this.prisma.db.economicActivity.findMany({
      where: q ? { name: { contains: q } } : undefined,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}

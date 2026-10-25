import type { CatalogItem, CatalogQuery } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { CATALOG_READER, type CatalogReader } from '../../domain';

@Injectable()
export class ListActivitiesUseCase implements UseCase<CatalogQuery, CatalogItem[]> {
  constructor(@Inject(CATALOG_READER) private readonly reader: CatalogReader) {}

  execute(query: CatalogQuery): Promise<CatalogItem[]> {
    const q = query.q?.trim();
    return this.reader.listActivities(q ? q : undefined);
  }
}

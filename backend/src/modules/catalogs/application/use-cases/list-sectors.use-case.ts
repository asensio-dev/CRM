import type { CatalogItem } from '@axiom/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { UseCase } from '../../../../shared/application';
import { CATALOG_READER, type CatalogReader } from '../../domain';

@Injectable()
export class ListSectorsUseCase implements UseCase<void, CatalogItem[]> {
  constructor(@Inject(CATALOG_READER) private readonly reader: CatalogReader) {}

  execute(): Promise<CatalogItem[]> {
    return this.reader.listSectors();
  }
}

import { Module } from '@nestjs/common';
import { ListActivitiesUseCase } from './application/use-cases/list-activities.use-case';
import { ListSectorsUseCase } from './application/use-cases/list-sectors.use-case';
import { CATALOG_READER } from './domain';
import { CatalogsController } from './infrastructure/http/catalogs.controller';
import { PrismaCatalogReader } from './infrastructure/persistence/prisma-catalog.reader';

@Module({
  controllers: [CatalogsController],
  providers: [
    { provide: CATALOG_READER, useClass: PrismaCatalogReader },
    ListSectorsUseCase,
    ListActivitiesUseCase,
  ],
})
export class CatalogsModule {}

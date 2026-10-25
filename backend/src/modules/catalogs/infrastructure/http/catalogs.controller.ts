import { type CatalogItem, type CatalogQuery, CatalogQuerySchema } from '@axiom/contracts';
import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe';
import { ListActivitiesUseCase } from '../../application/use-cases/list-activities.use-case';
import { ListSectorsUseCase } from '../../application/use-cases/list-sectors.use-case';

@Controller('catalogs')
export class CatalogsController {
  constructor(
    private readonly listSectors: ListSectorsUseCase,
    private readonly listActivities: ListActivitiesUseCase,
  ) {}

  @Get('sectors')
  sectors(): Promise<CatalogItem[]> {
    return this.listSectors.execute();
  }

  @Get('activities')
  activities(
    @Query(new ZodValidationPipe(CatalogQuerySchema)) query: CatalogQuery,
  ): Promise<CatalogItem[]> {
    return this.listActivities.execute(query);
  }
}

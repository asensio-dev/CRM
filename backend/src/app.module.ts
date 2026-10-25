import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CatalogsModule } from './modules/catalogs';
import { CompaniesModule } from './modules/companies';
import { IdentityModule } from './modules/identity';
import { PipelineModule } from './modules/pipeline';
import { HealthController } from './shared/infrastructure/http/health.controller';
import { SharedModule } from './shared/infrastructure/shared.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    SharedModule,
    // ↓ Cada módulo de negocio añade aquí UNA línea (ver docs/AGENTS.md)
    IdentityModule,
    CompaniesModule,
    CatalogsModule,
    PipelineModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

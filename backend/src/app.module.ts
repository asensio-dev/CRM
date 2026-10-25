import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AnalyticsModule } from './modules/analytics';
import { AppointmentsModule } from './modules/appointments';
import { CatalogsModule } from './modules/catalogs';
import { CompaniesModule } from './modules/companies';
import { ContractsModule } from './modules/contracts';
import { IdentityModule } from './modules/identity';
import { ImportModule } from './modules/import';
import { PipelineModule } from './modules/pipeline';
import { PortfolioModule } from './modules/portfolio';
import { HealthController } from './shared/infrastructure/http/health.controller';
import { SharedModule } from './shared/infrastructure/shared.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    SharedModule,
    ScheduleModule.forRoot(), // cron de la rotación semanal (PortfolioModule)
    // ↓ Cada módulo de negocio añade aquí UNA línea (ver docs/AGENTS.md)
    IdentityModule,
    CompaniesModule,
    CatalogsModule,
    PipelineModule,
    ImportModule,
    AnalyticsModule,
    AppointmentsModule,
    ContractsModule,
    PortfolioModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { IdentityModule } from './modules/identity';
import { HealthController } from './shared/infrastructure/http/health.controller';
import { SharedModule } from './shared/infrastructure/shared.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    SharedModule,
    // ↓ Cada módulo de negocio añade aquí UNA línea (ver docs/AGENTS.md)
    IdentityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

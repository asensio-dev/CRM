import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthController } from './shared/infrastructure/http/health.controller';
import { SharedModule } from './shared/infrastructure/shared.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    SharedModule,
    // ↓ Cada módulo de negocio añade aquí UNA línea (ver docs/AGENTS.md)
  ],
  controllers: [HealthController],
})
export class AppModule {}

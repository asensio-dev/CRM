import { Global, Module } from '@nestjs/common';
import { CLOCK, EVENT_BUS, UNIT_OF_WORK } from '../application';
import { SystemClock } from './clock/system-clock';
import { APP_CONFIG, loadConfig } from './config/env';
import { NestEventBus } from './events/nest-event-bus';
import { PrismaService } from './prisma/prisma.service';
import { PrismaUnitOfWork } from './prisma/prisma-unit-of-work';

/** Infraestructura transversal disponible para todos los módulos. */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    PrismaService,
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: EVENT_BUS, useClass: NestEventBus },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [APP_CONFIG, PrismaService, UNIT_OF_WORK, EVENT_BUS, CLOCK],
})
export class SharedModule {}

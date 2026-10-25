import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './shared/infrastructure/config/env';
import { DomainExceptionFilter } from './shared/infrastructure/http/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.CORS_ORIGIN, credentials: true });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  Logger.log(`API en http://localhost:${config.PORT}/api (Bun ${Bun.version})`, 'Bootstrap');
}

bootstrap();

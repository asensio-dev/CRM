import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_VERSION } from './shared/infrastructure/config/app-version';
import { APP_CONFIG, type AppConfig } from './shared/infrastructure/config/env';
import { DomainExceptionFilter } from './shared/infrastructure/http/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  // Detrás de un proxy inverso, IP real del cliente para el rate limit (TRUST_PROXY en .env.example).
  if (config.TRUST_PROXY !== undefined) app.set('trust proxy', config.TRUST_PROXY);

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.CORS_ORIGIN, credentials: true });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();

  // Swagger UI solo fuera de producción: en /api/docs (JSON en /api/docs-json).
  // Es una ruta de Express fuera de los controladores Nest, así que el guard JWT global no la afecta.
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('AXIOM CRM API')
        .setDescription(
          'API del CRM de cartera rotativa. Autenticación: access token en `Authorization: Bearer`; el refresh token viaja en cookie httpOnly.',
        )
        .setVersion(APP_VERSION)
        .addBearerAuth()
        .build(),
    );
    // El prefijo global 'api' no se aplica a Swagger: la ruta explícita es /api/docs.
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.PORT);
  Logger.log(`API en http://localhost:${config.PORT}/api (Bun ${Bun.version})`, 'Bootstrap');
}

bootstrap();

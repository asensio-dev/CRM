import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { APP_VERSION } from '../config/app-version';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from './auth.decorators';

@ApiTags('Salud')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    await this.prisma.db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up', version: APP_VERSION };
  }
}

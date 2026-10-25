import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
    return { status: 'ok', database: 'up' };
  }
}

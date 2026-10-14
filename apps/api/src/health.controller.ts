import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth-user';
import { PrismaService } from './prisma.service';

/** Unauthenticated liveness check for the host (and uptime pingers). */
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  }
}

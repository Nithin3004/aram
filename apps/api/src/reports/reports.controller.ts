import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { ReportsService } from './reports.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const registerQuery = z.object({
  period: z.enum(['day', 'month', 'year']).default('month'),
  from: date,
  to: date,
  supervisorId: z.string().min(1).optional(),
  shopId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
});

@Controller('reports')
@Roles('SUPER_ADMIN', 'ADMIN')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  /** Purchase / sales / stock / gross profit register for a period, optionally for one supervisor, shop or product. */
  @Get('register')
  register(@Query(new ZodPipe(registerQuery)) q: z.infer<typeof registerQuery>) {
    return this.reports.register(q);
  }
}

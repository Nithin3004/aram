import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { closingSchema } from '@aram/shared';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { ClosingsService } from './closings.service';

@Controller('closings')
export class ClosingsController {
  constructor(private svc: ClosingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.svc.list(user, date);
  }

  @Get('draft')
  @Roles('SHOP')
  draft(@CurrentUser() user: AuthUser) {
    return this.svc.draft(user);
  }

  @Post()
  @Roles('SHOP')
  submit(@CurrentUser() user: AuthUser, @Body(new ZodPipe(closingSchema)) body: z.infer<typeof closingSchema>) {
    return this.svc.submit(user, body);
  }
}

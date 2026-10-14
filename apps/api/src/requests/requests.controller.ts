import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { approveRequestSchema, createRequestSchema, rejectRequestSchema } from '@aram/shared';
import { AuthUser, CurrentUser, RequirePermission, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private svc: RequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.svc.list(user, status);
  }

  @Post()
  @Roles('SHOP')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createRequestSchema)) body: z.infer<typeof createRequestSchema>) {
    return this.svc.create(user, body);
  }

  @Post(':id/approve')
  @RequirePermission('APPROVE_REQUESTS')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(approveRequestSchema)) body: z.infer<typeof approveRequestSchema>) {
    return this.svc.approve(user, id, body.lines);
  }

  @Post(':id/reject')
  @RequirePermission('APPROVE_REQUESTS')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(rejectRequestSchema)) body: { reason: string }) {
    return this.svc.reject(user, id, body.reason);
  }
}

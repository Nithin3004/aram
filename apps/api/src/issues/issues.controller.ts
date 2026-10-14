import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { createIssueSchema, recountSchema, resolveIssueSchema } from '@aram/shared';
import { AuthUser, CurrentUser, RequirePermission, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { IssuesService } from './issues.service';

@Controller('issues')
export class IssuesController {
  constructor(private svc: IssuesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.svc.list(user, status);
  }

  @Post()
  @Roles('SHOP')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createIssueSchema)) body: z.infer<typeof createIssueSchema>) {
    return this.svc.create(user, body);
  }

  @Post(':id/resolve')
  @RequirePermission('RESOLVE_ISSUES')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(resolveIssueSchema)) body: z.infer<typeof resolveIssueSchema>) {
    return this.svc.resolve(user, id, body);
  }

  @Post(':id/recount-request')
  @RequirePermission('RESOLVE_ISSUES')
  askRecount(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.requestRecount(user, id);
  }

  @Post(':id/recount')
  @Roles('SHOP')
  recount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(recountSchema)) body: z.infer<typeof recountSchema>) {
    return this.svc.submitRecount(user, id, body);
  }
}

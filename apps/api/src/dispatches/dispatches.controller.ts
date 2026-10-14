import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { createDispatchSchema, lookupCodeSchema, markDispatchedSchema, receiveSchema } from '@aram/shared';
import { AuthUser, CurrentUser, RequirePermission, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { badRequest } from '../common/errors';
import { StorageService } from '../files/storage.service';
import { DispatchesService } from './dispatches.service';

@Controller('dispatches')
export class DispatchesController {
  constructor(
    private svc: DispatchesService,
    private storage: StorageService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.svc.list(user, status);
  }

  @Post()
  @RequirePermission('CREATE_DISPATCH')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createDispatchSchema)) body: z.infer<typeof createDispatchSchema>) {
    return this.svc.create(user, body);
  }

  /** Receiving shop: resolve a scanned/typed code to its delivery. */
  @Post('lookup')
  @Roles('SHOP')
  lookup(@CurrentUser() user: AuthUser, @Body(new ZodPipe(lookupCodeSchema)) body: { code: string }) {
    return this.svc.lookup(user, body.code);
  }

  /** Upload the delivery photo before confirming receipt. */
  @Post('photo')
  @Roles('SHOP')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 8 * 1024 * 1024 } }))
  async photo(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.mimetype.startsWith('image/')) throw badRequest('receive.photo', 'An image is required');
    const key = `receipts/${user.shopId}/${randomUUID()}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    return { photoKey: key };
  }

  @Get(':id')
  view(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.view(id, user);
  }

  @Get(':id/photo')
  async viewPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const key = await this.svc.photoKeyFor(id, user);
    const f = await this.storage.get(key);
    res.setHeader('Content-Type', f.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    f.body.pipe(res);
  }

  @Post(':id/dispatch')
  markDispatched(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(markDispatchedSchema)) body: z.infer<typeof markDispatchedSchema>) {
    return this.svc.markDispatched(user, id, body.lines);
  }

  @Post(':id/receive')
  @Roles('SHOP')
  receive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(receiveSchema)) body: z.infer<typeof receiveSchema>) {
    return this.svc.receive(user, id, body);
  }
}

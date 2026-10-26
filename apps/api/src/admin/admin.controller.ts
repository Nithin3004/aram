import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ALL_PERMISSIONS, createAdminSchema, resetPasswordSchema, settingsSchema, updateAdminSchema } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { badRequest, conflict, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../core/settings.service';

@Controller()
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  // ---- Admins & permissions (Super Admin) -----------------------------------

  @Get('admins')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async admins() {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      isActive: u.isActive,
      permissions: u.role === 'SUPER_ADMIN' ? ALL_PERMISSIONS : u.permissions,
      phoneMasked: u.phone.slice(0, 2) + 'x xxxx ' + u.phone.slice(-4),
    }));
  }

  @Post('admins')
  @Roles('SUPER_ADMIN')
  async createAdmin(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createAdminSchema)) body: z.infer<typeof createAdminSchema>) {
    const username = body.username.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) throw conflict('user.exists', 'Username already taken');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username,
          name: body.name,
          phone: body.phone,
          passwordHash: await bcrypt.hash(body.password, 10),
          role: 'ADMIN',
          permissions: body.permissions,
        },
      });
      await this.audit.log(
        {
          actor: user,
          action: 'ADMIN_CREATE',
          entityType: 'User',
          entityId: u.id,
          summary: `Created admin ${body.name} (${username}) with ${body.permissions.length ? body.permissions.join(', ') : 'view-only access'}`,
          after: { ...body, password: undefined },
        },
        tx,
      );
      return { id: u.id };
    });
  }

  /** Toggle permissions or disable an admin. Super Admin is fixed. */
  @Patch('admins/:id')
  @Roles('SUPER_ADMIN')
  async updateAdmin(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateAdminSchema)) body: z.infer<typeof updateAdminSchema>) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.role === 'SHOP') throw notFound('Admin');
    if (target.role === 'SUPER_ADMIN') throw badRequest('admin.fixed', 'Super Admin permissions are fixed');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({ where: { id }, data: body });
      const added = (body.permissions ?? []).filter((p) => !target.permissions.includes(p));
      const removed = body.permissions ? target.permissions.filter((p) => !body.permissions!.includes(p)) : [];
      const parts = [
        ...added.map((p) => `turned on "${p}"`),
        ...removed.map((p) => `turned off "${p}"`),
        ...(body.isActive === false ? ['disabled account'] : body.isActive === true && !target.isActive ? ['enabled account'] : []),
      ];
      await this.audit.log(
        {
          actor: user,
          action: 'PERMS_CHANGE',
          entityType: 'User',
          entityId: id,
          summary: `${target.name}: ${parts.join(', ') || 'no change'}`,
          before: { permissions: target.permissions, isActive: target.isActive },
          after: { permissions: after.permissions, isActive: after.isActive },
        },
        tx,
      );
      return { ok: true };
    });
  }

  // ---- Password reset (Super Admin) ------------------------------------------

  /** Reset an admin's password. */
  @Post('admins/:id/reset-password')
  @Roles('SUPER_ADMIN')
  async resetAdminPassword(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(resetPasswordSchema)) body: { newPassword: string }) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target || target.role === 'SHOP') throw notFound('Admin');
    return this.resetPassword(user, target, body.newPassword);
  }

  /** Reset the login password of a shop account. */
  @Post('shops/:id/reset-password')
  @Roles('SUPER_ADMIN')
  async resetShopPassword(@CurrentUser() user: AuthUser, @Param('id') shopId: string, @Body(new ZodPipe(resetPasswordSchema)) body: { newPassword: string }) {
    const target = await this.prisma.user.findFirst({ where: { shopId, role: 'SHOP' } });
    if (!target) throw notFound('Shop login');
    return this.resetPassword(user, target, body.newPassword);
  }

  private async resetPassword(actor: AuthUser, target: { id: string; name: string; username: string }, newPassword: string) {
    await this.prisma.$transaction(async (tx) => {
      // Also clears a lockout so the person can sign in straight away.
      await tx.user.update({
        where: { id: target.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 10), failedAttempts: 0, lockedUntil: null },
      });
      await this.audit.log(
        { actor, action: 'PASSWORD_RESET', entityType: 'User', entityId: target.id, summary: `Reset password for ${target.name} (${target.username})` },
        tx,
      );
    });
    return { ok: true };
  }

  // ---- Activity log (read-only for everyone, retained forever) ---------------

  @Get('audit')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async auditLog(@Query('q') q?: string, @Query('kind') kind?: string, @Query('before') before?: string) {
    const kinds: Record<string, string[]> = {
      approvals: ['REQUEST_APPROVE', 'REQUEST_REJECT', 'REQUEST_CREATE'],
      prices: ['PRICE_CHANGE', 'ITEM_CREATE', 'ITEM_UPDATE'],
      dispatches: ['DISPATCH_CREATE', 'TRANSFER_ORDER', 'DISPATCH_SENT', 'DISPATCH_RECEIVE', 'RECEIVE_CODE_WRONG'],
      permissions: ['PERMS_CHANGE', 'ADMIN_CREATE', 'SHOP_CREATE', 'SETTINGS_CHANGE'],
      logins: ['LOGIN', 'LOGIN_FAILED', 'LOGIN_PASSWORD_OK', 'PASSWORD_CHANGE', 'PASSWORD_CHANGE_FAILED', 'PASSWORD_RESET'],
    };
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(kind && kinds[kind] ? { action: { in: kinds[kind] } } : {}),
        ...(q
          ? {
              OR: [
                { actorName: { contains: q, mode: 'insensitive' } },
                { summary: { contains: q, mode: 'insensitive' } },
                { entityId: q },
              ],
            }
          : {}),
        ...(before ? { id: { lt: BigInt(before) } } : {}),
      },
      orderBy: { id: 'desc' },
      take: 60,
    });
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }

  // ---- Settings (thresholds) -------------------------------------------------

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  @Roles('SUPER_ADMIN')
  async setSettings(@CurrentUser() user: AuthUser, @Body(new ZodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>) {
    const before = await this.settings.get();
    const after = await this.settings.set(body);
    await this.audit.log({ actor: user, action: 'SETTINGS_CHANGE', entityType: 'Setting', entityId: 'global', summary: `Changed settings: ${Object.keys(body).join(', ')}`, before, after });
    return after;
  }
}

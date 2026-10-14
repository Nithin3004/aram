import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { businessDate, createShopSchema, lowStock } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, isHo, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { AccessService } from '../core/access.service';
import { LedgerService } from '../core/ledger.service';
import { InsightsService } from '../core/insights.service';
import { SettingsService } from '../core/settings.service';
import { AuditService } from '../audit/audit.service';

@Controller('shops')
export class ShopsController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private ledger: LedgerService,
    private insights: InsightsService,
    private settings: SettingsService,
    private audit: AuditService,
  ) {}

  /** HO: every shop with stock total, today's closing and flags. */
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async list() {
    const [shops, bal, closings, low] = await Promise.all([
      this.prisma.shop.findMany({ orderBy: { code: 'asc' } }),
      this.ledger.balancesByShop(),
      this.insights.todaysClosings(),
      this.insights.lowStock(),
    ]);
    const { varianceTolerancePaise } = await this.settings.get();
    const lowCount = new Map<string, number>();
    for (const l of low) lowCount.set(l.shopId, (lowCount.get(l.shopId) ?? 0) + 1);
    return shops.map((s) => {
      const c = closings.get(s.id);
      const totalGrams = [...(bal.get(s.id)?.values() ?? [])].reduce((a, b) => a + b, 0);
      return {
        id: s.id,
        code: s.code,
        nameEn: s.nameEn,
        nameTa: s.nameTa,
        type: s.type,
        parentId: s.parentId,
        isActive: s.isActive,
        totalGrams,
        lowCount: lowCount.get(s.id) ?? 0,
        closedToday: !!c,
        variancePaise: c?.variancePaise ?? null,
        varianceFlagged: c ? Math.abs(c.variancePaise) > varianceTolerancePaise : false,
      };
    });
  }

  /** Supervisor app: stock of child shops (no sales). */
  @Get('mine/children')
  async children(@CurrentUser() user: AuthUser) {
    if (user.shopType !== 'SUPERVISOR') throw forbidden('Only supervisor shops have child shops');
    const kids = await this.prisma.shop.findMany({ where: { parentId: user.shopId!, isActive: true }, orderBy: { code: 'asc' } });
    const ids = kids.map((k) => k.id);
    const [bal, low] = await Promise.all([this.ledger.balancesByShop(ids), this.insights.lowStock(ids)]);
    const lowShops = new Set(low.map((l) => l.shopId));
    return kids.map((k) => ({
      id: k.id,
      code: k.code,
      nameEn: k.nameEn,
      nameTa: k.nameTa,
      totalGrams: [...(bal.get(k.id)?.values() ?? [])].reduce((a, b) => a + b, 0),
      low: lowShops.has(k.id),
    }));
  }

  /** Stock by item for a shop (with days-of-cover), plus sales if the caller may see them. */
  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.access.assertStock(user, id);
    const shop = await this.prisma.shop.findUnique({ where: { id }, include: { parent: true } });
    if (!shop) throw notFound('Shop');
    const [bal, sold, items, st] = await Promise.all([
      this.ledger.balances(id),
      this.insights.sold7d([id]),
      this.prisma.item.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.settings.get(),
    ]);
    const s7 = sold.get(id) ?? new Map<string, number>();
    const stock = items
      .filter((i) => bal.has(i.id) || s7.has(i.id))
      .map((i) => {
        const onHand = bal.get(i.id) ?? 0;
        const ls = lowStock({ onHandGrams: onHand, soldInWindowGrams: s7.get(i.id) ?? 0, thresholdDays: st.lowStockDays });
        return {
          itemId: i.id,
          code: i.code,
          nameEn: i.nameEn,
          nameTa: i.nameTa,
          onHandGrams: onHand,
          avgDailySoldGrams: ls.avgDailySoldGrams,
          daysLeft: ls.daysLeft,
          low: ls.low && ls.avgDailySoldGrams > 0,
          watch: !ls.low && ls.daysLeft !== null && ls.daysLeft < st.lowStockDays * 2,
        };
      });

    let sales = null;
    if (this.access.canSeeSales(user, id)) {
      const closings = await this.prisma.dailyClosing.findMany({
        where: { shopId: id },
        orderBy: { businessDate: 'desc' },
        take: 7,
      });
      const today = businessDate();
      const c = closings.find((x) => x.businessDate === today);
      sales = {
        today: c
          ? {
              expectedRevenuePaise: c.expectedRevenuePaise,
              cashPaise: c.cashPaise,
              upiPaise: c.upiPaise,
              variancePaise: c.variancePaise,
              varianceFlagged: c.varianceFlagged,
            }
          : null,
        lastClosingAt: closings[0]?.submittedAt ?? null,
        history: closings.map((x) => ({
          businessDate: x.businessDate,
          expectedRevenuePaise: x.expectedRevenuePaise,
          collectedPaise: x.cashPaise + x.upiPaise,
          variancePaise: x.variancePaise,
          varianceFlagged: x.varianceFlagged,
        })),
      };
    }

    return {
      id: shop.id,
      code: shop.code,
      nameEn: shop.nameEn,
      nameTa: shop.nameTa,
      type: shop.type,
      parent: shop.parent && { id: shop.parent.id, code: shop.parent.code, nameEn: shop.parent.nameEn, nameTa: shop.parent.nameTa },
      totalGrams: [...bal.values()].reduce((a, b) => a + b, 0),
      stock,
      sales,
    };
  }

  /** Super Admin creates shops and their login; shops cannot self-register. */
  @Post()
  @Roles('SUPER_ADMIN')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createShopSchema)) body: z.infer<typeof createShopSchema>) {
    if (body.type === 'SMALL' && !body.parentId) throw badRequest('shop.parentRequired', 'A small shop needs a supervisor');
    if (body.parentId) {
      const p = await this.prisma.shop.findUnique({ where: { id: body.parentId } });
      if (!p || p.type !== 'SUPERVISOR') throw badRequest('shop.badParent', 'Parent must be a supervisor shop');
    }
    const username = body.username.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { username } })) throw conflict('user.exists', 'Username already taken');
    if (await this.prisma.shop.findUnique({ where: { code: body.code } })) throw conflict('shop.exists', 'Shop code already used');

    const shop = await this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: { code: body.code, nameEn: body.nameEn, nameTa: body.nameTa, type: body.type, parentId: body.type === 'SMALL' ? body.parentId : null },
      });
      await tx.user.create({
        data: {
          username,
          passwordHash: await bcrypt.hash(body.password, 10),
          name: body.nameEn,
          phone: body.phone,
          role: 'SHOP',
          shopId: shop.id,
          language: 'ta',
        },
      });
      await this.audit.log(
        {
          actor: user,
          action: 'SHOP_CREATE',
          entityType: 'Shop',
          entityId: shop.id,
          summary: `Created ${body.type.toLowerCase()} shop ${body.code} ${body.nameEn} with login ${username}`,
          after: { ...body, password: undefined },
        },
        tx,
      );
      return shop;
    });
    return shop;
  }

  @Get(':id/ledger')
  async ledgerRows(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (!isHo(user)) throw forbidden();
    const rows = await this.prisma.stockLedger.findMany({ where: { shopId: id }, orderBy: { id: 'desc' }, take: 100 });
    return rows.map((r) => ({ ...r, id: r.id.toString() }));
  }
}

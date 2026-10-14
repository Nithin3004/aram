import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { addDays, businessDate, formatRupees, itemSchema, priceChangeSchema, updateItemSchema } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, isHo, RequirePermission } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { conflict, notFound } from '../common/errors';
import { PricesService } from '../core/prices.service';
import { AuditService } from '../audit/audit.service';

@Controller('items')
export class ItemsController {
  constructor(
    private prisma: PrismaService,
    private prices: PricesService,
    private audit: AuditService,
  ) {}

  /** HO sees every item (incl. inactive) with network stock; shops see active items only. */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const ho = isHo(user);
    const today = businessDate();
    const [items, current, all] = await Promise.all([
      this.prisma.item.findMany({ where: ho ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prices.pricesOn(today),
      ho ? this.prisma.itemPrice.findMany({ orderBy: { effectiveFrom: 'desc' } }) : Promise.resolve([]),
    ]);
    const net = ho
      ? new Map(
          (await this.prisma.stockLedger.groupBy({ by: ['itemId'], _sum: { qtyGrams: true } })).map((r) => [r.itemId, r._sum.qtyGrams ?? 0]),
        )
      : new Map<string, number>();
    return items.map((i) => {
      const hist = all.filter((p) => p.itemId === i.id);
      const scheduled = hist.find((p) => p.effectiveFrom > today);
      const lastApplied = hist.find((p) => p.effectiveFrom <= today);
      return {
        id: i.id,
        code: i.code,
        nameEn: i.nameEn,
        nameTa: i.nameTa,
        isActive: i.isActive,
        pricePaisePerKg: current.get(i.id) ?? null,
        ...(ho && {
          networkGrams: net.get(i.id) ?? 0,
          changedOn: lastApplied?.effectiveFrom ?? null,
          scheduled: scheduled ? { pricePaisePerKg: scheduled.pricePaisePerKg, effectiveFrom: scheduled.effectiveFrom } : null,
        }),
      };
    });
  }

  @Get(':id/prices')
  async history(@Param('id') id: string) {
    const rows = await this.prisma.itemPrice.findMany({ where: { itemId: id }, orderBy: { effectiveFrom: 'desc' } });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.createdById).filter((x): x is string => !!x) } },
      select: { id: true, name: true },
    });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      effectiveFrom: r.effectiveFrom,
      pricePaisePerKg: r.pricePaisePerKg,
      by: r.createdById ? names.get(r.createdById) ?? '—' : 'System',
    }));
  }

  @Post()
  @RequirePermission('MANAGE_ITEMS')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(itemSchema)) body: z.infer<typeof itemSchema>) {
    if (await this.prisma.item.findUnique({ where: { code: body.code } })) throw conflict('item.exists', 'Item code already used');
    return this.prisma.$transaction(async (tx) => {
      const max = await tx.item.aggregate({ _max: { sortOrder: true } });
      const item = await tx.item.create({
        data: { code: body.code, nameEn: body.nameEn, nameTa: body.nameTa, sortOrder: (max._max.sortOrder ?? 0) + 1 },
      });
      // A brand-new item has no sales history, so its first price can apply from today.
      await tx.itemPrice.create({
        data: { itemId: item.id, pricePaisePerKg: body.pricePaisePerKg, effectiveFrom: businessDate(), createdById: user.id },
      });
      await this.audit.log(
        {
          actor: user,
          action: 'ITEM_CREATE',
          entityType: 'Item',
          entityId: item.id,
          summary: `Added item ${body.code} ${body.nameEn} at ${formatRupees(body.pricePaisePerKg)}/kg`,
          after: body,
        },
        tx,
      );
      return item;
    });
  }

  /** Rename or (de)activate. Items are never deleted. */
  @Patch(':id')
  @RequirePermission('MANAGE_ITEMS')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateItemSchema)) body: z.infer<typeof updateItemSchema>) {
    const before = await this.prisma.item.findUnique({ where: { id } });
    if (!before) throw notFound('Item');
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.item.update({ where: { id }, data: body });
      const what =
        body.isActive === false ? 'Deactivated' : body.isActive === true && !before.isActive ? 'Reactivated' : 'Updated';
      await this.audit.log(
        {
          actor: user,
          action: 'ITEM_UPDATE',
          entityType: 'Item',
          entityId: id,
          summary: `${what} item ${before.code} ${after.nameEn}`,
          before: { nameEn: before.nameEn, nameTa: before.nameTa, isActive: before.isActive },
          after: { nameEn: after.nameEn, nameTa: after.nameTa, isActive: after.isActive },
        },
        tx,
      );
      return after;
    });
  }

  /** New price always starts at the next IST day open, so today's sales are never repriced. */
  @Post(':id/price')
  @RequirePermission('CHANGE_PRICES')
  async changePrice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(priceChangeSchema)) body: { pricePaisePerKg: number }) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw notFound('Item');
    const effectiveFrom = addDays(businessDate(), 1);
    const current = (await this.prices.pricesOn(businessDate())).get(id) ?? null;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.itemPrice.findUnique({ where: { itemId_effectiveFrom: { itemId: id, effectiveFrom } } });
      const row = await tx.itemPrice.upsert({
        where: { itemId_effectiveFrom: { itemId: id, effectiveFrom } },
        create: { itemId: id, pricePaisePerKg: body.pricePaisePerKg, effectiveFrom, createdById: user.id },
        update: { pricePaisePerKg: body.pricePaisePerKg, createdById: user.id },
      });
      await this.audit.log(
        {
          actor: user,
          action: 'PRICE_CHANGE',
          entityType: 'Item',
          entityId: id,
          summary: `${item.nameEn} price ${current ? formatRupees(current) : '—'} → ${formatRupees(body.pricePaisePerKg)}, effective ${effectiveFrom}`,
          before: { current, scheduled: existing?.pricePaisePerKg ?? null },
          after: { pricePaisePerKg: body.pricePaisePerKg, effectiveFrom },
        },
        tx,
      );
      return row;
    });
  }
}

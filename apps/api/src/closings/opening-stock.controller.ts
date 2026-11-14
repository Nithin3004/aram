import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { formatKg, formatRupees, openingStockSchema } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, hasPermission, isHo } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { AccessService } from '../core/access.service';
import { LedgerService } from '../core/ledger.service';
import { AuditService } from '../audit/audit.service';

/**
 * Opening stock (workbook "Opening_Stock"): what a shop holds, with cost rate, when it starts.
 * Entered once per shop — by the shop on first use, or by HO for any shop (incl. the HO warehouse).
 * After that, stock only changes through entries, deliveries and logged HO adjustments.
 */
@Controller('opening-stock')
export class OpeningStockController {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private ledger: LedgerService,
    private audit: AuditService,
  ) {}

  @Get(':shopId')
  async get(@CurrentUser() user: AuthUser, @Param('shopId') shopId: string) {
    await this.access.assertStock(user, shopId);
    const rows = await this.prisma.openingStock.findMany({ where: { shopId } });
    return { set: rows.length > 0, rows };
  }

  @Post()
  async set(@CurrentUser() user: AuthUser, @Body(new ZodPipe(openingStockSchema)) body: z.infer<typeof openingStockSchema>) {
    // A shop sets its own; HO staff who handle stock movements can set it for any shop.
    let shopId: string;
    if (isHo(user)) {
      if (!hasPermission(user, 'CREATE_DISPATCH')) throw forbidden();
      if (!body.shopId) throw badRequest('opening.shop', 'Choose the shop');
      shopId = body.shopId;
    } else {
      if (body.shopId && body.shopId !== user.shopId) throw forbidden();
      shopId = user.shopId!;
    }
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw notFound('Shop');
    const ids = body.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw badRequest('opening.dupItem', 'Each product once');
    const items = await this.prisma.item.findMany({ where: { id: { in: ids } } });
    if (items.length !== ids.length) throw badRequest('opening.badItem', 'Unknown product');

    return this.prisma.$transaction(async (tx) => {
      if (await tx.openingStock.count({ where: { shopId } })) throw conflict('opening.already', 'Opening stock is already entered for this shop');
      if (await tx.dailyClosing.count({ where: { shopId } })) throw conflict('opening.already', 'This shop already has daily entries — ask HO for an adjustment');
      const lines = body.lines.filter((l) => l.grams > 0 || l.ratePaise);
      if (!lines.length) throw badRequest('opening.empty', 'Enter at least one product');
      await tx.openingStock.createMany({ data: lines.map((l) => ({ shopId, itemId: l.itemId, grams: l.grams, ratePaise: l.ratePaise ?? null, enteredById: user.id })) });
      await this.ledger.post(
        tx,
        lines.map((l) => ({ shopId, itemId: l.itemId, qtyGrams: l.grams, type: 'ADJUSTMENT' as const, refType: 'OpeningStock', refId: shopId, createdById: user.id, note: 'Opening stock' })),
      );
      const value = lines.reduce((a, l) => a + Math.round((l.grams * (l.ratePaise ?? 0)) / 1000), 0);
      await this.audit.log(
        {
          actor: user,
          action: 'OPENING_STOCK',
          entityType: 'Shop',
          entityId: shopId,
          summary: `Opening stock for ${shop.code}: ${lines.map((l) => `${items.find((i) => i.id === l.itemId)!.nameEn} ${formatKg(l.grams)}`).join(', ')}${value ? ` · value ${formatRupees(value)}` : ''}`,
          after: lines,
        },
        tx,
      );
      return { ok: true };
    });
  }
}

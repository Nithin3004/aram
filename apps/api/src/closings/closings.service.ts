import { Injectable } from '@nestjs/common';
import { ClosingInput, businessDate, computeDailyEntry, formatKg, formatRupees } from '@aram/shared';
import { PrismaService, Tx } from '../prisma.service';
import { AuthUser, isHo } from '../common/auth-user';
import { badRequest, conflict, forbidden } from '../common/errors';
import { AuditService, SYSTEM } from '../audit/audit.service';
import { LedgerService } from '../core/ledger.service';
import { PricesService } from '../core/prices.service';
import { SettingsService } from '../core/settings.service';

const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Daily entry (the HO workbook's Daily_Entry): each shop records, per product, the day's
 * purchases and sales (loose kg/L and/or ½ and 1 packs, with rates). Closing stock is worked out:
 * opening + received − sent out + adjustments + purchases − sales. Cash and UPI are checked against
 * the sales amount. Locked after submit; corrections only through HO adjustments.
 */
@Injectable()
export class ClosingsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private prices: PricesService,
    private settings: SettingsService,
    private audit: AuditService,
  ) {}

  /**
   * Per-item numbers for the window since the previous entry, up to `upTo`.
   * Opening = stock at the previous entry (so next day's opening = previous closing).
   */
  private async window(shopId: string, upTo: Date, db: Tx | PrismaService) {
    const prev = await db.dailyClosing.findFirst({ where: { shopId }, orderBy: { capturedAt: 'desc' } });
    const from = prev?.capturedAt ?? null;
    const [opening, moves] = await Promise.all([
      from ? this.ledger.balances(shopId, db, from) : Promise.resolve(new Map<string, number>()),
      this.ledger.movements(shopId, from, upTo, db),
    ]);
    const rows = new Map<string, { openingGrams: number; receivedGrams: number; sentOutGrams: number; adjustmentGrams: number }>();
    for (const itemId of new Set<string>([...opening.keys(), ...moves.keys()])) {
      const m = moves.get(itemId) ?? {};
      rows.set(itemId, {
        openingGrams: opening.get(itemId) ?? 0,
        receivedGrams: m.RECEIVE_IN ?? 0,
        sentOutGrams: -(m.DISPATCH_OUT ?? 0),
        // Opening stock entered after the last entry, and HO corrections, arrive as adjustments.
        adjustmentGrams: (m.ADJUSTMENT ?? 0) + (m.PURCHASE ?? 0),
      });
    }
    return { prev, rows };
  }

  /** What the app needs for today's entry (cached for offline use): every active product. */
  async draft(user: AuthUser) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only shops submit closings');
    const today = businessDate();
    const [{ prev, rows }, prices, items, st, done, opening] = await Promise.all([
      this.window(shopId, new Date(), this.prisma),
      this.prices.pricesOn(today),
      this.prisma.item.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.settings.get(),
      this.prisma.dailyClosing.findUnique({ where: { shopId_businessDate: { shopId, businessDate: today } } }),
      this.prisma.openingStock.count({ where: { shopId } }),
    ]);
    return {
      businessDate: today,
      alreadySubmitted: !!done,
      previousClosingAt: prev?.capturedAt ?? null,
      /** First use: the shop should enter its opening stock before the first daily entry. */
      openingStockSet: opening > 0 || !!prev,
      varianceTolerancePaise: st.varianceTolerancePaise,
      closingDueTime: st.closingDueTime,
      lines: items.map((i) => {
        const r = rows.get(i.id);
        return {
          itemId: i.id,
          nameEn: i.nameEn,
          nameTa: i.nameTa,
          unit: i.unit,
          openingGrams: r?.openingGrams ?? 0,
          receivedGrams: r?.receivedGrams ?? 0,
          sentOutGrams: r?.sentOutGrams ?? 0,
          adjustmentGrams: r?.adjustmentGrams ?? 0,
          // HO's price is the suggested selling rate; the shop can change it for the day.
          pricePaisePerKg: prices.get(i.id) ?? 0,
        };
      }),
    };
  }

  /**
   * Submit and lock the day. Idempotent on clientId (offline sync may send it twice).
   * Stock numbers come from the ledger on the server; only the day's purchases, sales and money come from the shop.
   */
  async submit(user: AuthUser, input: ClosingInput) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only shops submit closings');

    const existing = await this.prisma.dailyClosing.findUnique({ where: { clientId: input.clientId } });
    if (existing) {
      if (existing.shopId !== shopId) throw forbidden();
      return this.summary(existing.id, true);
    }

    const capturedAt = new Date(input.capturedAt);
    if (capturedAt.getTime() > Date.now() + CLOCK_SKEW_MS) throw badRequest('closing.future', 'Closing time is in the future');
    if (businessDate(capturedAt) !== input.businessDate) throw badRequest('closing.date', 'Business date does not match entry time');
    const itemIds = input.lines.map((l) => l.itemId);
    if (new Set(itemIds).size !== itemIds.length) throw badRequest('closing.dupItem', 'Each product once');

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const dup = await tx.dailyClosing.findUnique({ where: { shopId_businessDate: { shopId, businessDate: input.businessDate } } });
        if (dup) throw conflict('closing.already', 'This day is already closed and locked');

        const { prev, rows } = await this.window(shopId, capturedAt, tx);
        if (prev && capturedAt <= prev.capturedAt) throw badRequest('closing.order', 'Entry is older than the previous one');
        const [st, items] = await Promise.all([this.settings.get(), tx.item.findMany({ where: { id: { in: [...new Set([...itemIds, ...rows.keys()])] } } })]);
        if (itemIds.some((i) => !items.find((x) => x.id === i))) throw badRequest('closing.badItem', 'Unknown item');

        // Every product the shop holds or moved is carried forward, even with no purchase or sale today.
        const entered = new Map(input.lines.map((l) => [l.itemId, l]));
        const allIds = [...new Set([...itemIds, ...[...rows.entries()].filter(([, r]) => r.openingGrams || r.receivedGrams || r.sentOutGrams || r.adjustmentGrams).map(([k]) => k)])];
        const zero = { looseGrams: 0, halfPacks: 0, onePacks: 0, ratePaise: 0 };
        const result = computeDailyEntry({
          lines: allIds.map((itemId) => {
            const r = rows.get(itemId);
            const e = entered.get(itemId);
            return {
              itemId,
              openingGrams: r?.openingGrams ?? 0,
              receivedGrams: r?.receivedGrams ?? 0,
              sentOutGrams: r?.sentOutGrams ?? 0,
              adjustmentGrams: r?.adjustmentGrams ?? 0,
              purchase: e?.purchase ?? zero,
              sales: e?.sales ?? zero,
            };
          }),
          cashPaise: input.cashPaise,
          upiPaise: input.upiPaise,
          varianceTolerancePaise: st.varianceTolerancePaise,
        });

        const c = await tx.dailyClosing.create({
          data: {
            clientId: input.clientId,
            shopId,
            businessDate: input.businessDate,
            capturedAt,
            cashPaise: input.cashPaise,
            upiPaise: input.upiPaise,
            expectedRevenuePaise: result.salesPaise,
            variancePaise: result.variancePaise,
            varianceFlagged: result.varianceFlagged,
            note: input.note,
            submittedById: user.id,
            lines: {
              create: result.lines.map((l) => ({
                itemId: l.itemId,
                openingGrams: l.openingGrams,
                receivedGrams: l.receivedGrams,
                sentOutGrams: l.sentOutGrams,
                adjustmentGrams: l.adjustmentGrams,
                closingGrams: l.closingGrams,
                soldGrams: l.salesGrams,
                pricePaisePerKg: l.salesGrams ? Math.round((l.salesPaise * 1000) / l.salesGrams) : 0,
                expectedPaise: l.salesPaise,
                purchaseGrams: l.purchaseGrams,
                purchasePaise: l.purchasePaise,
              })),
            },
          },
        });

        // The day's own purchases come in and sales go out at entry time; stock after = worked-out closing.
        await this.ledger.post(tx, [
          ...result.lines.map((l) => ({
            shopId,
            itemId: l.itemId,
            qtyGrams: l.purchaseGrams,
            type: 'PURCHASE' as const,
            refType: 'DailyClosing',
            refId: c.id,
            effectiveAt: capturedAt,
            createdById: user.id,
          })),
          ...result.lines.map((l) => ({
            shopId,
            itemId: l.itemId,
            qtyGrams: -l.salesGrams,
            type: 'SOLD' as const,
            refType: 'DailyClosing',
            refId: c.id,
            effectiveAt: capturedAt,
            createdById: user.id,
          })),
        ]);

        await this.audit.log(
          {
            actor: user,
            action: 'CLOSING_SUBMIT',
            entityType: 'DailyClosing',
            entityId: c.id,
            summary: `Daily entry ${input.businessDate}: purchases ${formatRupees(result.purchasePaise)}, sales ${formatRupees(result.salesPaise)}, collected ${formatRupees(
              result.collectedPaise,
            )}, gap ${formatRupees(result.variancePaise, { signed: true })}`,
            after: { lines: input.lines, cashPaise: input.cashPaise, upiPaise: input.upiPaise, note: input.note },
          },
          tx,
        );

        const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId } });
        if (result.varianceFlagged) {
          const iss = await tx.issue.create({
            data: {
              clientId: `auto:variance:${c.id}`,
              shopId,
              source: 'AUTO',
              type: 'CASH_VARIANCE',
              closingId: c.id,
              description: `${shop.code} ${input.businessDate}: money ${result.variancePaise < 0 ? 'short' : 'over'} by ${formatRupees(
                Math.abs(result.variancePaise),
              )} (sales ${formatRupees(result.salesPaise)}, collected ${formatRupees(result.collectedPaise)})${input.note ? ' — shop says: ' + input.note : ''}`,
            },
          });
          await this.audit.log({ actor: SYSTEM, action: 'ISSUE_AUTO', entityType: 'Issue', entityId: iss.id, summary: iss.description }, tx);
        }
        if (result.negativeLines.length) {
          const names = result.negativeLines
            .map((l) => {
              const it = items.find((i) => i.id === l.itemId)!;
              return `${it.nameEn} (sold ${formatKg(-l.closingGrams)} ${it.unit} more than in stock)`;
            })
            .join(', ');
          const iss = await tx.issue.create({
            data: {
              clientId: `auto:negative:${c.id}`,
              shopId,
              source: 'AUTO',
              type: 'NEGATIVE_SOLD',
              closingId: c.id,
              description: `${shop.code} ${input.businessDate}: sales more than stock — ${names}`,
            },
          });
          await this.audit.log({ actor: SYSTEM, action: 'ISSUE_AUTO', entityType: 'Issue', entityId: iss.id, summary: iss.description }, tx);
        }
        return c.id;
      });
      return this.summary(id, false);
    } catch (e) {
      const again = await this.prisma.dailyClosing.findUnique({ where: { clientId: input.clientId } });
      if (again) return this.summary(again.id, true);
      throw e;
    }
  }

  async summary(id: string, duplicate: boolean) {
    const c = await this.prisma.dailyClosing.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    return {
      id: c.id,
      duplicate,
      businessDate: c.businessDate,
      expectedRevenuePaise: c.expectedRevenuePaise,
      purchasePaise: c.lines.reduce((a, l) => a + l.purchasePaise, 0),
      cashPaise: c.cashPaise,
      upiPaise: c.upiPaise,
      variancePaise: c.variancePaise,
      varianceFlagged: c.varianceFlagged,
      lines: c.lines,
    };
  }

  /** HO: all entries for a date. Shops: their own recent entries. */
  async list(user: AuthUser, date?: string) {
    if (isHo(user)) {
      const d = date ?? businessDate();
      return this.prisma.dailyClosing.findMany({ where: { businessDate: d }, orderBy: { submittedAt: 'asc' } });
    }
    return this.prisma.dailyClosing.findMany({ where: { shopId: user.shopId! }, orderBy: { businessDate: 'desc' }, take: 14 });
  }
}

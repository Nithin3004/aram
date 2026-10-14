import { Injectable } from '@nestjs/common';
import { ClosingInput, businessDate, computeClosing, formatKg, formatRupees } from '@aram/shared';
import { PrismaService, Tx } from '../prisma.service';
import { AuthUser, isHo } from '../common/auth-user';
import { badRequest, conflict, forbidden } from '../common/errors';
import { AuditService, SYSTEM } from '../audit/audit.service';
import { LedgerService } from '../core/ledger.service';
import { PricesService } from '../core/prices.service';
import { SettingsService } from '../core/settings.service';

const CLOCK_SKEW_MS = 5 * 60 * 1000;

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
   * Per-item numbers for the window since the previous closing, up to `upTo`.
   * Opening = stock at the previous closing (so next day's opening = previous closing).
   */
  private async window(shopId: string, upTo: Date, db: Tx | PrismaService) {
    const prev = await db.dailyClosing.findFirst({ where: { shopId }, orderBy: { capturedAt: 'desc' } });
    const from = prev?.capturedAt ?? null;
    const [opening, moves] = await Promise.all([
      from ? this.ledger.balances(shopId, db, from) : Promise.resolve(new Map<string, number>()),
      this.ledger.movements(shopId, from, upTo, db),
    ]);
    const itemIds = new Set<string>([...opening.keys(), ...moves.keys()]);
    const rows = [...itemIds].map((itemId) => {
      const m = moves.get(itemId) ?? {};
      return {
        itemId,
        openingGrams: opening.get(itemId) ?? 0,
        // Purchases only happen at HO, which does not close; count them as received for completeness.
        receivedGrams: (m.RECEIVE_IN ?? 0) + (m.PURCHASE ?? 0),
        sentOutGrams: -(m.DISPATCH_OUT ?? 0),
        adjustmentGrams: m.ADJUSTMENT ?? 0,
        priorSoldGrams: -(m.SOLD ?? 0),
      };
    });
    return { prev, rows };
  }

  /** What the app needs to run today's closing (cached for offline use). */
  async draft(user: AuthUser) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only shops submit closings');
    const today = businessDate();
    const [{ prev, rows }, prices, items, st, done] = await Promise.all([
      this.window(shopId, new Date(), this.prisma),
      this.prices.pricesOn(today),
      this.prisma.item.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.settings.get(),
      this.prisma.dailyClosing.findUnique({ where: { shopId_businessDate: { shopId, businessDate: today } } }),
    ]);
    const byItem = new Map(rows.map((r) => [r.itemId, r]));
    return {
      businessDate: today,
      alreadySubmitted: !!done,
      previousClosingAt: prev?.capturedAt ?? null,
      varianceTolerancePaise: st.varianceTolerancePaise,
      closingDueTime: st.closingDueTime,
      lines: items
        .filter((i) => {
          const r = byItem.get(i.id);
          return r && (r.openingGrams || r.receivedGrams || r.sentOutGrams || r.adjustmentGrams);
        })
        .map((i) => {
          const r = byItem.get(i.id)!;
          return {
            itemId: i.id,
            nameEn: i.nameEn,
            nameTa: i.nameTa,
            openingGrams: r.openingGrams,
            receivedGrams: r.receivedGrams,
            sentOutGrams: r.sentOutGrams,
            adjustmentGrams: r.adjustmentGrams,
            pricePaisePerKg: prices.get(i.id) ?? 0,
          };
        }),
    };
  }

  /**
   * Submit and lock the day. Idempotent on clientId (offline sync may send it twice).
   * The server recomputes everything from the ledger; the client's numbers are not trusted.
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
    if (businessDate(capturedAt) !== input.businessDate) throw badRequest('closing.date', 'Business date does not match count time');

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const dup = await tx.dailyClosing.findUnique({ where: { shopId_businessDate: { shopId, businessDate: input.businessDate } } });
        if (dup) throw conflict('closing.already', 'This day is already closed and locked');

        const { prev, rows } = await this.window(shopId, capturedAt, tx);
        if (prev && capturedAt <= prev.capturedAt) throw badRequest('closing.order', 'Closing is older than the previous one');

        const counted = new Map(input.lines.map((l) => [l.itemId, l.closingGrams]));
        // Every item with stock or movement in the window must be counted.
        const needed = rows.filter((r) => r.openingGrams || r.receivedGrams || r.sentOutGrams || r.adjustmentGrams);
        const missing = needed.filter((r) => !counted.has(r.itemId));
        if (missing.length) throw badRequest('closing.missing', 'Enter the closing stock for every item');
        const known = new Set(rows.map((r) => r.itemId));
        const [prices, st, items] = await Promise.all([
          this.prices.pricesOn(input.businessDate, tx),
          this.settings.get(),
          tx.item.findMany({ where: { id: { in: [...counted.keys()] } } }),
        ]);
        if (items.length !== counted.size) throw badRequest('closing.badItem', 'Unknown item');

        const lines = [...counted.entries()].map(([itemId, closingGrams]) => {
          const r = known.has(itemId) ? rows.find((x) => x.itemId === itemId)! : null;
          return {
            itemId,
            openingGrams: r?.openingGrams ?? 0,
            receivedGrams: r?.receivedGrams ?? 0,
            sentOutGrams: r?.sentOutGrams ?? 0,
            adjustmentGrams: r?.adjustmentGrams ?? 0,
            closingGrams,
            pricePaisePerKg: prices.get(itemId) ?? 0,
          };
        });
        const result = computeClosing({
          lines,
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
            expectedRevenuePaise: result.expectedRevenuePaise,
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
                soldGrams: l.soldGrams,
                pricePaisePerKg: l.pricePaisePerKg,
                expectedPaise: l.expectedPaise,
              })),
            },
          },
        });

        // Sold qty leaves the ledger at count time, so stock after closing = counted closing.
        await this.ledger.post(
          tx,
          result.lines.map((l) => ({
            shopId,
            itemId: l.itemId,
            qtyGrams: -l.soldGrams,
            type: 'SOLD' as const,
            refType: 'DailyClosing',
            refId: c.id,
            effectiveAt: capturedAt,
            createdById: user.id,
          })),
        );

        await this.audit.log(
          {
            actor: user,
            action: 'CLOSING_SUBMIT',
            entityType: 'DailyClosing',
            entityId: c.id,
            summary: `Closing ${input.businessDate}: expected ${formatRupees(result.expectedRevenuePaise)}, collected ${formatRupees(
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
              )} (expected ${formatRupees(result.expectedRevenuePaise)}, collected ${formatRupees(result.collectedPaise)})${
                input.note ? ' — shop says: ' + input.note : ''
              }`,
            },
          });
          await this.audit.log({ actor: SYSTEM, action: 'ISSUE_AUTO', entityType: 'Issue', entityId: iss.id, summary: iss.description }, tx);
        }
        if (result.negativeSoldLines.length) {
          const names = result.negativeSoldLines
            .map((l) => `${items.find((i) => i.id === l.itemId)!.nameEn} (${formatKg(-l.soldGrams)} kg more than expected)`)
            .join(', ');
          const iss = await tx.issue.create({
            data: {
              clientId: `auto:negative:${c.id}`,
              shopId,
              source: 'AUTO',
              type: 'NEGATIVE_SOLD',
              closingId: c.id,
              description: `${shop.code} ${input.businessDate}: closing more than stock — ${names}`,
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
      cashPaise: c.cashPaise,
      upiPaise: c.upiPaise,
      variancePaise: c.variancePaise,
      varianceFlagged: c.varianceFlagged,
      lines: c.lines,
    };
  }

  /** HO: all closings for a date. Shops: their own recent closings. */
  async list(user: AuthUser, date?: string) {
    if (isHo(user)) {
      const d = date ?? businessDate();
      const rows = await this.prisma.dailyClosing.findMany({ where: { businessDate: d }, orderBy: { submittedAt: 'asc' } });
      return rows;
    }
    return this.prisma.dailyClosing.findMany({ where: { shopId: user.shopId! }, orderBy: { businessDate: 'desc' }, take: 14 });
  }
}

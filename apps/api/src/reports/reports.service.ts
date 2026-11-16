import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addDays, businessDate, lineValuePaise } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { badRequest } from '../common/errors';

/** Financial year starts in April (1-Apr), as in the HO workbook. */
const FY_START_MONTH = 4;
const MAX_DAYS = 370;

export type Period = 'day' | 'month' | 'year';
export interface RegisterQuery {
  period: Period;
  from: string;
  to: string;
  supervisorId?: string;
  shopId?: string;
  itemId?: string;
}

const monthKey = (date: string) => date.slice(0, 7); // YYYY-MM
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
const fyOf = (date: string) => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= FY_START_MONTH ? y : y - 1;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Purchase / sales / stock / profit registers, as in the HO workbook:
 *   Sales            = sold qty × selling price (from daily closings)
 *   Cost of goods    = sold qty × cost rate, where cost rate = that month's average purchase
 *                      rate of the product (carried forward; before any purchase, the opening rate)
 *   Gross profit     = Sales − Cost of goods (rent, salaries, wastage not included)
 *   Stock value      = quantity on hand × cost rate
 * Weight (kg) and volume (L) are only added as ₹ values; quantities appear only for one product.
 */
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async register(q: RegisterQuery) {
    if (q.from > q.to) throw badRequest('report.range', 'From date is after To date');
    const today = businessDate();
    const to = q.to > today ? today : q.to;

    // ---- which shops are in scope ------------------------------------------------------------
    const chain = !q.shopId && !q.supervisorId;
    let shopIds: string[];
    if (q.shopId) shopIds = [q.shopId];
    else if (q.supervisorId) {
      const kids = await this.prisma.shop.findMany({ where: { OR: [{ id: q.supervisorId }, { parentId: q.supervisorId }] }, select: { id: true } });
      shopIds = kids.map((k) => k.id);
    } else {
      // Whole chain includes the HO warehouse, so stock bought but not yet sent out is valued too.
      shopIds = (await this.prisma.shop.findMany({ select: { id: true } })).map((s) => s.id);
    }
    if (!shopIds.length) throw badRequest('report.scope', 'No shops in this selection');

    const items = await this.prisma.item.findMany({ where: q.itemId ? { id: q.itemId } : {} });
    const itemIds = items.map((i) => i.id);
    const itemFilter = q.itemId ? Prisma.sql`AND l."itemId" = ${q.itemId}` : Prisma.empty;

    // ---- cost rate per item per month (workbook Rate_Card) -------------------------------------
    // = that month's average purchase rate across ALL shops and HO; carried forward when a month
    // has no purchases; before any purchase, HO's opening cost rate or the average opening-stock rate.
    const purchases = await this.prisma.purchase.findMany({ where: { itemId: { in: itemIds } } });
    const shopPurchases = await this.prisma.$queryRaw<{ itemId: string; shopId: string; d: string; g: bigint; amt: bigint }[]>`
      SELECT cl."itemId", c."shopId", c."businessDate" AS d, SUM(cl."purchaseGrams")::bigint AS g, SUM(cl."purchasePaise")::bigint AS amt
      FROM "ClosingLine" cl JOIN "DailyClosing" c ON c.id = cl."closingId"
      WHERE cl."purchaseGrams" > 0 ${q.itemId ? Prisma.sql`AND cl."itemId" = ${q.itemId}` : Prisma.empty}
      GROUP BY 1, 2, 3`;
    const monthAgg = new Map<string, { qty: number; amt: number }>(); // itemId|YYYY-MM
    const addAgg = (itemId: string, date: string, qty: number, amt: number) => {
      const k = `${itemId}|${monthKey(date)}`;
      const a = monthAgg.get(k) ?? { qty: 0, amt: 0 };
      a.qty += qty;
      a.amt += amt;
      monthAgg.set(k, a);
    };
    for (const p of purchases) addAgg(p.itemId, p.date, p.qtyGrams, lineValuePaise(p.qtyGrams, p.costPaisePerKg));
    for (const p of shopPurchases) addAgg(p.itemId, p.d, Number(p.g), Number(p.amt));
    const openingRates = await this.prisma.openingStock.groupBy({ by: ['itemId'], where: { itemId: { in: itemIds }, ratePaise: { not: null }, grams: { gt: 0 } }, _sum: { grams: true } });
    const openingRows = await this.prisma.openingStock.findMany({ where: { itemId: { in: itemIds }, ratePaise: { not: null }, grams: { gt: 0 } } });
    const openingAvg = new Map(
      openingRates.map((o) => [o.itemId, Math.round(openingRows.filter((r) => r.itemId === o.itemId).reduce((a, r) => a + r.grams * (r.ratePaise ?? 0), 0) / (o._sum.grams || 1))]),
    );
    const firstMonth = monthKey([q.from, ...purchases.map((p) => p.date), ...shopPurchases.map((p) => p.d)].sort()[0]);
    const rateCache = new Map<string, number>();
    const costRate = (itemId: string, ym: string): number => {
      const key = `${itemId}|${ym}`;
      if (rateCache.has(key)) return rateCache.get(key)!;
      let rate = items.find((i) => i.id === itemId)?.baseCostPaisePerKg ?? openingAvg.get(itemId) ?? 0;
      for (let m = firstMonth; m <= ym; m = nextMonth(m)) {
        const a = monthAgg.get(`${itemId}|${m}`);
        if (a && a.qty > 0) rate = Math.round((a.amt * 1000) / a.qty);
        rateCache.set(`${itemId}|${m}`, rate);
      }
      rateCache.set(key, rate);
      return rate;
    };

    // ---- daily stock movements per item (IST calendar day) -----------------------------------
    const moves = await this.prisma.$queryRaw<{ itemId: string; d: string; type: string; opening: boolean; g: bigint }[]>`
      SELECT l."itemId", to_char((l."effectiveAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d,
             l."type"::text AS type, (l."refType" = 'OpeningStock') AS opening, SUM(l."qtyGrams")::bigint AS g
      FROM "StockLedger" l
      WHERE l."shopId" IN (${Prisma.join(shopIds)}) ${itemFilter}
      GROUP BY 1, 2, 3, 4`;
    // Sales from daily closings.
    const sales = await this.prisma.$queryRaw<{ itemId: string; d: string; sold: bigint; amt: bigint }[]>`
      SELECT cl."itemId", c."businessDate" AS d, SUM(cl."soldGrams")::bigint AS sold, SUM(cl."expectedPaise")::bigint AS amt
      FROM "ClosingLine" cl JOIN "DailyClosing" c ON c.id = cl."closingId"
      WHERE c."shopId" IN (${Prisma.join(shopIds)}) ${q.itemId ? Prisma.sql`AND cl."itemId" = ${q.itemId}` : Prisma.empty}
        AND c."businessDate" <= ${to}
      GROUP BY 1, 2`;

    // Opening quantity per item before `from`; then daily net change and inbound.
    const openQty = new Map<string, number>();
    const dayNet = new Map<string, Map<string, number>>(); // date -> item -> net grams
    const dayIn = new Map<string, Map<string, number>>(); // date -> item -> inbound grams
    const dayReceived = new Map<string, Map<string, number>>(); // date -> item -> received from HO (valued at cost rate)
    const bump = (m: Map<string, Map<string, number>>, d: string, item: string, g: number) => {
      if (!m.has(d)) m.set(d, new Map());
      m.get(d)!.set(item, (m.get(d)!.get(item) ?? 0) + g);
    };
    // Opening stock (workbook Opening_Stock) is the stock a shop starts with, so it belongs to the
    // OPENING of the period it was entered in, not to that period's movements.
    const periodKey = (d: string) => (q.period === 'day' ? d : q.period === 'month' ? monthKey(d) : String(fyOf(d)));
    const openAdd = new Map<string, Map<string, number>>(); // periodKey -> item -> grams
    for (const r of moves) {
      const g = Number(r.g);
      if (r.d < q.from) openQty.set(r.itemId, (openQty.get(r.itemId) ?? 0) + g);
      else if (r.d <= to && r.opening) {
        const k = periodKey(r.d);
        if (!openAdd.has(k)) openAdd.set(k, new Map());
        openAdd.get(k)!.set(r.itemId, (openAdd.get(k)!.get(r.itemId) ?? 0) + g);
      } else if (r.d <= to) {
        bump(dayNet, r.d, r.itemId, g);
        // Inbound: purchases (HO's and the shops' own) everywhere; for a shop/supervisor, also goods received from HO.
        if (r.type === 'PURCHASE' || (!chain && r.type === 'RECEIVE_IN')) bump(dayIn, r.d, r.itemId, g);
        if (!chain && r.type === 'RECEIVE_IN') bump(dayReceived, r.d, r.itemId, g);
      }
    }
    const daySales = new Map<string, Map<string, { sold: number; amt: number }>>();
    for (const r of sales) {
      if (r.d < q.from || r.d > to) continue;
      if (!daySales.has(r.d)) daySales.set(r.d, new Map());
      daySales.get(r.d)!.set(r.itemId, { sold: Number(r.sold), amt: Number(r.amt) });
    }
    // Purchases are valued at what was actually paid: HO's vendor purchases (whole chain only, as they
    // land in the HO warehouse) and the shops' own purchases within the selection.
    const dayPurchaseAmt = new Map<string, number>();
    const addAmt = (d: string, amt: number) => d >= q.from && d <= to && dayPurchaseAmt.set(d, (dayPurchaseAmt.get(d) ?? 0) + amt);
    if (chain) for (const p of purchases) addAmt(p.date, lineValuePaise(p.qtyGrams, p.costPaisePerKg));
    const inScope = new Set(shopIds);
    for (const p of shopPurchases) if (inScope.has(p.shopId)) addAmt(p.d, Number(p.amt));

    // ---- walk day by day, then roll up into periods -------------------------------------------
    const days: string[] = [];
    for (let d = q.from; d <= to; d = addDays(d, 1)) {
      days.push(d);
      if (days.length > MAX_DAYS * 3) throw badRequest('report.range', 'Date range too long');
    }
    if (q.period === 'day' && days.length > MAX_DAYS) throw badRequest('report.range', 'Daily register is limited to about one year');

    const qty = new Map(openQty);
    const valueOf = (ym: string) => [...qty.entries()].reduce((a, [itemId, g]) => a + lineValuePaise(g, costRate(itemId, ym)), 0);
    const totalQty = () => [...qty.values()].reduce((a, b) => a + b, 0);

    type Row = {
      key: string;
      label: string;
      openingValuePaise: number;
      inPaise: number;
      salesPaise: number;
      cogsPaise: number;
      closingValuePaise: number;
      openingQty: number;
      inQty: number;
      salesQty: number;
      closingQty: number;
      /** Opening stock entered in this period (already inside openingValuePaise / openingQty). */
      openAddValue: number;
      openAddQty: number;
    };
    const rows: Row[] = [];
    const periodLabel = (k: string) => {
      if (q.period === 'day') return `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
      if (q.period === 'month') return `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
      return `${k}-${String((Number(k) + 1) % 100).padStart(2, '0')}`;
    };

    let cur: Row | null = null;
    for (const d of days) {
      const k = periodKey(d);
      const ym = monthKey(d);
      if (!cur || cur.key !== k) {
        if (cur) rows.push(cur);
        let addValue = 0;
        let addQty = 0;
        for (const [itemId, g] of openAdd.get(k) ?? []) {
          qty.set(itemId, (qty.get(itemId) ?? 0) + g);
          addValue += lineValuePaise(g, costRate(itemId, ym));
          addQty += g;
        }
        cur = { key: k, label: periodLabel(k), openingValuePaise: valueOf(ym), inPaise: 0, salesPaise: 0, cogsPaise: 0, closingValuePaise: 0, openingQty: totalQty(), inQty: 0, salesQty: 0, closingQty: 0, openAddValue: addValue, openAddQty: addQty };
      }
      for (const [, g] of dayIn.get(d) ?? []) cur.inQty += g;
      for (const [itemId, g] of dayReceived.get(d) ?? []) cur.inPaise += lineValuePaise(g, costRate(itemId, ym));
      cur.inPaise += dayPurchaseAmt.get(d) ?? 0;
      for (const [itemId, s] of daySales.get(d) ?? []) {
        cur.salesQty += s.sold;
        cur.salesPaise += s.amt;
        cur.cogsPaise += lineValuePaise(s.sold, costRate(itemId, ym));
      }
      for (const [itemId, g] of dayNet.get(d) ?? []) qty.set(itemId, (qty.get(itemId) ?? 0) + g);
      cur.closingValuePaise = valueOf(ym);
      cur.closingQty = totalQty();
    }
    if (cur) rows.push(cur);

    const shaped = rows.map((r) => {
      const gp = r.salesPaise - r.cogsPaise;
      return {
        label: r.label,
        openingValuePaise: r.openingValuePaise,
        inPaise: r.inPaise,
        salesPaise: r.salesPaise,
        cogsPaise: r.cogsPaise,
        grossProfitPaise: gp,
        gpPct: r.salesPaise ? Math.round((gp / r.salesPaise) * 1000) / 10 : 0,
        closingValuePaise: r.closingValuePaise,
        // Quantities only make sense for a single product (kg and litres are never added).
        ...(q.itemId ? { openingQty: r.openingQty, inQty: r.inQty, salesQty: r.salesQty, closingQty: r.closingQty } : {}),
      };
    });
    const sum = (f: (r: (typeof shaped)[number]) => number) => shaped.reduce((a, r) => a + f(r), 0);
    // Whole-range opening = stock at the start + opening stock entered in any later period, so that
    // opening + purchases − cost of goods ≈ closing also holds for the total line.
    const laterOpenValue = rows.slice(1).reduce((a, r) => a + r.openAddValue, 0);
    const laterOpenQty = rows.slice(1).reduce((a, r) => a + r.openAddQty, 0);
    const salesT = sum((r) => r.salesPaise);
    const cogsT = sum((r) => r.cogsPaise);
    return {
      period: q.period,
      from: q.from,
      to,
      chain,
      inLabel: chain ? 'PURCHASES' : 'RECEIVED',
      unit: q.itemId ? items[0]?.unit ?? 'kg' : null,
      rows: shaped,
      total: {
        openingValuePaise: (shaped[0]?.openingValuePaise ?? 0) + laterOpenValue,
        inPaise: sum((r) => r.inPaise),
        salesPaise: salesT,
        cogsPaise: cogsT,
        grossProfitPaise: salesT - cogsT,
        gpPct: salesT ? Math.round(((salesT - cogsT) / salesT) * 1000) / 10 : 0,
        closingValuePaise: shaped[shaped.length - 1]?.closingValuePaise ?? 0,
        ...(q.itemId
          ? {
              openingQty: (shaped[0]?.openingQty ?? 0) + laterOpenQty,
              inQty: sum((r) => r.inQty ?? 0),
              salesQty: sum((r) => r.salesQty ?? 0),
              closingQty: shaped[shaped.length - 1]?.closingQty ?? 0,
            }
          : {}),
      },
    };
  }

  /** Financial year containing a date, as a from/to pair (1-Apr to 31-Mar). */
  static fyRange(date: string) {
    const y = fyOf(date);
    return { from: `${y}-${String(FY_START_MONTH).padStart(2, '0')}-01`, to: `${y + 1}-${String(FY_START_MONTH - 1).padStart(2, '0')}-31` };
  }
}

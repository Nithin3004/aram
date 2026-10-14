import { Injectable } from '@nestjs/common';
import { businessDate, lowStock } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { LedgerService } from './ledger.service';
import { SettingsService } from './settings.service';

export interface LowStockRow {
  shopId: string;
  itemId: string;
  onHandGrams: number;
  avgDailySoldGrams: number;
  daysLeft: number | null;
}

/** Derived numbers shared by the dashboard, shop views and the app. */
@Injectable()
export class InsightsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private settings: SettingsService,
  ) {}

  /** shopId → itemId → grams sold in the last 7 days (from SOLD ledger entries). */
  async sold7d(shopIds?: string[]) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const rows = await this.prisma.stockLedger.groupBy({
      by: ['shopId', 'itemId'],
      where: { type: 'SOLD', effectiveAt: { gte: since }, ...(shopIds ? { shopId: { in: shopIds } } : {}) },
      _sum: { qtyGrams: true },
    });
    const out = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!out.has(r.shopId)) out.set(r.shopId, new Map());
      out.get(r.shopId)!.set(r.itemId, -(r._sum.qtyGrams ?? 0));
    }
    return out;
  }

  /** Every (shop, item) whose days of cover is below the HO threshold. HO warehouse excluded. */
  async lowStock(shopIds?: string[]): Promise<LowStockRow[]> {
    const { lowStockDays } = await this.settings.get();
    const [bal, sold, shops, items] = await Promise.all([
      this.ledger.balancesByShop(shopIds),
      this.sold7d(shopIds),
      this.prisma.shop.findMany({ where: { type: { not: 'HO' }, isActive: true, ...(shopIds ? { id: { in: shopIds } } : {}) }, select: { id: true } }),
      this.prisma.item.findMany({ where: { isActive: true }, select: { id: true } }),
    ]);
    const activeItems = new Set(items.map((i) => i.id));
    const out: LowStockRow[] = [];
    for (const s of shops) {
      const b = bal.get(s.id) ?? new Map<string, number>();
      const so = sold.get(s.id) ?? new Map<string, number>();
      for (const itemId of new Set([...b.keys(), ...so.keys()])) {
        if (!activeItems.has(itemId)) continue;
        const r = lowStock({ onHandGrams: b.get(itemId) ?? 0, soldInWindowGrams: so.get(itemId) ?? 0, thresholdDays: lowStockDays });
        if (r.low && r.avgDailySoldGrams > 0) {
          out.push({ shopId: s.id, itemId, onHandGrams: b.get(itemId) ?? 0, avgDailySoldGrams: r.avgDailySoldGrams, daysLeft: r.daysLeft });
        }
      }
    }
    return out.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  }

  /** Shops with at least N requests in the last 7 days. */
  async frequentRequesters() {
    const { requestFrequencyPerWeek } = await this.settings.get();
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const rows = await this.prisma.stockRequest.groupBy({
      by: ['shopId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    return rows
      .filter((r) => r._count._all >= requestFrequencyPerWeek)
      .map((r) => ({ shopId: r.shopId, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  /** Map shopId → today's closing (if submitted). */
  async todaysClosings() {
    const today = businessDate();
    const rows = await this.prisma.dailyClosing.findMany({ where: { businessDate: today } });
    return new Map(rows.map((r) => [r.shopId, r]));
  }
}

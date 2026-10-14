import { Injectable } from '@nestjs/common';
import { LedgerType, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma.service';

export interface LedgerEntry {
  shopId: string;
  itemId: string;
  qtyGrams: number;
  type: LedgerType;
  refType: string;
  refId: string;
  effectiveAt?: Date;
  createdById?: string | null;
  note?: string;
}

/**
 * The stock ledger. Every movement is an entry; stock on hand is the sum.
 * Entries are never updated or deleted (enforced by a DB trigger) — corrections
 * are new ADJUSTMENT entries.
 */
@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  async post(tx: Tx, entries: LedgerEntry[]) {
    const rows = entries.filter((e) => e.qtyGrams !== 0);
    if (rows.length) await tx.stockLedger.createMany({ data: rows });
  }

  /** itemId → grams on hand for one shop. */
  async balances(shopId: string, db: Tx | PrismaService = this.prisma, upTo?: Date): Promise<Map<string, number>> {
    const rows = await db.stockLedger.groupBy({
      by: ['itemId'],
      where: { shopId, ...(upTo ? { effectiveAt: { lte: upTo } } : {}) },
      _sum: { qtyGrams: true },
    });
    return new Map(rows.map((r) => [r.itemId, r._sum.qtyGrams ?? 0]));
  }

  /** shopId → itemId → grams, for many shops at once. */
  async balancesByShop(shopIds?: string[]): Promise<Map<string, Map<string, number>>> {
    const rows = await this.prisma.stockLedger.groupBy({
      by: ['shopId', 'itemId'],
      where: shopIds ? { shopId: { in: shopIds } } : undefined,
      _sum: { qtyGrams: true },
    });
    const out = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!out.has(r.shopId)) out.set(r.shopId, new Map());
      out.get(r.shopId)!.set(r.itemId, r._sum.qtyGrams ?? 0);
    }
    return out;
  }

  /** Per item and movement type, the sum within (from, to]. */
  async movements(shopId: string, from: Date | null, to: Date, db: Tx | PrismaService = this.prisma) {
    const where: Prisma.StockLedgerWhereInput = {
      shopId,
      effectiveAt: from ? { gt: from, lte: to } : { lte: to },
    };
    const rows = await db.stockLedger.groupBy({ by: ['itemId', 'type'], where, _sum: { qtyGrams: true } });
    const out = new Map<string, Partial<Record<LedgerType, number>>>();
    for (const r of rows) {
      if (!out.has(r.itemId)) out.set(r.itemId, {});
      out.get(r.itemId)![r.type] = r._sum.qtyGrams ?? 0;
    }
    return out;
  }
}

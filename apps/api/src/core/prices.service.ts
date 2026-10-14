import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma.service';

/** Effective-dated selling prices. Old prices are kept so past sales compute correctly. */
@Injectable()
export class PricesService {
  constructor(private prisma: PrismaService) {}

  /** itemId → price (paise/kg) effective on a business date. */
  async pricesOn(date: string, db: Tx | PrismaService = this.prisma): Promise<Map<string, number>> {
    const rows = await db.itemPrice.findMany({
      where: { effectiveFrom: { lte: date } },
      orderBy: [{ itemId: 'asc' }, { effectiveFrom: 'desc' }],
      distinct: ['itemId'],
    });
    return new Map(rows.map((r) => [r.itemId, r.pricePaisePerKg]));
  }
}

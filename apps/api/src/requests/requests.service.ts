import { Injectable } from '@nestjs/common';
import { CreateRequestInput, formatKg } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, isHo } from '../common/auth-user';
import { badRequest, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { DispatchesService, dispatchRef } from '../dispatches/dispatches.service';
import { LedgerService } from '../core/ledger.service';
import { InsightsService } from '../core/insights.service';

export const requestRef = (n: number) => 'REQ-' + String(n).padStart(4, '0');

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private dispatches: DispatchesService,
    private ledger: LedgerService,
    private insights: InsightsService,
  ) {}

  /** Shops raise requests (possibly drafted offline). Same clientId twice → same request. */
  async create(user: AuthUser, input: CreateRequestInput) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only shops raise requests');
    const existing = await this.prisma.stockRequest.findUnique({ where: { clientId: input.clientId } });
    if (existing) {
      if (existing.shopId !== shopId) throw forbidden();
      return { id: existing.id, ref: requestRef(existing.number), duplicate: true };
    }
    const ids = input.lines.map((l) => l.itemId);
    if (new Set(ids).size !== ids.length) throw badRequest('request.dupItem', 'Each item once per request');
    const items = await this.prisma.item.findMany({ where: { id: { in: ids }, isActive: true } });
    if (items.length !== ids.length) throw badRequest('request.badItem', 'Unknown or inactive item');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const r = await tx.stockRequest.create({
          data: {
            clientId: input.clientId,
            shopId,
            reason: input.reason,
            createdById: user.id,
            lines: { create: input.lines.map((l) => ({ itemId: l.itemId, requestedGrams: l.grams })) },
          },
        });
        await this.audit.log(
          {
            actor: user,
            action: 'REQUEST_CREATE',
            entityType: 'StockRequest',
            entityId: r.id,
            summary: `${requestRef(r.number)} raised · ${input.lines
              .map((l) => `${items.find((i) => i.id === l.itemId)!.nameEn} ${formatKg(l.grams)} kg`)
              .join(', ')}`,
            after: input,
          },
          tx,
        );
        return { id: r.id, ref: requestRef(r.number), duplicate: false };
      });
    } catch (e) {
      // Two syncs racing: the unique clientId wins once; return the stored one.
      const again = await this.prisma.stockRequest.findUnique({ where: { clientId: input.clientId } });
      if (again) return { id: again.id, ref: requestRef(again.number), duplicate: true };
      throw e;
    }
  }

  async list(user: AuthUser, status?: string) {
    const where = { ...(status ? { status: status as never } : {}), ...(isHo(user) ? {} : { shopId: user.shopId! }) };
    const rows = await this.prisma.stockRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { lines: true } });
    const shopIds = [...new Set(rows.map((r) => r.shopId))];
    const [shops, items, bal, sold, freq, dispatches] = await Promise.all([
      this.prisma.shop.findMany({ where: { id: { in: shopIds } } }),
      this.prisma.item.findMany(),
      this.ledger.balancesByShop(shopIds),
      this.insights.sold7d(shopIds),
      this.insights.frequentRequesters(),
      this.prisma.dispatch.findMany({ where: { requestId: { in: rows.map((r) => r.id) } } }),
    ]);
    const freqMap = new Map(freq.map((f) => [f.shopId, f.count]));
    return rows.map((r) => {
      const s = shops.find((x) => x.id === r.shopId)!;
      const b = bal.get(r.shopId) ?? new Map<string, number>();
      const so = sold.get(r.shopId) ?? new Map<string, number>();
      const d = dispatches.find((x) => x.requestId === r.id);
      return {
        id: r.id,
        ref: requestRef(r.number),
        status: r.status,
        approvalType: r.approvalType,
        reason: r.reason,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        decidedAt: r.decidedAt,
        shop: { id: s.id, code: s.code, nameEn: s.nameEn, nameTa: s.nameTa, type: s.type },
        onHandGrams: [...b.values()].reduce((a, x) => a + x, 0),
        avgDailySoldGrams: Math.round([...so.values()].reduce((a, x) => a + x, 0) / 7),
        frequentCount: freqMap.get(r.shopId) ?? null,
        dispatch: d ? { id: d.id, ref: dispatchRef(d.number, d.kind), status: d.status } : null,
        lines: r.lines.map((l) => {
          const it = items.find((i) => i.id === l.itemId)!;
          return {
            itemId: l.itemId,
            nameEn: it.nameEn,
            nameTa: it.nameTa,
            requestedGrams: l.requestedGrams,
            approvedGrams: l.approvedGrams,
            onHandGrams: b.get(l.itemId) ?? 0,
          };
        }),
      };
    });
  }

  /** Approve in full or in part. Approval auto-creates a dispatch from HO. */
  async approve(user: AuthUser, id: string, lines: { itemId: string; approvedGrams: number }[]) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.stockRequest.findUnique({ where: { id }, include: { lines: true } });
      if (!r) throw notFound('Request');
      const byItem = new Map(lines.map((l) => [l.itemId, l.approvedGrams]));
      if (r.lines.some((l) => !byItem.has(l.itemId)) || byItem.size !== r.lines.length) {
        throw badRequest('request.lines', 'Give an approved quantity for every item');
      }
      for (const l of r.lines) {
        if (byItem.get(l.itemId)! > l.requestedGrams) throw badRequest('request.tooMuch', 'Cannot approve more than requested');
      }
      const toSend = r.lines.filter((l) => byItem.get(l.itemId)! > 0);
      if (!toSend.length) throw badRequest('request.nothing', 'Approve at least one item, or reject');
      const full = r.lines.every((l) => byItem.get(l.itemId) === l.requestedGrams);

      const claimed = await tx.stockRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', approvalType: full ? 'FULL' : 'PARTIAL', decidedById: user.id, decidedAt: new Date() },
      });
      if (claimed.count !== 1) throw badRequest('request.decided', 'Already decided');
      for (const l of r.lines) await tx.requestLine.update({ where: { id: l.id }, data: { approvedGrams: byItem.get(l.itemId)! } });

      const d = await this.dispatches.create(
        user,
        { destShopId: r.shopId, lines: toSend.map((l) => ({ itemId: l.itemId, grams: byItem.get(l.itemId)! })) },
        { requestId: r.id, tx },
      );
      await this.audit.log(
        {
          actor: user,
          action: 'REQUEST_APPROVE',
          entityType: 'StockRequest',
          entityId: r.id,
          summary: `Approved ${requestRef(r.number)} ${full ? 'in full' : 'partially'} → ${dispatchRef(d.number, d.kind)}`,
          before: r.lines.map((l) => ({ itemId: l.itemId, requestedGrams: l.requestedGrams })),
          after: lines,
        },
        tx,
      );
      return { ok: true, dispatchId: d.id, dispatchRef: dispatchRef(d.number, d.kind) };
    });
  }

  async reject(user: AuthUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.stockRequest.findUnique({ where: { id } });
      if (!r) throw notFound('Request');
      const claimed = await tx.stockRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'REJECTED', rejectReason: reason, decidedById: user.id, decidedAt: new Date() },
      });
      if (claimed.count !== 1) throw badRequest('request.decided', 'Already decided');
      await this.audit.log(
        { actor: user, action: 'REQUEST_REJECT', entityType: 'StockRequest', entityId: id, summary: `Rejected ${requestRef(r.number)}: ${reason}` },
        tx,
      );
      return { ok: true };
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateIssueInput, formatKg, ResolveIssueInput } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, isHo } from '../common/auth-user';
import { badRequest, forbidden, notFound } from '../common/errors';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../core/ledger.service';
import { dispatchRef } from '../dispatches/dispatches.service';

export const issueRef = (n: number) => 'ISS-' + String(n).padStart(4, '0');

@Injectable()
export class IssuesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private ledger: LedgerService,
  ) {}

  /** Manual issue from a shop (may be raised offline; clientId de-duplicates). */
  async create(user: AuthUser, input: CreateIssueInput) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only shops raise issues');
    const existing = await this.prisma.issue.findUnique({ where: { clientId: input.clientId } });
    if (existing) {
      if (existing.shopId !== shopId) throw forbidden();
      return { id: existing.id, ref: issueRef(existing.number), duplicate: true };
    }
    if (input.dispatchId) {
      const d = await this.prisma.dispatch.findUnique({ where: { id: input.dispatchId } });
      if (!d || (d.sourceShopId !== shopId && d.destShopId !== shopId)) throw badRequest('issue.badDispatch', 'Not your delivery');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const i = await tx.issue.create({
          data: {
            clientId: input.clientId,
            shopId,
            source: 'SHOP',
            type: input.type as never,
            description: input.description,
            dispatchId: input.dispatchId,
            raisedById: user.id,
          },
        });
        await this.audit.log(
          { actor: user, action: 'ISSUE_CREATE', entityType: 'Issue', entityId: i.id, summary: `${issueRef(i.number)} raised: ${input.description}`, after: input },
          tx,
        );
        return { id: i.id, ref: issueRef(i.number), duplicate: false };
      });
    } catch (e) {
      const again = await this.prisma.issue.findUnique({ where: { clientId: input.clientId } });
      if (again) return { id: again.id, ref: issueRef(again.number), duplicate: true };
      throw e;
    }
  }

  async list(user: AuthUser, status?: string) {
    const where = { ...(status ? { status: status as never } : {}), ...(isHo(user) ? {} : { shopId: user.shopId! }) };
    const rows = await this.prisma.issue.findMany({ where, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 });
    const shops = await this.prisma.shop.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.shopId))] } } });
    const dispatches = await this.prisma.dispatch.findMany({ where: { id: { in: rows.map((r) => r.dispatchId).filter((x): x is string => !!x) } } });
    return rows.map((i) => {
      const s = shops.find((x) => x.id === i.shopId)!;
      const d = dispatches.find((x) => x.id === i.dispatchId);
      return {
        id: i.id,
        ref: issueRef(i.number),
        source: i.source,
        type: i.type,
        status: i.status,
        description: i.description,
        createdAt: i.createdAt,
        shop: { id: s.id, code: s.code, nameEn: s.nameEn, nameTa: s.nameTa, type: s.type },
        dispatch: d ? { id: d.id, ref: dispatchRef(d.number, d.kind), destShopId: d.destShopId } : null,
        recountRequestedAt: i.recountRequestedAt,
        recount: i.recount,
        recountAt: i.recountAt,
        resolutionNote: i.resolutionNote,
        resolvedAt: i.resolvedAt,
      };
    });
  }

  /** HO only. Note required; optional stock corrections go to the ledger as ADJUSTMENT entries. */
  async resolve(user: AuthUser, id: string, input: ResolveIssueInput) {
    return this.prisma.$transaction(async (tx) => {
      const i = await tx.issue.findUnique({ where: { id } });
      if (!i) throw notFound('Issue');
      const now = new Date();
      const claimed = await tx.issue.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'RESOLVED', resolutionNote: input.note, resolvedById: user.id, resolvedAt: now },
      });
      if (claimed.count !== 1) throw badRequest('issue.resolved', 'Already resolved');

      if (input.adjustments.length) {
        const shops = await tx.shop.findMany({ where: { id: { in: input.adjustments.map((a) => a.shopId) } } });
        if (shops.length !== new Set(input.adjustments.map((a) => a.shopId)).size) throw badRequest('issue.badShop', 'Unknown shop');
        await this.ledger.post(
          tx,
          input.adjustments.map((a) => ({
            shopId: a.shopId,
            itemId: a.itemId,
            qtyGrams: a.grams,
            type: 'ADJUSTMENT' as const,
            refType: 'Issue',
            refId: id,
            effectiveAt: now,
            createdById: user.id,
            note: input.note,
          })),
        );
      }
      if (i.dispatchId && i.type === 'DISPATCH_DISCREPANCY') {
        await tx.dispatch.update({ where: { id: i.dispatchId }, data: { status: 'RESOLVED', resolvedAt: now } });
      }
      await this.audit.log(
        {
          actor: user,
          action: 'ISSUE_RESOLVE',
          entityType: 'Issue',
          entityId: id,
          summary: `Resolved ${issueRef(i.number)} — ${input.note}${
            input.adjustments.length ? ` (adjustments: ${input.adjustments.map((a) => `${a.grams > 0 ? '+' : ''}${formatKg(a.grams)} kg`).join(', ')})` : ''
          }`,
          before: { status: i.status },
          after: input,
        },
        tx,
      );
      return { ok: true };
    });
  }

  /** HO asks the receiving shop to recount a mismatched delivery. */
  async requestRecount(user: AuthUser, id: string) {
    const i = await this.prisma.issue.findUnique({ where: { id } });
    if (!i) throw notFound('Issue');
    if (i.status !== 'OPEN' || i.type !== 'DISPATCH_DISCREPANCY') throw badRequest('issue.noRecount', 'Only open delivery mismatches can be recounted');
    await this.prisma.$transaction(async (tx) => {
      await tx.issue.update({ where: { id }, data: { recountRequestedAt: new Date(), recountRequestedBy: user.id, recount: Prisma.DbNull, recountAt: null } });
      await this.audit.log(
        { actor: user, action: 'ISSUE_RECOUNT_ASK', entityType: 'Issue', entityId: id, summary: `Asked shop to recount for ${issueRef(i.number)}` },
        tx,
      );
    });
    return { ok: true };
  }

  /** The receiving shop reports its recount. Informational — HO decides and posts any adjustment. */
  async submitRecount(user: AuthUser, id: string, input: { lines: { itemId: string; receivedGrams: number }[]; note: string }) {
    const i = await this.prisma.issue.findUnique({ where: { id } });
    if (!i) throw notFound('Issue');
    if (i.shopId !== user.shopId) throw forbidden();
    if (i.status !== 'OPEN' || !i.recountRequestedAt) throw badRequest('issue.noRecount', 'No recount was requested');
    await this.prisma.$transaction(async (tx) => {
      await tx.issue.update({ where: { id }, data: { recount: input, recountAt: new Date() } });
      await this.audit.log(
        {
          actor: user,
          action: 'ISSUE_RECOUNT',
          entityType: 'Issue',
          entityId: id,
          summary: `Shop recounted ${issueRef(i.number)}: ${input.lines.map((l) => formatKg(l.receivedGrams) + ' kg').join(', ')}${input.note ? ' — ' + input.note : ''}`,
          after: input,
        },
        tx,
      );
    });
    return { ok: true };
  }
}

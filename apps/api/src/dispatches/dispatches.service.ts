import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { CreateDispatchInput, formatKg, matchCheck } from '@aram/shared';
import { PrismaService, Tx } from '../prisma.service';
import { AuthUser, hasPermission, isHo } from '../common/auth-user';
import { AppError, badRequest, forbidden, notFound } from '../common/errors';
import { LedgerService } from '../core/ledger.service';
import { AuditService, SYSTEM } from '../audit/audit.service';

const CODE_WINDOW_MS = 15 * 60 * 1000;
const CODE_MAX_WRONG = 5;

export const dispatchRef = (n: number, kind: string) => (kind === 'TRANSFER' ? 'TRF-' : 'DSP-') + String(n).padStart(4, '0');

@Injectable()
export class DispatchesService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private audit: AuditService,
  ) {}

  /** HO creates a dispatch (from HO) or orders a transfer (from a supervisor shop). Online only. */
  async create(user: AuthUser, input: CreateDispatchInput, opts: { requestId?: string; tx?: Tx } = {}) {
    const run = async (tx: Tx) => {
      const ho = await tx.shop.findFirstOrThrow({ where: { type: 'HO' } });
      const sourceId = input.sourceShopId ?? ho.id;
      const [source, dest] = await Promise.all([
        tx.shop.findUnique({ where: { id: sourceId } }),
        tx.shop.findUnique({ where: { id: input.destShopId } }),
      ]);
      if (!source || !dest) throw notFound('Shop');
      if (!dest.isActive || dest.type === 'HO') throw badRequest('dispatch.badDest', 'Destination must be an active supervisor or small shop');
      if (source.type === 'SMALL') throw badRequest('dispatch.badSource', 'Small shops do not warehouse stock');
      if (source.id === dest.id) throw badRequest('dispatch.sameShop', 'Source and destination are the same');

      const itemIds = input.lines.map((l) => l.itemId);
      if (new Set(itemIds).size !== itemIds.length) throw badRequest('dispatch.dupItem', 'Each item once per dispatch');
      const items = await tx.item.findMany({ where: { id: { in: itemIds }, isActive: true } });
      if (items.length !== itemIds.length) throw badRequest('dispatch.badItem', 'Unknown or inactive item');

      // Source must hold enough (net of stock already committed to its other unsent dispatches).
      const bal = await this.ledger.balances(source.id, tx);
      const committed = await tx.dispatchLine.groupBy({
        by: ['itemId'],
        where: { dispatch: { sourceShopId: source.id, status: 'CREATED' }, itemId: { in: itemIds } },
        _sum: { orderedGrams: true },
      });
      const comm = new Map(committed.map((c) => [c.itemId, c._sum.orderedGrams ?? 0]));
      for (const l of input.lines) {
        const free = (bal.get(l.itemId) ?? 0) - (comm.get(l.itemId) ?? 0);
        if (l.grams > free) {
          const it = items.find((i) => i.id === l.itemId)!;
          throw badRequest('dispatch.insufficient', `${source.code} has only ${formatKg(Math.max(0, free))} kg ${it.nameEn} free`, {
            item: it.nameEn,
            kg: formatKg(Math.max(0, free)),
          });
        }
      }

      const kind = source.type === 'HO' ? 'DISPATCH' : 'TRANSFER';
      const d = await tx.dispatch.create({
        data: {
          kind,
          sourceShopId: source.id,
          destShopId: dest.id,
          deliveryCode: await this.freshCode(tx),
          createdById: user.id,
          requestId: opts.requestId,
          lines: { create: input.lines.map((l) => ({ itemId: l.itemId, orderedGrams: l.grams })) },
        },
      });
      const ref = dispatchRef(d.number, kind);
      await this.audit.log(
        {
          actor: user,
          action: kind === 'TRANSFER' ? 'TRANSFER_ORDER' : 'DISPATCH_CREATE',
          entityType: 'Dispatch',
          entityId: d.id,
          summary: `${kind === 'TRANSFER' ? 'Ordered transfer' : 'Created dispatch'} ${ref} · ${source.code} → ${dest.code} · ${input.lines
            .map((l) => `${items.find((i) => i.id === l.itemId)!.nameEn} ${formatKg(l.grams)} kg`)
            .join(', ')}`,
          after: input,
        },
        tx,
      );
      return d;
    };
    return opts.tx ? run(opts.tx) : this.prisma.$transaction(run);
  }

  /** A 6-digit code not in use by any open (unreceived) dispatch. */
  private async freshCode(tx: Tx): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const clash = await tx.dispatch.findFirst({ where: { deliveryCode: code, status: { in: ['CREATED', 'DISPATCHED'] } } });
      if (!clash) return code;
    }
    throw new Error('Could not allocate a delivery code');
  }

  /** Sender confirms what was actually sent. HO for HO-sourced; the supervisor shop for transfers (cannot refuse). */
  async markDispatched(user: AuthUser, id: string, lines: { itemId: string; sentGrams: number }[]) {
    return this.prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.findUnique({ where: { id }, include: { lines: true } });
      if (!d) throw notFound('Dispatch');
      const source = await tx.shop.findUniqueOrThrow({ where: { id: d.sourceShopId } });
      const allowed = source.type === 'HO' ? hasPermission(user, 'CREATE_DISPATCH') : user.shopId === source.id;
      if (!allowed) throw forbidden();
      if (d.status !== 'CREATED') throw badRequest('dispatch.state', 'Already dispatched');

      const byItem = new Map(lines.map((l) => [l.itemId, l.sentGrams]));
      if (byItem.size !== d.lines.length || d.lines.some((l) => !byItem.has(l.itemId))) {
        throw badRequest('dispatch.lines', 'Give the sent quantity for every item');
      }
      const bal = await this.ledger.balances(source.id, tx);
      for (const l of d.lines) {
        if (byItem.get(l.itemId)! > (bal.get(l.itemId) ?? 0)) throw badRequest('dispatch.insufficient', 'Cannot send more than is in stock');
      }
      const now = new Date();
      const claimed = await tx.dispatch.updateMany({
        where: { id, status: 'CREATED' },
        data: { status: 'DISPATCHED', dispatchedAt: now, dispatchedById: user.id },
      });
      if (claimed.count !== 1) throw badRequest('dispatch.state', 'Already dispatched');
      for (const l of d.lines) await tx.dispatchLine.update({ where: { id: l.id }, data: { sentGrams: byItem.get(l.itemId)! } });
      await this.ledger.post(
        tx,
        d.lines.map((l) => ({
          shopId: source.id,
          itemId: l.itemId,
          qtyGrams: -byItem.get(l.itemId)!,
          type: 'DISPATCH_OUT' as const,
          refType: 'Dispatch',
          refId: d.id,
          effectiveAt: now,
          createdById: user.id,
        })),
      );
      const ref = dispatchRef(d.number, d.kind);
      await this.audit.log(
        {
          actor: user,
          action: 'DISPATCH_SENT',
          entityType: 'Dispatch',
          entityId: d.id,
          summary: `${ref} marked dispatched (${formatKg(lines.reduce((s, l) => s + l.sentGrams, 0))} kg)`,
          before: d.lines.map((l) => ({ itemId: l.itemId, orderedGrams: l.orderedGrams })),
          after: lines,
        },
        tx,
      );
      return { ok: true };
    });
  }

  /** Throws unless the shop has attempts left; records a wrong code. */
  private async checkCode(shopId: string, code: string) {
    const since = new Date(Date.now() - CODE_WINDOW_MS);
    const wrong = await this.prisma.codeAttempt.count({ where: { shopId, createdAt: { gte: since } } });
    if (wrong >= CODE_MAX_WRONG) throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'receive.tooMany', 'Too many wrong codes');
    const d = await this.prisma.dispatch.findFirst({
      where: { destShopId: shopId, deliveryCode: code, status: 'DISPATCHED' },
      include: { lines: true },
    });
    if (!d) {
      await this.prisma.codeAttempt.create({ data: { shopId } });
      await this.audit.log({
        actor: SYSTEM,
        action: 'RECEIVE_CODE_WRONG',
        entityType: 'Shop',
        entityId: shopId,
        summary: `Wrong delivery code entered (${wrong + 1}/${CODE_MAX_WRONG})`,
      });
      throw badRequest('receive.codeWrong', 'Code does not match any delivery for this shop');
    }
    return d;
  }

  /** Receiver enters/scans the code; returns what was sent so they can weigh it. */
  async lookup(user: AuthUser, code: string) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only the receiving shop can receive');
    const d = await this.checkCode(shopId, code);
    return this.view(d.id, user);
  }

  /**
   * Receive: valid code + actual qty per item + photo. Stock moves in at the received
   * quantity immediately; the match check decides MATCHED vs DISCREPANCY (auto issue).
   */
  async receive(user: AuthUser, id: string, input: { code: string; lines: { itemId: string; receivedGrams: number }[]; photoKey: string }) {
    const shopId = user.shopId;
    if (!shopId) throw forbidden('Only the receiving shop can receive');
    const found = await this.checkCode(shopId, input.code);
    if (found.id !== id) throw badRequest('receive.codeWrong', 'Code does not match this delivery');
    if (!input.photoKey.startsWith(`receipts/${shopId}/`)) throw badRequest('receive.photo', 'Photo required');

    return this.prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      const got = new Map(input.lines.map((l) => [l.itemId, l.receivedGrams]));
      if (got.size !== d.lines.length || d.lines.some((l) => !got.has(l.itemId))) {
        throw badRequest('receive.lines', 'Enter the received quantity for every item');
      }
      const now = new Date();
      // Claim the one-time code atomically so a double submit cannot receive twice.
      const claimed = await tx.dispatch.updateMany({
        where: { id, status: 'DISPATCHED', codeUsedAt: null },
        data: { status: 'RECEIVED', codeUsedAt: now },
      });
      if (claimed.count !== 1) throw badRequest('receive.already', 'Already received');
      for (const l of d.lines) await tx.dispatchLine.update({ where: { id: l.id }, data: { receivedGrams: got.get(l.itemId)! } });

      const result = matchCheck(
        d.lines.map((l) => ({ itemId: l.itemId, orderedGrams: l.orderedGrams, sentGrams: l.sentGrams ?? 0, receivedGrams: got.get(l.itemId)! })),
      );
      await tx.dispatch.update({
        where: { id },
        data: {
          status: result.matched ? 'MATCHED' : 'DISCREPANCY',
          receivedAt: now,
          receivedById: user.id,
          photoKey: input.photoKey,
        },
      });
      await this.ledger.post(
        tx,
        d.lines.map((l) => ({
          shopId,
          itemId: l.itemId,
          qtyGrams: got.get(l.itemId)!,
          type: 'RECEIVE_IN' as const,
          refType: 'Dispatch',
          refId: d.id,
          effectiveAt: now,
          createdById: user.id,
        })),
      );

      const ref = dispatchRef(d.number, d.kind);
      const items = await tx.item.findMany({ where: { id: { in: d.lines.map((l) => l.itemId) } } });
      const name = (itemId: string) => items.find((i) => i.id === itemId)?.nameEn ?? itemId;
      await this.audit.log(
        {
          actor: user,
          action: 'DISPATCH_RECEIVE',
          entityType: 'Dispatch',
          entityId: d.id,
          summary: `${ref} received — ${result.matched ? 'matched' : `${result.mismatchedLines.length} item(s) mismatched`}`,
          after: { lines: input.lines, photoKey: input.photoKey },
        },
        tx,
      );

      if (!result.matched) {
        const desc = result.mismatchedLines
          .map((l) => `${name(l.itemId)}: ordered ${formatKg(l.orderedGrams)}, sent ${formatKg(l.sentGrams)}, received ${formatKg(l.receivedGrams)} kg`)
          .join('; ');
        const issue = await tx.issue.create({
          data: {
            clientId: `auto:dispatch:${d.id}`,
            shopId,
            source: 'AUTO',
            type: 'DISPATCH_DISCREPANCY',
            description: `${ref} — ${desc}`,
            dispatchId: d.id,
          },
        });
        await this.audit.log(
          { actor: SYSTEM, action: 'ISSUE_AUTO', entityType: 'Issue', entityId: issue.id, summary: `Discrepancy raised on ${ref}: ${desc}` },
          tx,
        );
      }
      return { status: result.matched ? 'MATCHED' : 'DISCREPANCY', lines: result.lines };
    });
  }

  async list(user: AuthUser, status?: string) {
    const where = {
      ...(status ? { status: status as never } : {}),
      ...(isHo(user) ? {} : { OR: [{ sourceShopId: user.shopId! }, { destShopId: user.shopId! }] }),
    };
    const rows = await this.prisma.dispatch.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { lines: true } });
    const shops = await this.shopNames(rows.flatMap((r) => [r.sourceShopId, r.destShopId]));
    const counts = await this.prisma.dispatch.groupBy({
      by: ['status'],
      where: isHo(user) ? {} : { OR: [{ sourceShopId: user.shopId! }, { destShopId: user.shopId! }] },
      _count: { _all: true },
    });
    return {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      rows: rows.map((d) => ({
        id: d.id,
        ref: dispatchRef(d.number, d.kind),
        kind: d.kind,
        status: d.status,
        source: shops.get(d.sourceShopId),
        dest: shops.get(d.destShopId),
        totalGrams: d.lines.reduce((s, l) => s + l.orderedGrams, 0),
        lineCount: d.lines.length,
        createdAt: d.createdAt,
        updatedAt: d.receivedAt ?? d.dispatchedAt ?? d.createdAt,
      })),
    };
  }

  private async shopNames(ids: string[]) {
    const shops = await this.prisma.shop.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(shops.map((s) => [s.id, { id: s.id, code: s.code, nameEn: s.nameEn, nameTa: s.nameTa, type: s.type }]));
  }

  /** Full view. The delivery code is only shown to HO and to the sender (it goes on the slip). */
  async view(id: string, user: AuthUser) {
    const d = await this.prisma.dispatch.findUnique({ where: { id }, include: { lines: true } });
    if (!d) throw notFound('Dispatch');
    const ho = isHo(user);
    const isSender = user.shopId === d.sourceShopId;
    const isReceiver = user.shopId === d.destShopId;
    if (!ho && !isSender && !isReceiver) throw forbidden();

    const [shops, items, issue, users, req] = await Promise.all([
      this.shopNames([d.sourceShopId, d.destShopId]),
      this.prisma.item.findMany({ where: { id: { in: d.lines.map((l) => l.itemId) } } }),
      this.prisma.issue.findFirst({ where: { dispatchId: d.id, type: 'DISPATCH_DISCREPANCY' } }),
      this.prisma.user.findMany({
        where: { id: { in: [d.createdById, d.dispatchedById, d.receivedById].filter((x): x is string => !!x) } },
        select: { id: true, name: true },
      }),
      d.requestId ? this.prisma.stockRequest.findUnique({ where: { id: d.requestId } }) : null,
    ]);
    const uname = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? null;
    const showCode = ho || isSender;
    // Receivers see what was sent (as in the design); ordered qty is HO/sender detail.
    return {
      id: d.id,
      ref: dispatchRef(d.number, d.kind),
      kind: d.kind,
      status: d.status,
      source: shops.get(d.sourceShopId),
      dest: shops.get(d.destShopId),
      deliveryCode: showCode ? d.deliveryCode : undefined,
      request: req && { id: req.id, ref: 'REQ-' + String(req.number).padStart(4, '0') },
      createdAt: d.createdAt,
      createdBy: uname(d.createdById),
      dispatchedAt: d.dispatchedAt,
      dispatchedBy: uname(d.dispatchedById),
      receivedAt: d.receivedAt,
      receivedBy: uname(d.receivedById),
      resolvedAt: d.resolvedAt,
      hasPhoto: !!d.photoKey,
      lines: d.lines.map((l) => {
        const it = items.find((i) => i.id === l.itemId)!;
        return {
          itemId: l.itemId,
          nameEn: it.nameEn,
          nameTa: it.nameTa,
          orderedGrams: ho || isSender ? l.orderedGrams : undefined,
          sentGrams: l.sentGrams,
          receivedGrams: ho || isReceiver ? l.receivedGrams : undefined,
        };
      }),
      issue: issue && {
        id: issue.id,
        ref: 'ISS-' + String(issue.number).padStart(4, '0'),
        status: issue.status,
        description: issue.description,
        recountRequestedAt: issue.recountRequestedAt,
        recount: issue.recount,
        recountAt: issue.recountAt,
        resolutionNote: issue.resolutionNote,
        resolvedAt: issue.resolvedAt,
      },
    };
  }

  async photoKeyFor(id: string, user: AuthUser) {
    const d = await this.prisma.dispatch.findUnique({ where: { id } });
    if (!d || !d.photoKey) throw notFound('Photo');
    if (!isHo(user) && user.shopId !== d.destShopId) throw forbidden();
    return d.photoKey;
  }
}

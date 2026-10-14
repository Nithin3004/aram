import { Controller, Get, Header } from '@nestjs/common';
import { businessDate, formatIstTime, formatKg, istTimeOn } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { Roles } from '../common/auth-user';
import { LedgerService } from '../core/ledger.service';
import { InsightsService } from '../core/insights.service';
import { SettingsService } from '../core/settings.service';
import { dispatchRef } from '../dispatches/dispatches.service';

@Controller('dashboard')
@Roles('SUPER_ADMIN', 'ADMIN')
export class DashboardController {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private insights: InsightsService,
    private settings: SettingsService,
  ) {}

  /** Cheap counts for the header and sidebar badges. */
  @Get('nav')
  async nav() {
    const [types, discrepancies, requests, issues] = await Promise.all([
      this.prisma.shop.groupBy({ by: ['type'], where: { isActive: true }, _count: { _all: true } }),
      this.prisma.dispatch.count({ where: { status: 'DISCREPANCY' } }),
      this.prisma.stockRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.issue.count({ where: { status: 'OPEN' } }),
    ]);
    const n = (t: string) => types.find((x) => x.type === t)?._count._all ?? 0;
    return {
      shops: n('HO') + n('SUPERVISOR') + n('SMALL'),
      supervisors: n('SUPERVISOR'),
      small: n('SMALL'),
      dispatches: discrepancies,
      requests,
      issues,
    };
  }

  @Get('overview')
  async overview() {
    const today = businessDate();
    const [shops, bal, closings, low, freq, st, pipeline, discrepancies, pendingReq, openIssues] = await Promise.all([
      this.prisma.shop.findMany({ where: { isActive: true } }),
      this.ledger.balancesByShop(),
      this.prisma.dailyClosing.findMany({ where: { businessDate: today } }),
      this.insights.lowStock(),
      this.insights.frequentRequesters(),
      this.settings.get(),
      this.prisma.dispatch.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.dispatch.findMany({ where: { status: 'DISCREPANCY' }, include: { lines: true }, orderBy: { receivedAt: 'desc' } }),
      this.prisma.stockRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.issue.findMany({ where: { status: 'OPEN' } }),
    ]);
    const byId = new Map(shops.map((s) => [s.id, s]));
    const items = await this.prisma.item.findMany();
    const itemById = new Map(items.map((i) => [i.id, i]));

    const sumShop = (id: string) => [...(bal.get(id)?.values() ?? [])].reduce((a, b) => a + b, 0);
    const stock = { ho: 0, supervisors: 0, small: 0 };
    for (const s of shops) {
      const g = sumShop(s.id);
      if (s.type === 'HO') stock.ho += g;
      else if (s.type === 'SUPERVISOR') stock.supervisors += g;
      else stock.small += g;
    }

    const expected = closings.reduce((a, c) => a + c.expectedRevenuePaise, 0);
    const cash = closings.reduce((a, c) => a + c.cashPaise, 0);
    const upi = closings.reduce((a, c) => a + c.upiPaise, 0);
    const gaps = closings.filter((c) => c.varianceFlagged);
    const sellingShops = shops.filter((s) => s.type !== 'HO');
    const closedIds = new Set(closings.map((c) => c.shopId));
    const notClosed = sellingShops.filter((s) => !closedIds.has(s.id));
    const due = istTimeOn(today, st.closingDueTime);

    const shopRef = (id: string) => {
      const s = byId.get(id);
      return s ? { id: s.id, code: s.code, nameEn: s.nameEn, nameTa: s.nameTa } : null;
    };

    // "Needs attention now" — worst first.
    const attention: Array<Record<string, unknown>> = [];
    for (const c of [...gaps].sort((a, b) => Math.abs(b.variancePaise) - Math.abs(a.variancePaise)).slice(0, 3)) {
      attention.push({ tag: 'CASH_GAP', tone: 'danger', shop: shopRef(c.shopId), variancePaise: c.variancePaise, link: 'issues' });
    }
    for (const d of discrepancies.slice(0, 3)) {
      const diff = d.lines.reduce((a, l) => a + ((l.receivedGrams ?? 0) - l.orderedGrams), 0);
      attention.push({ tag: 'MISMATCH', tone: 'danger', ref: dispatchRef(d.number, d.kind), dispatchId: d.id, diffGrams: diff, lines: d.lines.filter((l) => l.receivedGrams !== l.orderedGrams || l.sentGrams !== l.orderedGrams).length, link: 'dispatches' });
    }
    if (notClosed.length && Date.now() > due.getTime() - 2 * 3600 * 1000) {
      attention.push({ tag: 'NO_CLOSING', tone: 'warn', count: notClosed.length, time: formatIstTime(new Date()), link: 'shops' });
    }
    if (low.length) attention.push({ tag: 'LOW_STOCK', tone: 'warn', count: low.length, shops: new Set(low.map((l) => l.shopId)).size, days: st.lowStockDays, link: 'shops' });
    if (pendingReq) attention.push({ tag: 'REQUEST', tone: 'neutral', count: pendingReq, link: 'requests' });
    if (freq.length) attention.push({ tag: 'FREQUENT', tone: 'neutral', count: freq.length, link: 'requests' });
    const otherIssues = openIssues.filter((i) => i.type !== 'CASH_VARIANCE' && i.type !== 'DISPATCH_DISCREPANCY').length;
    if (otherIssues) attention.push({ tag: 'ISSUE', tone: 'neutral', count: otherIssues, link: 'issues' });

    const pipe = Object.fromEntries(pipeline.map((p) => [p.status, p._count._all]));

    return {
      now: new Date(),
      businessDate: today,
      counts: {
        shops: shops.length,
        supervisors: shops.filter((s) => s.type === 'SUPERVISOR').length,
        small: shops.filter((s) => s.type === 'SMALL').length,
      },
      stock: { totalGrams: stock.ho + stock.supervisors + stock.small, ...stock },
      sales: { expectedPaise: expected, cashPaise: cash, upiPaise: upi, collectedPaise: cash + upi },
      gaps: {
        totalPaise: gaps.reduce((a, c) => a + c.variancePaise, 0),
        shops: gaps.length,
        over1000: gaps.filter((c) => Math.abs(c.variancePaise) > 100000).length,
      },
      closings: {
        submitted: closings.length,
        expected: sellingShops.length,
        open: notClosed.length,
        dueTime: st.closingDueTime,
        overdue: Date.now() > due.getTime(),
      },
      attention,
      pipeline: pipe,
      pendingRequests: pendingReq,
      openIssues: openIssues.length,
      lowStock: low.slice(0, 50).map((l) => {
        const s = byId.get(l.shopId)!;
        const it = itemById.get(l.itemId)!;
        const parent = s.parentId ? byId.get(s.parentId) : null;
        return {
          shop: shopRef(s.id),
          parent: parent ? { code: parent.code, nameEn: parent.nameEn, nameTa: parent.nameTa } : null,
          item: { id: it.id, nameEn: it.nameEn, nameTa: it.nameTa },
          onHandGrams: l.onHandGrams,
          daysLeft: l.daysLeft,
        };
      }),
      lowStockCount: low.length,
      frequent: freq.slice(0, 10).map((f) => ({ shop: shopRef(f.shopId), count: f.count })),
      nav: {
        dispatches: (pipe.DISCREPANCY ?? 0),
        requests: pendingReq,
        issues: openIssues.length,
      },
    };
  }

  /** Day sheet: every shop's closing for today as CSV (English headings; opens in Excel). */
  @Get('day-sheet.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async daySheet() {
    const today = businessDate();
    const [shops, closings] = await Promise.all([
      this.prisma.shop.findMany({ where: { type: { not: 'HO' } }, orderBy: { code: 'asc' } }),
      this.prisma.dailyClosing.findMany({ where: { businessDate: today }, include: { lines: true } }),
    ]);
    const byShop = new Map(closings.map((c) => [c.shopId, c]));
    const rs = (p: number) => (p / 100).toFixed(2);
    const rows = [['Date', 'Shop code', 'Shop', 'Shop (Tamil)', 'Type', 'Closed', 'Sold kg', 'Expected ₹', 'Cash ₹', 'UPI ₹', 'Gap ₹', 'Flagged']];
    for (const s of shops) {
      const c = byShop.get(s.id);
      const sold = c ? c.lines.reduce((a, l) => a + l.soldGrams, 0) : 0;
      rows.push([
        today,
        s.code,
        s.nameEn,
        s.nameTa,
        s.type,
        c ? 'yes' : 'no',
        c ? formatKg(sold).replace(/,/g, '') : '',
        c ? rs(c.expectedRevenuePaise) : '',
        c ? rs(c.cashPaise) : '',
        c ? rs(c.upiPaise) : '',
        c ? rs(c.variancePaise) : '',
        c?.varianceFlagged ? 'yes' : '',
      ]);
    }
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    // BOM so Excel reads Tamil correctly.
    return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }
}

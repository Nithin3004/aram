import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { addDays, businessDate, istDayStart } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuditService, SYSTEM } from '../audit/audit.service';

/**
 * Raises an AUTO issue when a shop has submitted no closing for the last two
 * business days (as in the design: "No closing submitted for 2 days").
 * One issue per shop per missed run of days (deterministic clientId).
 */
@Injectable()
export class MissingClosingJob implements OnApplicationBootstrap, OnModuleDestroy {
  private log = new Logger('MissingClosing');
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 10 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    try {
      const today = businessDate();
      const d1 = addDays(today, -1);
      const d2 = addDays(today, -2);
      const shops = await this.prisma.shop.findMany({
        where: { type: { not: 'HO' }, isActive: true, createdAt: { lt: istDayStart(d2) } },
        select: { id: true, code: true },
      });
      const closed = await this.prisma.dailyClosing.findMany({
        where: { businessDate: { in: [d1, d2] } },
        select: { shopId: true },
      });
      const closedSet = new Set(closed.map((c) => c.shopId));
      let raised = 0;
      for (const s of shops) {
        if (closedSet.has(s.id)) continue;
        const clientId = `auto:missing:${s.id}:${d1}`;
        const exists = await this.prisma.issue.findUnique({ where: { clientId } });
        if (exists) continue;
        // Don't pile up: skip if an open missing-closing issue already exists for this shop.
        const open = await this.prisma.issue.findFirst({ where: { shopId: s.id, type: 'MISSING_CLOSING', status: 'OPEN' } });
        if (open) continue;
        const iss = await this.prisma.issue.create({
          data: {
            clientId,
            shopId: s.id,
            source: 'AUTO',
            type: 'MISSING_CLOSING',
            description: `${s.code}: no daily closing submitted for ${d2} and ${d1}`,
          },
        });
        await this.audit.log({ actor: SYSTEM, action: 'ISSUE_AUTO', entityType: 'Issue', entityId: iss.id, summary: iss.description });
        raised++;
      }
      if (raised) this.log.log(`Raised ${raised} missing-closing issue(s)`);
    } catch (e) {
      this.log.error((e as Error).message);
    }
  }
}

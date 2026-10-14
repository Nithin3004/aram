import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { formatKg, formatRupees, istTimeOn, lineValuePaise, purchaseSchema, updateVendorSchema, vendorSchema } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuthUser, CurrentUser, RequirePermission, Roles } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { badRequest, notFound } from '../common/errors';
import { LedgerService } from '../core/ledger.service';
import { AuditService } from '../audit/audit.service';

@Controller()
@Roles('SUPER_ADMIN', 'ADMIN')
export class VendorsController {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private audit: AuditService,
  ) {}

  @Get('vendors')
  async list() {
    const monthStart = new Date().toISOString().slice(0, 8) + '01';
    const [vendors, purchases] = await Promise.all([
      this.prisma.vendor.findMany({ orderBy: { nameEn: 'asc' } }),
      this.prisma.purchase.findMany({ where: { date: { gte: monthStart } } }),
    ]);
    return vendors.map((v) => ({
      ...v,
      monthPaise: purchases.filter((p) => p.vendorId === v.id).reduce((s, p) => s + lineValuePaise(p.qtyGrams, p.costPaisePerKg), 0),
    }));
  }

  @Post('vendors')
  @RequirePermission('MANAGE_VENDORS')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(vendorSchema)) body: z.infer<typeof vendorSchema>) {
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.create({ data: body });
      await this.audit.log({ actor: user, action: 'VENDOR_CREATE', entityType: 'Vendor', entityId: v.id, summary: `Added vendor ${v.nameEn}`, after: body }, tx);
      return v;
    });
  }

  @Patch('vendors/:id')
  @RequirePermission('MANAGE_VENDORS')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodPipe(updateVendorSchema)) body: z.infer<typeof updateVendorSchema>) {
    const before = await this.prisma.vendor.findUnique({ where: { id } });
    if (!before) throw notFound('Vendor');
    return this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.update({ where: { id }, data: body });
      const what = body.isActive === false ? 'Deactivated' : body.isActive === true && !before.isActive ? 'Reactivated' : 'Updated';
      await this.audit.log({ actor: user, action: 'VENDOR_UPDATE', entityType: 'Vendor', entityId: id, summary: `${what} vendor ${v.nameEn}`, before, after: v }, tx);
      return v;
    });
  }

  @Get('purchases')
  async purchases() {
    const rows = await this.prisma.purchase.findMany({ orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 100, include: { vendor: true } });
    const items = await this.prisma.item.findMany();
    const byId = new Map(items.map((i) => [i.id, i]));
    return rows.map((p) => ({
      id: p.id,
      date: p.date,
      invoiceNo: p.invoiceNo,
      vendor: { id: p.vendor.id, nameEn: p.vendor.nameEn, nameTa: p.vendor.nameTa },
      item: { id: p.itemId, nameEn: byId.get(p.itemId)?.nameEn, nameTa: byId.get(p.itemId)?.nameTa },
      qtyGrams: p.qtyGrams,
      costPaisePerKg: p.costPaisePerKg,
      totalPaise: lineValuePaise(p.qtyGrams, p.costPaisePerKg),
    }));
  }

  /** Recording a purchase adds stock to the HO warehouse via a PURCHASE ledger entry. */
  @Post('purchases')
  @RequirePermission('MANAGE_VENDORS')
  async record(@CurrentUser() user: AuthUser, @Body(new ZodPipe(purchaseSchema)) body: z.infer<typeof purchaseSchema>) {
    const [vendor, item, ho] = await Promise.all([
      this.prisma.vendor.findUnique({ where: { id: body.vendorId } }),
      this.prisma.item.findUnique({ where: { id: body.itemId } }),
      this.prisma.shop.findFirst({ where: { type: 'HO' } }),
    ]);
    if (!vendor || !vendor.isActive) throw badRequest('vendor.inactive', 'Vendor not found or inactive');
    if (!item) throw notFound('Item');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.purchase.create({ data: { ...body, createdById: user.id } });
      await this.ledger.post(tx, [
        {
          shopId: ho!.id,
          itemId: item.id,
          qtyGrams: body.qtyGrams,
          type: 'PURCHASE',
          refType: 'Purchase',
          refId: p.id,
          // Stock arrives on the purchase date; noon IST keeps it inside that business day.
          effectiveAt: new Date(Math.min(Date.now(), istTimeOn(body.date, '12:00').getTime())),
          createdById: user.id,
        },
      ]);
      await this.audit.log(
        {
          actor: user,
          action: 'PURCHASE',
          entityType: 'Purchase',
          entityId: p.id,
          summary: `Recorded purchase · ${formatKg(body.qtyGrams)} kg ${item.nameEn} from ${vendor.nameEn} @ ${formatRupees(body.costPaisePerKg)}/kg · inv ${body.invoiceNo}`,
          after: body,
        },
        tx,
      );
      return p;
    });
  }
}

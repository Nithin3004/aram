import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthUser, isHo } from '../common/auth-user';
import { forbidden } from '../common/errors';

/**
 * Visibility rules:
 *  - HO (admins) see everything.
 *  - A shop sees its own stock and sales.
 *  - A supervisor also sees the STOCK (never sales) of its child shops.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  async canSeeStock(user: AuthUser, shopId: string): Promise<boolean> {
    if (isHo(user)) return true;
    if (user.shopId === shopId) return true;
    if (user.shopType === 'SUPERVISOR') {
      const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { parentId: true } });
      return shop?.parentId === user.shopId;
    }
    return false;
  }

  canSeeSales(user: AuthUser, shopId: string): boolean {
    return isHo(user) || user.shopId === shopId;
  }

  async assertStock(user: AuthUser, shopId: string) {
    if (!(await this.canSeeStock(user, shopId))) throw forbidden();
  }

  assertSales(user: AuthUser, shopId: string) {
    if (!this.canSeeSales(user, shopId)) throw forbidden();
  }

  /** Shop account's own shop id, or 403 for HO users on shop-only endpoints. */
  ownShop(user: AuthUser): string {
    if (!user.shopId) throw forbidden('This action is for shop accounts');
    return user.shopId;
  }
}

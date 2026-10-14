import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Permission, Role } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { ALLOWED_ROLES, AuthUser, hasPermission, IS_PUBLIC, REQUIRED_PERMISSION } from './auth-user';
import { forbidden } from './errors';

/**
 * Global guard. Every non-public request must carry a valid access token; the user
 * is re-read from the DB so disabling an account or changing permissions applies
 * immediately. Role and permission checks happen here, on the server, for every action.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ code: 'auth.required', message: 'Sign in required' });

    let payload: { sub: string; typ: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException({ code: 'auth.expired', message: 'Session expired' });
    }
    if (payload.typ !== 'access') throw new UnauthorizedException({ code: 'auth.required', message: 'Sign in required' });

    const u = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { shop: true } });
    if (!u || !u.isActive) throw new UnauthorizedException({ code: 'auth.disabled', message: 'Account disabled' });

    const user: AuthUser = {
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role as Role,
      permissions: u.permissions as Permission[],
      shopId: u.shopId,
      shopType: (u.shop?.type as AuthUser['shopType']) ?? null,
      language: u.language,
    };
    req.user = user;

    const roles = this.reflector.getAllAndOverride<Role[]>(ALLOWED_ROLES, targets);
    if (roles && !roles.includes(user.role)) throw forbidden();

    const perm = this.reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION, targets);
    if (perm && !hasPermission(user, perm)) throw forbidden();

    return true;
  }
}

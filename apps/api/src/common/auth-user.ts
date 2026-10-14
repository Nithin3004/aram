import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission, Role, ShopType } from '@aram/shared';

/** The authenticated caller, loaded fresh from the DB on every request. */
export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  permissions: Permission[];
  shopId: string | null;
  shopType: ShopType | null;
  language: string;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const IS_PUBLIC = 'isPublic';
/** Skip authentication (login, OTP). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRED_PERMISSION = 'requiredPermission';
/** Admin must hold this permission (Super Admin always passes). Implies HO-only. */
export const RequirePermission = (p: Permission) => SetMetadata(REQUIRED_PERMISSION, p);

export const ALLOWED_ROLES = 'allowedRoles';
/** Restrict an endpoint to roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ALLOWED_ROLES, roles);

export const isHo = (u: AuthUser) => u.role === 'SUPER_ADMIN' || u.role === 'ADMIN';
export const hasPermission = (u: AuthUser, p: Permission) =>
  u.role === 'SUPER_ADMIN' || (u.role === 'ADMIN' && u.permissions.includes(p));

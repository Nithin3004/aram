import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { formatIstTime } from '@aram/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError, badRequest } from '../common/errors';
import { SmsProvider } from './sms.provider';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_AFTER_MS = 30 * 1000;

const hashOtp = (challengeId: string, code: string) =>
  createHash('sha256').update(`${challengeId}:${code}:${process.env.JWT_SECRET}`).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditService,
    private sms: SmsProvider,
  ) {}

  async login(input: { username: string; password: string; deviceId: string }, ip?: string) {
    const username = input.username.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });
    const fail = async (summary: string, userId: string | null) => {
      await this.audit.log({
        actor: { id: userId, name: username },
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: userId ?? username,
        summary,
        ip,
      });
    };

    if (!user) {
      await fail('Unknown username', null);
      throw new AppError(HttpStatus.UNAUTHORIZED, 'auth.invalid', 'Wrong username or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await fail('Attempt while locked', user.id);
      throw new AppError(HttpStatus.LOCKED, 'auth.locked', 'Account locked', { time: formatIstTime(user.lockedUntil) });
    }
    if (!user.isActive) {
      await fail('Disabled account', user.id);
      throw new AppError(HttpStatus.FORBIDDEN, 'auth.disabled', 'Account disabled');
    }

    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      const lock = attempts >= MAX_FAILED;
      const lockedUntil = lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: lock ? 0 : attempts, lockedUntil },
      });
      await fail(lock ? `Wrong password — locked for ${LOCK_MINUTES} min` : `Wrong password (${attempts}/${MAX_FAILED})`, user.id);
      if (lock) throw new AppError(HttpStatus.LOCKED, 'auth.locked', 'Account locked', { time: formatIstTime(lockedUntil!) });
      throw new AppError(HttpStatus.UNAUTHORIZED, 'auth.invalid', 'Wrong username or password');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });

    // OTP: always for HO admins; for shops only on a device not seen before.
    const isAdmin = user.role !== 'SHOP';
    const trusted = isAdmin
      ? false
      : !!(await this.prisma.device.findUnique({ where: { userId_deviceId: { userId: user.id, deviceId: input.deviceId } } }));

    if (!trusted) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const ch = await this.prisma.otpChallenge.create({
        data: { userId: user.id, deviceId: input.deviceId, codeHash: 'pending', expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      });
      await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { codeHash: hashOtp(ch.id, code) } });
      await this.sms.sendOtp(user.phone, code);
      await this.audit.log({
        actor: { id: user.id, name: user.name },
        action: 'LOGIN_PASSWORD_OK',
        entityType: 'User',
        entityId: user.id,
        summary: `Password accepted, OTP sent${isAdmin ? '' : ' (new device)'}`,
        ip,
      });
      return {
        otpRequired: true as const,
        challengeId: ch.id,
        phoneMasked: user.phone.slice(0, 2) + 'x xxxx ' + user.phone.slice(-4),
        devCode: this.sms.exposesCode ? code : undefined,
      };
    }

    await this.audit.log({
      actor: { id: user.id, name: user.name },
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      summary: 'Signed in (trusted device)',
      ip,
    });
    return { otpRequired: false as const, ...(await this.issueToken(user.id)) };
  }

  async verifyOtp(input: { challengeId: string; code: string }, ip?: string) {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: input.challengeId }, include: { user: true } });
    const invalid = () => new AppError(HttpStatus.UNAUTHORIZED, 'auth.otpInvalid', 'Wrong or expired code');
    if (!ch || ch.consumedAt || ch.expiresAt < new Date() || ch.attempts >= OTP_MAX_ATTEMPTS) throw invalid();

    if (hashOtp(ch.id, input.code) !== ch.codeHash) {
      await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
      await this.audit.log({
        actor: { id: ch.userId, name: ch.user.name },
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: ch.userId,
        summary: 'Wrong OTP',
        ip,
      });
      throw invalid();
    }

    await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
    await this.prisma.device.upsert({
      where: { userId_deviceId: { userId: ch.userId, deviceId: ch.deviceId } },
      create: { userId: ch.userId, deviceId: ch.deviceId },
      update: {},
    });
    await this.audit.log({
      actor: { id: ch.userId, name: ch.user.name },
      action: 'LOGIN',
      entityType: 'User',
      entityId: ch.userId,
      summary: 'Signed in with OTP',
      ip,
    });
    return this.issueToken(ch.userId);
  }

  async resendOtp(challengeId: string) {
    const ch = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId }, include: { user: true } });
    if (!ch || ch.consumedAt) throw new AppError(HttpStatus.UNAUTHORIZED, 'auth.otpInvalid', 'Wrong or expired code');
    if (Date.now() - ch.createdAt.getTime() < OTP_RESEND_AFTER_MS) throw badRequest('auth.otpTooSoon', 'Wait before resending');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const fresh = await this.prisma.otpChallenge.create({
      data: { userId: ch.userId, deviceId: ch.deviceId, codeHash: 'pending', expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    await this.prisma.otpChallenge.update({ where: { id: fresh.id }, data: { codeHash: hashOtp(fresh.id, code) } });
    await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
    await this.sms.sendOtp(ch.user.phone, code);
    return { challengeId: fresh.id, devCode: this.sms.exposesCode ? code : undefined };
  }

  private async issueToken(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // Shops work offline for long stretches, so their session lasts longer.
    const expiresIn = user.role === 'SHOP' ? '30d' : '12h';
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' }, { expiresIn });
    return { accessToken };
  }

  async me(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { shop: { include: { parent: true } } },
    });
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      permissions: u.permissions,
      language: u.language,
      shop: u.shop && {
        id: u.shop.id,
        code: u.shop.code,
        nameEn: u.shop.nameEn,
        nameTa: u.shop.nameTa,
        type: u.shop.type,
        parent: u.shop.parent && { id: u.shop.parent.id, code: u.shop.parent.code, nameEn: u.shop.parent.nameEn, nameTa: u.shop.parent.nameTa },
      },
    };
  }

  async setLanguage(userId: string, language: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { language } });
    return { language };
  }
}

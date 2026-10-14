import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Tx } from '../prisma.service';
import { PrismaService } from '../prisma.service';

export interface AuditEntry {
  actor: { id: string | null; name: string };
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** Writes to the append-only audit log. There is intentionally no update/delete here. */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(e: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: e.actor.id,
        actorName: e.actor.name,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        summary: e.summary,
        before: e.before === undefined ? Prisma.JsonNull : (e.before as Prisma.InputJsonValue),
        after: e.after === undefined ? Prisma.JsonNull : (e.after as Prisma.InputJsonValue),
        ip: e.ip,
      },
    });
  }
}

export const SYSTEM = { id: null, name: 'System' };

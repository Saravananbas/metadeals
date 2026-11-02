import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";

type AuditData = {
  actorId?: string | null;
  action: string;
  targetId?: string | null;
  success: boolean;
  requestId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAudit(data: AuditData, tx?: Prisma.TransactionClient): Promise<void> {
  const client = tx ?? getDatabase();
  await client.auditEvent.create({
    data: {
      actorId: data.actorId ?? null,
      action: data.action,
      targetId: data.targetId ?? null,
      success: data.success,
      requestId: data.requestId ?? null,
      ipHash: data.ipHash ?? null,
      userAgent: data.userAgent ?? null,
      metadata: data.metadata,
    },
  });
}

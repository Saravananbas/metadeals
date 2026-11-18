import "server-only";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "./audit";
import { roleCan, type Permission } from "./permissions";
import { decryptTotpSecret, hashRateLimitSubject, verifyTotp } from "./crypto";
import { AuthenticationFailure, type RequestAuditMetadata } from "./service";

export type StateAction = "suspend" | "disable" | "enable" | "delete";

const PERMISSION: Record<StateAction, Permission> = {
  suspend: "account:suspend", disable: "account:suspend", enable: "account:reactivate", delete: "account:delete",
};
/** Disabling, enabling and deleting need a fresh authenticator code from the person doing it. */
const NEEDS_TOTP: ReadonlySet<StateAction> = new Set(["disable", "enable", "delete"]);
const MAX_SUSPENSION_MS = 366 * 24 * 60 * 60 * 1000;

/** Checks the acting administrator's own authenticator code. Failed codes back off like failed sign-ins; a used code cannot be replayed. */
export async function verifyStepUp(actorId: string, code: string, metadata: RequestAuditMetadata) {
  const db = getDatabase();
  const env = getAuthEnv();
  const subjectHash = hashRateLimitSubject(`stepup:${actorId}`, env.AUTH_SESSION_SECRET);
  const limiter = await db.authRateLimit.findUnique({ where: { subjectHash } });
  if (limiter?.lockedUntil && limiter.lockedUntil > new Date()) throw new AuthenticationFailure("Too many wrong codes. Wait a few minutes and try again.");

  const actor = await db.user.findUnique({ where: { id: actorId }, select: { status: true, totpSecretEncrypted: true } });
  const step = actor?.status === UserStatus.ACTIVE && actor.totpSecretEncrypted && /^\d{6}$/.test(code)
    ? verifyTotp(decryptTotpSecret(actor.totpSecretEncrypted, env.AUTH_TOTP_ENCRYPTION_KEY), code)
    : null;
  if (step === null) {
    const updated = await db.authRateLimit.upsert({ where: { subjectHash }, create: { subjectHash, failures: 1 }, update: { failures: { increment: 1 } }, select: { failures: true } });
    const failures = Math.min(updated.failures, 16);
    const delaySeconds = failures < 5 ? 0 : Math.min(15 * 60, 2 ** Math.min(failures - 5, 9));
    await db.authRateLimit.updateMany({ where: { subjectHash, failures: { lte: updated.failures } }, data: { lockedUntil: delaySeconds ? new Date(Date.now() + delaySeconds * 1000) : null } });
    await writeAudit({ actorId, targetId: actorId, action: "admin.account.stepup_failed", success: false, ...metadata, metadata: {} });
    throw new AuthenticationFailure("The authenticator code is not valid.");
  }
  const fresh = await db.user.updateMany({ where: { id: actorId, lastTotpStep: { lt: BigInt(step) } }, data: { lastTotpStep: BigInt(step) } });
  if (fresh.count !== 1) throw new AuthenticationFailure("That code was already used. Wait for the next code and try again.");
  await db.authRateLimit.deleteMany({ where: { subjectHash } });
}

export async function changeAccountState(input: {
  actorId: string;
  actorRole: UserRole;
  targetId: string;
  action: StateAction;
  totp?: string;
  suspendedFrom?: Date;
  suspendedUntil?: Date;
  reason?: string;
  metadata: RequestAuditMetadata;
}): Promise<{ status: UserStatus }> {
  const { action } = input;
  if (input.actorId === input.targetId) throw new AuthenticationFailure("You cannot change your own account.");
  if (!roleCan(input.actorRole, PERMISSION[action])) throw new AuthenticationFailure("You are not permitted to do that.");

  const now = new Date();
  let from: Date | null = null, until: Date | null = null, reason: string | null = null;
  if (action === "suspend") {
    reason = (input.reason ?? "").trim();
    if (reason.length < 5 || reason.length > 300) throw new AuthenticationFailure("Give a reason of 5 to 300 characters.");
    from = input.suspendedFrom ?? now;
    until = input.suspendedUntil ?? null;
    if (!until || Number.isNaN(until.getTime()) || Number.isNaN(from.getTime())) throw new AuthenticationFailure("Choose the start and end date and time.");
    if (until <= now) throw new AuthenticationFailure("The end of the suspension must be in the future.");
    if (until <= from) throw new AuthenticationFailure("The end must be after the start.");
    if (until.getTime() - from.getTime() > MAX_SUSPENSION_MS) throw new AuthenticationFailure("A suspension can last at most one year. Disable the account for longer.");
  }
  if (NEEDS_TOTP.has(action)) await verifyStepUp(input.actorId, input.totp ?? "", input.metadata);

  const immediate = action === "suspend" ? from! <= now : true;
  return getDatabase().$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: input.targetId }, select: { id: true, role: true, status: true, suspendedUntil: true } });
    if (!target || target.status === UserStatus.DELETED) throw new AuthenticationFailure("Account not found.");
    // Moderators are appointed and revoked only through the moderator appointment workflow.
    if (target.role === UserRole.COMMUNITY_MODERATOR) throw new AuthenticationFailure("Community moderators are managed from the moderator appointments page.");
    if (input.actorRole === UserRole.ADMIN && target.role !== UserRole.EDITOR) throw new AuthenticationFailure("You are not permitted to change this account.");

    const s = target.status;
    const allowed =
      action === "suspend" ? s === UserStatus.ACTIVE && target.suspendedUntil === null
      : action === "disable" ? s === UserStatus.ACTIVE || s === UserStatus.SUSPENDED
      : action === "enable" ? s === UserStatus.DISABLED || s === UserStatus.SUSPENDED || (s === UserStatus.ACTIVE && target.suspendedUntil !== null)
      : true;
    if (!allowed) throw new AuthenticationFailure("This account is not in a state that allows that action.");

    const locksOut = action === "disable" || action === "delete" || (action === "suspend" && immediate);
    if (locksOut && target.role === UserRole.SUPER_ADMIN && s === UserStatus.ACTIVE) {
      const activeAdmins = await tx.user.count({ where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE } });
      if (activeAdmins <= 1) throw new AuthenticationFailure("The last active super administrator cannot be locked out.");
    }

    const clear = { suspendedFrom: null, suspendedUntil: null, suspensionReason: null };
    const nextStatus = action === "suspend" ? (immediate ? UserStatus.SUSPENDED : UserStatus.ACTIVE)
      : action === "disable" ? UserStatus.DISABLED : action === "delete" ? UserStatus.DELETED : UserStatus.ACTIVE;
    await tx.user.update({
      where: { id: target.id },
      data: action === "suspend" ? { status: nextStatus, suspendedFrom: from, suspendedUntil: until, suspensionReason: reason } : { status: nextStatus, ...clear },
    });
    if (locksOut) await tx.authSession.deleteMany({ where: { userId: target.id } });
    await writeAudit({
      actorId: input.actorId,
      targetId: target.id,
      action: `admin.account.${action}`,
      success: true,
      ...input.metadata,
      metadata: { fromStatus: s, toStatus: nextStatus, role: target.role, ...(action === "suspend" ? { from: from!.toISOString(), until: until!.toISOString(), reason } : {}) },
    }, tx);
    return { status: nextStatus };
  }, { isolationLevel: "Serializable" });
}

import "server-only";
import { UserRole, UserStatus } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "./audit";
import { roleCan } from "./permissions";
import { DELEGABLE_PERMISSIONS, levelsFor, permissionsFor } from "./modules";
import { verifyStepUp } from "./account-state";
import { AuthenticationFailure, type RequestAuditMetadata } from "./service";

const MAX_DAYS = 366;

/** Reads a person's current setting: whether their access was set one by one, until when, and the level chosen per module. */
export async function getAccountAccess(targetId: string) {
  const user = await getDatabase().user.findUnique({
    where: { id: targetId },
    select: { role: true, status: true, customAccess: true, customAccessUntil: true, permissionGrants: { select: { permission: true } } },
  });
  if (!user || user.status === UserStatus.DELETED) throw new AuthenticationFailure("Account not found.");
  const granted = user.permissionGrants.map((g) => g.permission).filter((p) => DELEGABLE_PERMISSIONS.has(p));
  return {
    role: user.role,
    customAccess: user.customAccess,
    customAccessUntil: user.customAccessUntil?.toISOString() ?? null,
    expired: Boolean(user.customAccess && user.customAccessUntil && user.customAccessUntil <= new Date()),
    levels: levelsFor(granted),
  };
}

/**
 * Sets what one person may open, replacing their role defaults, or puts them back on their role.
 * Only a Super Administrator may do this, never for themselves, and it needs a fresh authenticator code.
 */
export async function setAccountAccess(input: {
  actorId: string;
  actorRole: UserRole;
  targetId: string;
  useRoleDefaults: boolean;
  choice?: Record<string, string>;
  until?: Date | null;
  totp?: string;
  metadata: RequestAuditMetadata;
}) {
  if (!roleCan(input.actorRole, "account:role:update")) throw new AuthenticationFailure("Only a super administrator can change access.");
  if (input.actorId === input.targetId) throw new AuthenticationFailure("You cannot change your own access.");

  let permissions: string[] = [];
  let until: Date | null = null;
  if (!input.useRoleDefaults) {
    try { permissions = permissionsFor(input.choice ?? {}); } catch { throw new AuthenticationFailure("That access choice is not valid."); }
    if (permissions.length === 0) throw new AuthenticationFailure("Choose at least one module, or disable the account instead.");
    until = input.until ?? null;
    if (until) {
      if (Number.isNaN(until.getTime()) || until <= new Date()) throw new AuthenticationFailure("The end date must be in the future.");
      if (until.getTime() - Date.now() > MAX_DAYS * 24 * 3_600_000) throw new AuthenticationFailure("Access can be set for at most one year at a time.");
    }
  }
  await verifyStepUp(input.actorId, input.totp ?? "", input.metadata);

  await getDatabase().$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: input.targetId }, select: { id: true, role: true, status: true } });
    if (!target || target.status === UserStatus.DELETED) throw new AuthenticationFailure("Account not found.");
    if (target.role === UserRole.SUPER_ADMIN) throw new AuthenticationFailure("A super administrator always has full access.");
    if (target.role === UserRole.COMMUNITY_MODERATOR) throw new AuthenticationFailure("Community moderators are managed from the moderator appointments page.");
    // Only the delegable permissions are replaced; other grants (for example announcements) are left as they are.
    await tx.staffPermissionGrant.deleteMany({ where: { userId: target.id, permission: { in: [...DELEGABLE_PERMISSIONS] } } });
    if (input.useRoleDefaults) {
      await tx.user.update({ where: { id: target.id }, data: { customAccess: false, customAccessUntil: null } });
    } else {
      await tx.staffPermissionGrant.createMany({ data: permissions.map((permission) => ({ userId: target.id, permission, grantedById: input.actorId })) });
      await tx.user.update({ where: { id: target.id }, data: { customAccess: true, customAccessUntil: until } });
    }
    await writeAudit({
      actorId: input.actorId,
      targetId: target.id,
      action: input.useRoleDefaults ? "admin.account.access_reset" : "admin.account.access_set",
      success: true,
      ...input.metadata,
      metadata: input.useRoleDefaults ? { role: target.role } : { role: target.role, modules: input.choice ?? {}, until: until?.toISOString() ?? null },
    }, tx);
  }, { isolationLevel: "Serializable" });
}

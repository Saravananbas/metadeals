import "server-only";
import { getDatabase } from "@/server/db/client";
import { CustomerError } from "@/server/customer/service";

/** The member's current posting restriction, if one is in force right now (not revoked, started, not yet expired). */
export async function activeRestriction(profileId: string, now = new Date()) {
  return getDatabase().memberRestriction.findFirst({
    where: { profileId, scope: "POSTING", revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
    select: { id: true, expiresAt: true, reason: true },
  });
}

/**
 * Called by every write path that publishes member content: discussions, comments and replies, edits, and community deal submissions.
 * Expiry is checked against the clock on every call, so a restriction ends exactly when it says it does and nothing has to run to lift it.
 * Reading, voting, saving, deleting your own content and private messages are not "posting" and stay available.
 */
export async function assertNotRestricted(profileId: string) {
  const r = await activeRestriction(profileId);
  if (!r) return;
  throw new CustomerError(`Posting is paused on your account until ${r.expiresAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST. Reason: ${r.reason}. You can appeal from your moderation notices.`, 403);
}

/** For paths that have only a customer id (deal submissions). A member with no forum profile yet cannot have a restriction, and none is created here. */
export async function assertNotRestrictedByCustomer(customerId: string) {
  const profile = await getDatabase().forumProfile.findUnique({ where: { customerId }, select: { id: true } });
  if (profile) await assertNotRestricted(profile.id);
}

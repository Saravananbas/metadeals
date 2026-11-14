import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { roleCan } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { ensureProfile } from "./service";
import { record, type Moderator } from "./moderation";
import { notify } from "./notifications";
import { activeRestriction } from "./restrictions";

/**
 * Warnings, time-limited posting restrictions, appeals and sensitive-content hiding.
 * Every change is one transaction that also writes the moderation history and audit row. Members are told what happened, never which moderator did it.
 * A restriction never touches ForumProfile.status: it only stops publishing (see restrictions.ts), and lasts at most 7 days when issued by a moderator.
 */
const MODERATOR_MAX_DAYS = 7, ADMIN_MAX_DAYS = 30;
const reason = z.string().trim().min(5, "Give a short reason.").max(300);
const need = (actor: Moderator, p: Parameters<typeof roleCan>[1]) => { if (!roleCan(actor.role, p)) throw new DealError("Permission denied.", 403); };
const target = z.object({ postId: z.string().max(191).optional(), commentId: z.string().max(191).optional(), reportId: z.string().max(191).optional() });
const NOTICE_LINK = { id: "", slug: "moderation", title: "" };

/** The member being acted on: must exist, must not be the actor's own member account, and must not be staff. */
async function targetProfile(actor: Moderator, handleOrId: string) {
  const db = getDatabase();
  const profile = await db.forumProfile.findFirst({ where: { OR: [{ id: handleOrId }, { handle: handleOrId.toLowerCase() }] }, select: { id: true, handle: true, customerId: true, customer: { select: { linkedStaff: { select: { id: true } } } } } });
  if (!profile) throw new DealError("Member not found.", 404);
  const self = await db.user.findUnique({ where: { id: actor.id }, select: { linkedCustomerId: true } });
  if (self?.linkedCustomerId && self.linkedCustomerId === profile.customerId) throw new DealError("You cannot act on your own member account.", 403);
  if (profile.customer.linkedStaff) throw new DealError("Moderation actions on staff accounts go to an administrator.", 403);
  return profile;
}

export async function warnMember(actor: Moderator, handleOrId: string, raw: unknown) {
  need(actor, "mod:member:warn");
  const input = target.extend({ reason }).strict().parse(raw);
  const db = getDatabase();
  const profile = await targetProfile(actor, handleOrId);
  const recent = await db.memberWarning.count({ where: { issuedById: actor.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
  if (recent >= 20) throw new DealError("Too many warnings in the last hour. Take a break and ask an administrator if this is a real emergency.", 429);
  return db.$transaction(async (tx) => {
    const warning = await tx.memberWarning.create({ data: { profileId: profile.id, issuedById: actor.id, reason: input.reason, postId: input.postId ?? null, commentId: input.commentId ?? null } });
    await record(tx, actor, { action: "member.warn", targetType: "PROFILE", profileId: profile.id, reason: input.reason, meta: { warningId: warning.id } });
    await notify(tx, { recipientId: profile.id, type: "MODERATION_WARNING", post: { ...NOTICE_LINK, id: warning.id, title: "Community guidelines warning" } });
    return { warningId: warning.id };
  });
}

export async function restrictMember(actor: Moderator, handleOrId: string, raw: unknown) {
  need(actor, "mod:member:restrict");
  const isAdmin = roleCan(actor.role, "mod:restriction:manage");
  const maxDays = isAdmin ? ADMIN_MAX_DAYS : MODERATOR_MAX_DAYS;
  const input = target.extend({ days: z.number().int().min(1).max(maxDays, `A restriction can last at most ${maxDays} days.`), reason }).strict().parse(raw);
  const db = getDatabase();
  const profile = await targetProfile(actor, handleOrId);
  if (!isAdmin) {
    // One restriction at a time, and a bounded number per hour, so a moderator cannot chain restrictions into an indefinite ban.
    if (await activeRestriction(profile.id)) throw new DealError("This member is already restricted. An administrator must decide about anything longer.", 409);
    const recent = await db.memberRestriction.count({ where: { issuedById: actor.id, createdAt: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= 10) throw new DealError("Too many restrictions in the last hour.", 429);
    const lastMonth = await db.memberRestriction.count({ where: { profileId: profile.id, issuedByRole: "COMMUNITY_MODERATOR", createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) } } });
    if (lastMonth >= 2) throw new DealError("This member has already been restricted twice this month. Escalate to an administrator.", 409);
  }
  const expiresAt = new Date(Date.now() + input.days * 86_400_000);
  return db.$transaction(async (tx) => {
    const row = await tx.memberRestriction.create({ data: { profileId: profile.id, expiresAt, reason: input.reason, issuedById: actor.id, issuedByRole: actor.role, postId: input.postId ?? null, commentId: input.commentId ?? null, reportId: input.reportId ?? null } });
    await record(tx, actor, { action: "member.restrict", targetType: "PROFILE", profileId: profile.id, reason: input.reason, meta: { restrictionId: row.id, days: input.days } });
    await notify(tx, { recipientId: profile.id, type: "POSTING_RESTRICTED", post: { ...NOTICE_LINK, id: row.id, title: `Posting paused for ${input.days} day${input.days === 1 ? "" : "s"}` } });
    return { restrictionId: row.id, expiresAt: expiresAt.toISOString() };
  });
}

/** A moderator may lift a restriction they issued; an administrator may lift any. */
export async function revokeRestriction(actor: Moderator, id: string, raw: unknown) {
  const input = z.object({ reason }).strict().parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const row = await tx.memberRestriction.findUnique({ where: { id }, select: { id: true, issuedById: true, profileId: true, revokedAt: true, expiresAt: true } });
    if (!row) throw new DealError("Restriction not found.", 404);
    const allowed = roleCan(actor.role, "mod:restriction:manage") || (roleCan(actor.role, "mod:member:restrict") && row.issuedById === actor.id);
    if (!allowed) throw new DealError("Permission denied.", 403);
    const changed = await tx.memberRestriction.updateMany({ where: { id, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date(), revokedById: actor.id, revokeReason: input.reason } });
    if (changed.count !== 1) throw new DealError("This restriction already ended.", 409);
    await record(tx, actor, { action: "member.restriction.revoke", targetType: "PROFILE", profileId: row.profileId, reason: input.reason, meta: { restrictionId: id } });
    return { restrictionId: id };
  });
}

export async function listRestrictions(actor: Moderator) {
  need(actor, "mod:restriction:manage");
  const now = new Date();
  const rows = await getDatabase().memberRestriction.findMany({ where: { revokedAt: null, expiresAt: { gt: now } }, orderBy: { expiresAt: "asc" }, take: 100, select: { id: true, reason: true, expiresAt: true, issuedByRole: true, profile: { select: { handle: true } } } });
  return rows.map((r) => ({ id: r.id, handle: r.profile.handle, reason: r.reason, expiresAt: r.expiresAt.toISOString(), issuedByRole: r.issuedByRole }));
}

// ---------- sensitive content ----------
export const SENSITIVE_CATEGORIES = ["PERSONAL_DATA", "SECRETS", "ILLEGAL", "OTHER"] as const;
/**
 * Hides content at once (post or comment), in one transaction with the history/audit row and a redacted escalation for administrators.
 * The content itself stays where it was, non-public. No copy of it is placed in the history, audit metadata, logs or notifications,
 * and moderators have no way to read it again: only an administrator can open it, and that access is itself audited.
 */
export async function hideSensitive(actor: Moderator, raw: unknown) {
  need(actor, "mod:sensitive:hide");
  const input = z.object({ targetType: z.enum(["POST", "COMMENT"]), targetId: z.string().min(1).max(191), category: z.enum(SENSITIVE_CATEGORIES) }).strict().parse(raw);
  return getDatabase().$transaction(async (tx) => {
    let authorId: string, post: { id: string; slug: string; title: string };
    if (input.targetType === "POST") {
      const changed = await tx.forumPost.updateMany({ where: { id: input.targetId, status: { in: ["PENDING_REVIEW", "PUBLISHED"] } }, data: { status: "REMOVED", removalReason: "Hidden by a moderator", version: { increment: 1 } } });
      if (changed.count !== 1) throw new DealError("That post is not available to hide.", 409);
      const row = await tx.forumPost.findUniqueOrThrow({ where: { id: input.targetId }, select: { id: true, slug: true, title: true, authorId: true } });
      authorId = row.authorId; post = { id: row.id, slug: row.slug, title: "" };
      await record(tx, actor, { action: "sensitive.hide", targetType: "POST", postId: row.id, reason: `Sensitive content hidden (${input.category})`, meta: { category: input.category } });
    } else {
      const changed = await tx.forumComment.updateMany({ where: { id: input.targetId, status: "PUBLISHED" }, data: { status: "REMOVED", removalReason: "Hidden by a moderator", version: { increment: 1 } } });
      if (changed.count !== 1) throw new DealError("That comment is not available to hide.", 409);
      const row = await tx.forumComment.findUniqueOrThrow({ where: { id: input.targetId }, select: { id: true, postId: true, authorId: true, post: { select: { id: true, slug: true } } } });
      await tx.forumPost.update({ where: { id: row.postId }, data: { commentCount: { decrement: 1 } } });
      authorId = row.authorId; post = { id: row.post.id, slug: row.post.slug, title: "" };
      await record(tx, actor, { action: "sensitive.hide", targetType: "COMMENT", commentId: row.id, reason: `Sensitive content hidden (${input.category})`, meta: { category: input.category } });
    }
    const escalation = await tx.moderationEscalation.create({ data: { targetType: input.targetType, targetId: input.targetId, category: input.category, createdById: actor.id } });
    await notify(tx, { recipientId: authorId, type: input.targetType === "POST" ? "POST_REMOVED" : "COMMENT_REMOVED", post: { ...post, title: "Your content" }, commentId: input.targetType === "COMMENT" ? input.targetId : null });
    return { escalationId: escalation.id };
  });
}

export async function listEscalations(actor: Moderator) {
  need(actor, "mod:escalation:read");
  const rows = await getDatabase().moderationEscalation.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, targetType: true, category: true, createdAt: true } });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Administrator-only. Opening the hidden item is recorded in the audit log. */
export async function openEscalated(actor: Moderator, id: string) {
  need(actor, "mod:escalation:read");
  const db = getDatabase();
  const e = await db.moderationEscalation.findUnique({ where: { id } });
  if (!e) throw new DealError("Escalation not found.", 404);
  const content = e.targetType === "POST"
    ? await db.forumPost.findUnique({ where: { id: e.targetId }, select: { title: true, body: true } })
    : await db.forumComment.findUnique({ where: { id: e.targetId }, select: { body: true } });
  await db.auditEvent.create({ data: { actorId: actor.id, action: "community.sensitive.viewed", targetId: id, success: true, metadata: { targetType: e.targetType } } });
  return { targetType: e.targetType, category: e.category, title: (content as { title?: string } | null)?.title ?? null, body: content?.body ?? null };
}

export async function closeEscalation(actor: Moderator, id: string) {
  need(actor, "mod:escalation:read");
  const done = await getDatabase().moderationEscalation.updateMany({ where: { id, status: "OPEN" }, data: { status: "HANDLED", handledById: actor.id, handledAt: new Date() } });
  if (done.count !== 1) throw new DealError("Already handled.", 409);
  return { escalationId: id };
}

// ---------- appeals ----------
const APPEAL_TYPES = ["RESTRICTION", "WARNING", "ACTION"] as const;

/** Moderation history rows point at content by id only, so the member's own content ids are looked up first. */
async function ownContent(profileId: string) {
  const db = getDatabase();
  const [posts, comments] = await Promise.all([
    db.forumPost.findMany({ where: { authorId: profileId }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    db.forumComment.findMany({ where: { authorId: profileId }, select: { id: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
  ]);
  return { OR: [{ postId: { in: posts.map((x) => x.id) } }, { commentId: { in: comments.map((x) => x.id) } }] };
}

/** What the signed-in member sees about moderation on their own account. */
export async function myModeration(customerId: string) {
  const profile = await ensureProfile(customerId);
  const db = getDatabase(), since = new Date(Date.now() - 90 * 86_400_000);
  const own = await ownContent(profile.id);
  const [warnings, restrictions, appeals, actions] = await Promise.all([
    db.memberWarning.findMany({ where: { profileId: profile.id, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, select: { id: true, reason: true, status: true, createdAt: true } }),
    db.memberRestriction.findMany({ where: { profileId: profile.id, createdAt: { gt: since } }, orderBy: { createdAt: "desc" }, select: { id: true, reason: true, expiresAt: true, revokedAt: true, createdAt: true } }),
    db.moderationAppeal.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, targetType: true, targetId: true, status: true, decisionNote: true, createdAt: true, decidedAt: true } }),
    db.forumModerationAction.findMany({ where: { action: { in: ["post.remove", "comment.remove", "sensitive.hide"] }, createdAt: { gt: since }, ...own }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, createdAt: true } }),
  ]);
  const now = Date.now();
  const appealOf = new Map(appeals.map((a) => [`${a.targetType}:${a.targetId}`, a]));
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    restricted: Boolean(await activeRestriction(profile.id)),
    warnings: warnings.map((w) => ({ id: w.id, reason: w.reason, status: w.status, at: w.createdAt.toISOString(), appeal: appealOf.get(`WARNING:${w.id}`)?.status ?? null })),
    restrictions: restrictions.map((r) => ({ id: r.id, reason: r.reason, expiresAt: r.expiresAt.toISOString(), revokedAt: iso(r.revokedAt), active: !r.revokedAt && r.expiresAt.getTime() > now, at: r.createdAt.toISOString(), appeal: appealOf.get(`RESTRICTION:${r.id}`)?.status ?? null })),
    removals: actions.map((a) => ({ id: a.id, kind: a.action === "comment.remove" ? "comment" : "post", at: a.createdAt.toISOString(), appeal: appealOf.get(`ACTION:${a.id}`)?.status ?? null })),
    appeals: appeals.map((a) => ({ id: a.id, targetType: a.targetType, status: a.status, note: a.status === "OPEN" ? null : a.decisionNote, at: a.createdAt.toISOString(), decidedAt: iso(a.decidedAt) })),
  };
}

export async function fileAppeal(customerId: string, raw: unknown) {
  const input = z.object({ targetType: z.enum(APPEAL_TYPES), targetId: z.string().min(1).max(191), message: z.string().trim().min(10, "Explain why in a sentence or two.").max(1000) }).strict().parse(raw);
  const profile = await ensureProfile(customerId);
  await limitCustomerRequests(`appeal:${profile.id}`, 5, 86_400);
  const db = getDatabase();
  let originalActorId: string | null = null;
  if (input.targetType === "RESTRICTION") originalActorId = (await db.memberRestriction.findFirst({ where: { id: input.targetId, profileId: profile.id }, select: { issuedById: true } }))?.issuedById ?? null;
  else if (input.targetType === "WARNING") originalActorId = (await db.memberWarning.findFirst({ where: { id: input.targetId, profileId: profile.id }, select: { issuedById: true } }))?.issuedById ?? null;
  else originalActorId = (await db.forumModerationAction.findFirst({ where: { id: input.targetId, action: { in: ["post.remove", "comment.remove", "sensitive.hide"] }, ...(await ownContent(profile.id)) }, select: { actorId: true } }))?.actorId ?? null;
  // Someone else's id, or one that does not exist, looks the same.
  if (!originalActorId) throw new CustomerError("Nothing to appeal here.", 404);
  try {
    const row = await db.moderationAppeal.create({ data: { profileId: profile.id, targetType: input.targetType, targetId: input.targetId, originalActorId, message: input.message } });
    return { appealId: row.id };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new CustomerError("You have already appealed this.", 409);
    throw error;
  }
}

export async function listAppeals(actor: Moderator, status: "OPEN" | "UPHELD" | "OVERTURNED" = "OPEN") {
  need(actor, "mod:appeal:decide");
  const rows = await getDatabase().moderationAppeal.findMany({ where: { status }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, targetType: true, targetId: true, message: true, status: true, version: true, createdAt: true, originalActorId: true, profile: { select: { handle: true } } } });
  // The reviewer is told only whether they themselves took the action; the original moderator's identity is not shown.
  return rows.map((r) => ({ id: r.id, handle: r.profile.handle, targetType: r.targetType, message: r.message, status: r.status, version: r.version, createdAt: r.createdAt.toISOString(), mine: r.originalActorId === actor.id }));
}

/** Decided by an administrator who did not take the original action. Overturning also undoes it. */
export async function decideAppeal(actor: Moderator, id: string, raw: unknown) {
  need(actor, "mod:appeal:decide");
  const input = z.object({ version: z.number().int().positive(), outcome: z.enum(["UPHELD", "OVERTURNED"]), note: reason }).strict().parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const appeal = await tx.moderationAppeal.findUnique({ where: { id } });
    if (!appeal) throw new DealError("Appeal not found.", 404);
    if (appeal.originalActorId === actor.id) throw new DealError("You took the original action, so you cannot decide this appeal. Another administrator must.", 403);
    const changed = await tx.moderationAppeal.updateMany({ where: { id, version: input.version, status: "OPEN" }, data: { status: input.outcome, decidedById: actor.id, decidedAt: new Date(), decisionNote: input.note, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("This appeal was already decided or changed. Reload first.", 409);
    if (input.outcome === "OVERTURNED") {
      if (appeal.targetType === "RESTRICTION") await tx.memberRestriction.updateMany({ where: { id: appeal.targetId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: actor.id, revokeReason: "Appeal overturned" } });
      else if (appeal.targetType === "WARNING") await tx.memberWarning.updateMany({ where: { id: appeal.targetId }, data: { status: "WITHDRAWN" } });
      else {
        const action = await tx.forumModerationAction.findUnique({ where: { id: appeal.targetId }, select: { postId: true, commentId: true } });
        if (action?.postId) await tx.forumPost.updateMany({ where: { id: action.postId, status: "REMOVED" }, data: { status: "PUBLISHED", removalReason: null, publishedAt: new Date(), version: { increment: 1 } } });
        if (action?.commentId) {
          const restored = await tx.forumComment.updateMany({ where: { id: action.commentId, status: "REMOVED" }, data: { status: "PUBLISHED", removalReason: null, version: { increment: 1 } } });
          if (restored.count === 1) { const c = await tx.forumComment.findUniqueOrThrow({ where: { id: action.commentId }, select: { postId: true } }); await tx.forumPost.update({ where: { id: c.postId }, data: { commentCount: { increment: 1 } } }); }
        }
      }
    }
    await record(tx, actor, { action: `appeal.${input.outcome.toLowerCase()}`, targetType: "PROFILE", profileId: appeal.profileId, reason: input.note, meta: { appealId: id, targetType: appeal.targetType } });
    await notify(tx, { recipientId: appeal.profileId, type: "APPEAL_DECIDED", post: { ...NOTICE_LINK, id, title: input.outcome === "OVERTURNED" ? "Your appeal was accepted" : "Your appeal was reviewed" } });
    return { appealId: id };
  });
}

// ---------- a moderator's own history ----------
export async function myHistory(actor: Moderator) {
  need(actor, "mod:history:own");
  const db = getDatabase();
  const [actions, restrictions] = await Promise.all([
    db.forumModerationAction.findMany({ where: { actorId: actor.id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, action: true, targetType: true, reason: true, createdAt: true } }),
    db.memberRestriction.findMany({ where: { issuedById: actor.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "asc" }, take: 50, select: { id: true, expiresAt: true, reason: true, profile: { select: { handle: true } } } }),
  ]);
  return {
    actions: actions.map((a) => ({ id: a.id, action: a.action, targetType: a.targetType, reason: a.reason, at: a.createdAt.toISOString() })),
    activeRestrictions: restrictions.map((r) => ({ id: r.id, handle: r.profile.handle, reason: r.reason, expiresAt: r.expiresAt.toISOString() })),
  };
}

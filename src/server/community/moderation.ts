import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { roleCan, type AdminRole, type Permission } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";
import { withRetry } from "./config";

export type Moderator = { id: string; role: AdminRole };

const need = (actor: Moderator, permission: Permission) => {
  if (!roleCan(actor.role, permission)) throw new DealError("Permission denied.", 403);
};
const reasonSchema = z.string().trim().min(5, "Give a short reason.").max(300);
const versionSchema = z.number().int().positive();

type Tx = Prisma.TransactionClient;
/** One history row and one audit event, always written in the same transaction as the change they describe. */
export async function record(tx: Tx, actor: Moderator, entry: { action: string; targetType: "POST" | "COMMENT" | "PROFILE" | "COMMUNITY" | "REPORT" | "DM"; postId?: string; commentId?: string; profileId?: string; reason: string; meta?: Record<string, unknown> }) {
  const correlationId = randomUUID();
  await tx.forumModerationAction.create({ data: { actorId: actor.id, action: entry.action, targetType: entry.targetType, postId: entry.postId, commentId: entry.commentId, profileId: entry.profileId, reason: entry.reason, correlationId } });
  await tx.auditEvent.create({ data: { actorId: actor.id, action: `community.${entry.action}`, targetId: entry.postId ?? entry.commentId ?? entry.profileId ?? "community", success: true, metadata: { correlationId, ...entry.meta } } });
  logger.info({ event: "community.moderation.action", action: entry.action, correlationId }, "community moderation action");
}

const postCard = {
  id: true, slug: true, type: true, title: true, body: true, url: true, merchantName: true, priceMinor: true, status: true, locked: true, version: true, createdAt: true,
  community: { select: { slug: true, name: true } }, author: { select: { id: true, handle: true, status: true } },
} as const;

export async function listQueue(actor: Moderator, page = 1) {
  need(actor, "forum:moderate");
  const db = getDatabase(), take = 25;
  const [rows, total] = await Promise.all([
    db.forumPost.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * take, take, select: postCard }),
    db.forumPost.count({ where: { status: "PENDING_REVIEW" } }),
  ]);
  return { total, page, items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
}

export async function listReports(actor: Moderator, status: "OPEN" | "RESOLVED" | "DISMISSED" | "ESCALATED", page = 1) {
  need(actor, "forum:moderate");
  const db = getDatabase(), take = 25;
  const [rows, total, open] = await Promise.all([
    db.forumReport.findMany({
      where: { status }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * take, take,
      select: {
        id: true, targetType: true, category: true, details: true, status: true, version: true, createdAt: true, resolution: true,
        reporter: { select: { handle: true } },
        post: { select: { id: true, slug: true, title: true, status: true, version: true, locked: true, author: { select: { id: true, handle: true } } } },
        comment: { select: { id: true, body: true, status: true, author: { select: { id: true, handle: true } } } },
        targetProfile: { select: { id: true, handle: true, status: true } },
      },
    }),
    db.forumReport.count({ where: { status } }),
    db.forumReport.count({ where: { status: "OPEN" } }),
  ]);
  return { total, page, open, items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), comment: r.comment ? { ...r.comment, body: r.comment.body.slice(0, 500) } : null })) };
}

type PostAction = "approve" | "remove" | "restore" | "lock" | "unlock";
const POST_FROM: Record<PostAction, Array<"PENDING_REVIEW" | "PUBLISHED" | "REMOVED">> = {
  approve: ["PENDING_REVIEW"], remove: ["PENDING_REVIEW", "PUBLISHED"], restore: ["REMOVED"], lock: ["PUBLISHED"], unlock: ["PUBLISHED"],
};

/** Every post action is a conditional update (version and current status) plus its history rows, all in one transaction: if two moderators race, one wins and the other gets a clear conflict. */
export async function actOnPost(actor: Moderator, id: string, action: PostAction, raw: unknown) {
  need(actor, "forum:moderate");
  const needsReason = action === "remove" || action === "restore" || action === "lock";
  const input = z.object({ version: versionSchema, reason: needsReason ? reasonSchema : reasonSchema.optional() }).strict().parse(raw);
  const reason = input.reason ?? `${action} by moderator`;
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const now = new Date();
    const where: Prisma.ForumPostWhereInput = { id, version: input.version, status: { in: POST_FROM[action] }, ...(action === "unlock" ? { locked: true } : action === "lock" ? { locked: false } : {}) };
    const data: Prisma.ForumPostUpdateManyMutationInput =
      action === "approve" ? { status: "PUBLISHED", publishedAt: now, removalReason: null }
      : action === "remove" ? { status: "REMOVED", removalReason: reason }
      : action === "restore" ? { status: "PUBLISHED", removalReason: null, publishedAt: now }
      : action === "lock" ? { locked: true } : { locked: false };
    const changed = await tx.forumPost.updateMany({ where, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) {
      const exists = await tx.forumPost.findUnique({ where: { id }, select: { id: true } });
      throw new DealError(exists ? "This post was already handled or changed. Reload first." : "Post not found.", exists ? 409 : 404);
    }
    await record(tx, actor, { action: `post.${action}`, targetType: "POST", postId: id, reason });
    return { postId: id };
  });
}

export async function actOnComment(actor: Moderator, id: string, action: "remove" | "restore", raw: unknown) {
  need(actor, "forum:moderate");
  const input = z.object({ reason: reasonSchema }).strict().parse(raw);
  const db = getDatabase();
  return withRetry(() => db.$transaction(async (tx) => {
    const from = action === "remove" ? "PUBLISHED" : "REMOVED";
    const changed = await tx.forumComment.updateMany({
      where: { id, status: from }, data: { status: action === "remove" ? "REMOVED" : "PUBLISHED", removalReason: action === "remove" ? input.reason : null, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new DealError("This comment was already handled or no longer exists.", 409);
    const c = await tx.forumComment.findUniqueOrThrow({ where: { id }, select: { postId: true } });
    await tx.forumPost.update({ where: { id: c.postId }, data: { commentCount: { increment: action === "remove" ? -1 : 1 } } });
    await record(tx, actor, { action: `comment.${action}`, targetType: "COMMENT", commentId: id, reason: input.reason });
    return { commentId: id };
  }));
}

export async function resolveReport(actor: Moderator, id: string, raw: unknown) {
  need(actor, "forum:moderate");
  const input = z.object({ version: versionSchema, outcome: z.enum(["RESOLVED", "DISMISSED", "ESCALATED"]), resolution: reasonSchema }).strict().parse(raw);
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const current = await tx.forumReport.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new DealError("Report not found.", 404);
    // Escalated reports are for people who may manage the community and its members.
    if (current.status === "ESCALATED") need(actor, "forum:manage");
    const changed = await tx.forumReport.updateMany({
      where: { id, version: input.version, status: { in: current.status === "ESCALATED" ? ["ESCALATED"] : ["OPEN"] } },
      data: { status: input.outcome, resolution: input.resolution, resolvedById: actor.id, resolvedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new DealError("This report was already handled or changed. Reload first.", 409);
    await record(tx, actor, { action: `report.${input.outcome.toLowerCase()}`, targetType: "REPORT", reason: input.resolution, meta: { reportId: id } });
    return { reportId: id };
  });
}

export async function setMemberStatus(actor: Moderator, profileId: string, action: "suspend" | "restore", raw: unknown) {
  need(actor, "forum:manage");
  const input = z.object({ reason: reasonSchema, days: z.number().int().min(1).max(365).nullable().optional() }).strict().parse(raw);
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const target = await tx.forumProfile.findUnique({ where: { id: profileId }, select: { id: true, status: true } });
    if (!target) throw new DealError("Member not found.", 404);
    const changed = await tx.forumProfile.updateMany({
      where: { id: profileId, status: action === "suspend" ? "ACTIVE" : "SUSPENDED" },
      data: action === "suspend"
        ? { status: "SUSPENDED", suspensionReason: input.reason, suspendedUntil: input.days ? new Date(Date.now() + input.days * 86_400_000) : null }
        : { status: "ACTIVE", suspensionReason: null, suspendedUntil: null },
    });
    if (changed.count !== 1) throw new DealError(action === "suspend" ? "This member is already suspended." : "This member is not suspended.", 409);
    await record(tx, actor, { action: `member.${action}`, targetType: "PROFILE", profileId, reason: input.reason, meta: { days: input.days ?? null } });
    return { profileId };
  });
}

const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(40);
export const communitySchema = z.object({
  slug: slugSchema, name: z.string().trim().min(2).max(60), description: z.string().trim().min(5).max(300),
  sortOrder: z.number().int().min(0).max(1000).default(0), isActive: z.boolean().default(true), requiresReview: z.boolean().default(false),
}).strict();

export async function listCommunitiesAdmin(actor: Moderator) {
  need(actor, "forum:manage");
  return getDatabase().forumCommunity.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, description: true, sortOrder: true, isActive: true, requiresReview: true, _count: { select: { posts: true } } } });
}

export async function saveCommunity(actor: Moderator, raw: unknown, id?: string) {
  need(actor, "forum:manage");
  const input = communitySchema.parse(raw);
  return getDatabase().$transaction(async (tx) => {
    try {
      const row = id ? await tx.forumCommunity.update({ where: { id }, data: input }) : await tx.forumCommunity.create({ data: input });
      await record(tx, actor, { action: id ? "community.update" : "community.create", targetType: "COMMUNITY", reason: `${input.slug}`, meta: { communityId: row.id } });
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new DealError("A community with that web name already exists.", 409);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") throw new DealError("Community not found.", 404);
      throw error;
    }
  });
}

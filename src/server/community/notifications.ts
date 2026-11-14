import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { assertCommunityEnabled } from "./config";

export type NotificationType = "ANNOUNCEMENT" | "POST_COMMENT" | "COMMENT_REPLY" | "POST_APPROVED" | "POST_REMOVED" | "POST_RESTORED" | "POST_LOCKED" | "POST_UNLOCKED" | "COMMENT_REMOVED" | "COMMENT_RESTORED" | "MESSAGE" | "MODERATION_WARNING" | "POSTING_RESTRICTED" | "APPEAL_DECIDED";

type Tx = Prisma.TransactionClient;

/**
 * Adds a notice for a member, inside the same transaction as the event. Nobody is notified about their own actions.
 * Moderators are never named: the actor is only set for member actions.
 */
export async function notify(tx: Tx, n: { recipientId: string; actorId?: string | null; type: NotificationType; post: { id: string; slug: string; title: string }; commentId?: string | null }) {
  if (n.actorId && n.actorId === n.recipientId) return;
  await tx.forumNotification.create({ data: { recipientId: n.recipientId, actorId: n.actorId ?? null, type: n.type, postId: n.post.id, postSlug: n.post.slug.slice(0, 120), postTitle: n.post.title.slice(0, 200), commentId: n.commentId ?? null } });
}

async function profileIdOf(customerId: string) {
  return (await getDatabase().forumProfile.findUnique({ where: { customerId }, select: { id: true } }))?.id ?? null;
}

/** The member's recent notices (newest first) and how many are unread. Only ever the signed-in member's own. */
export async function listNotifications(customerId: string, limit = 20) {
  assertCommunityEnabled();
  const db = getDatabase();
  const me = await profileIdOf(customerId);
  if (!me) return { items: [], unread: 0 };
  // Old read notices are tidied up now and then so the table stays small.
  if (Math.random() < 0.02) void db.forumNotification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } }).catch(() => {});
  const [rows, unread] = await Promise.all([
    db.forumNotification.findMany({ where: { recipientId: me }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: Math.min(Math.max(limit, 1), 50), select: { id: true, type: true, postSlug: true, postTitle: true, commentId: true, readAt: true, createdAt: true, actor: { select: { handle: true } } } }),
    db.forumNotification.count({ where: { recipientId: me, readAt: null } }),
  ]);
  return {
    unread,
    items: rows.map((r) => ({ id: r.id, type: r.type as NotificationType, postSlug: r.postSlug, postTitle: r.postTitle, commentId: r.commentId, actor: r.actor?.handle ?? null, read: Boolean(r.readAt), createdAt: r.createdAt.toISOString() })),
  };
}

/** Marks some (or all) of the member's own notices as read. Ids that belong to someone else are ignored. */
export async function markNotificationsRead(customerId: string, ids?: string[]) {
  assertCommunityEnabled();
  const me = await profileIdOf(customerId);
  if (!me) return { marked: 0 };
  const done = await getDatabase().forumNotification.updateMany({ where: { recipientId: me, readAt: null, ...(ids ? { id: { in: ids.slice(0, 100) } } : {}) }, data: { readAt: new Date() } });
  return { marked: done.count };
}

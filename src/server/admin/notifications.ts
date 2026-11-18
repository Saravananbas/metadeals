import "server-only";
import { getDatabase } from "@/server/db/client";
import { can, canReviewSubmissions, type AdminRole } from "@/server/auth/permissions";

export type NotificationItem = { id: string; title: string; at: string; note?: string; href: string };
export type NotificationGroup = { key: string; label: string; count: number; href: string; items: NotificationItem[] };
type Actor = { id: string; role: AdminRole; permissions?: readonly string[] | null };

const DEAL_QUEUE = ["DRAFT", "PENDING_REVIEW"] as ("DRAFT" | "PENDING_REVIEW")[];

/**
 * Admin side panel: what is waiting for a person, grouped by kind. A group appears only when the person may act on it.
 * `hidden` holds the ids this person dismissed in their panel; they are left out of the lists and the counts.
 */
export async function getAdminNotifications(actor: Actor, hidden: string[] = []) {
  const db = getDatabase();
  const groups: NotificationGroup[] = [];
  const take = 5;
  const iso = (d: Date) => d.toISOString();
  const notHidden = { id: { notIn: hidden } };

  if (canReviewSubmissions(actor)) {
    const where = { status: "PENDING_REVIEW" as const, ...notHidden };
    const [count, rows] = await Promise.all([
      db.communityDealSubmission.count({ where }),
      db.communityDealSubmission.findMany({ where, orderBy: { submittedAt: "desc" }, take, select: { id: true, title: true, submittedAt: true, resubmissions: true } }),
    ]);
    groups.push({ key: "submissions", label: "Deals submitted by members", count, href: "/admin/submissions", items: rows.map((r) => ({ id: r.id, title: r.title, at: iso(r.submittedAt), note: r.resubmissions > 0 ? "Resubmitted" : "New", href: "/admin/submissions" })) });
  }

  if (can(actor, "deal:publish")) {
    const where = { status: { in: DEAL_QUEUE }, ...notHidden };
    const [count, rows] = await Promise.all([
      db.deal.count({ where }),
      db.deal.findMany({ where, orderBy: { updatedAt: "desc" }, take, select: { id: true, title: true, updatedAt: true, status: true } }),
    ]);
    groups.push({ key: "drafts", label: "Deals ready to publish", count, href: "/admin/deals", items: rows.map((r) => ({ id: r.id, title: r.title, at: iso(r.updatedAt), note: r.status === "DRAFT" ? "Draft" : "Pending review", href: "/admin/deals" })) });
  }

  if (can(actor, "mod:queue:read")) {
    const postWhere = { status: "PENDING_REVIEW" as const, ...notHidden };
    const reportWhere = { status: "OPEN" as const, ...notHidden };
    const [postCount, posts, reportCount, dmReports, reports] = await Promise.all([
      db.forumPost.count({ where: postWhere }),
      db.forumPost.findMany({ where: postWhere, orderBy: { createdAt: "desc" }, take, select: { id: true, title: true, createdAt: true } }),
      db.forumReport.count({ where: reportWhere }),
      db.dmReport.count({ where: reportWhere }),
      db.forumReport.findMany({ where: reportWhere, orderBy: { createdAt: "desc" }, take, select: { id: true, category: true, targetType: true, createdAt: true } }),
    ]);
    groups.push({ key: "posts", label: "Community posts to review", count: postCount, href: "/admin/community", items: posts.map((r) => ({ id: r.id, title: r.title, at: iso(r.createdAt), href: "/admin/community" })) });
    groups.push({ key: "reports", label: "Reports", count: reportCount + dmReports, href: "/admin/community", items: reports.map((r) => ({ id: r.id, title: `${r.category.toLowerCase().replaceAll("_", " ")} report on a ${r.targetType.toLowerCase()}`, at: iso(r.createdAt), href: "/admin/community" })) });
  }

  return { total: groups.reduce((sum, g) => sum + g.count, 0), groups };
}

/** Every id currently waiting in one group (newest first, at most 300), so "Clear all" can dismiss the whole group and not only the five shown. */
export async function getNotificationIds(actor: Actor, group: string, hidden: string[] = []): Promise<string[]> {
  const db = getDatabase();
  const notHidden = { id: { notIn: hidden } };
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  if (group === "submissions" && canReviewSubmissions(actor)) return ids(await db.communityDealSubmission.findMany({ where: { status: "PENDING_REVIEW", ...notHidden }, orderBy: { submittedAt: "desc" }, take: 300, select: { id: true } }));
  if (group === "drafts" && can(actor, "deal:publish")) return ids(await db.deal.findMany({ where: { status: { in: DEAL_QUEUE }, ...notHidden }, orderBy: { updatedAt: "desc" }, take: 300, select: { id: true } }));
  if (group === "posts" && can(actor, "mod:queue:read")) return ids(await db.forumPost.findMany({ where: { status: "PENDING_REVIEW", ...notHidden }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true } }));
  if (group === "reports" && can(actor, "mod:queue:read")) return ids(await db.forumReport.findMany({ where: { status: "OPEN", ...notHidden }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true } }));
  return [];
}

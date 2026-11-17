import "server-only";
import { getDatabase } from "@/server/db/client";
import { canReviewSubmissions, roleCan, type AdminRole } from "@/server/auth/permissions";

export type NotificationItem = { id: string; title: string; at: string; note?: string; href: string };
export type NotificationGroup = { key: string; label: string; count: number; href: string; items: NotificationItem[] };

/** Admin side panel: what is waiting for a person, grouped by kind. A group appears only when the role may act on it. */
export async function getAdminNotifications(actor: { id: string; role: AdminRole }) {
  const db = getDatabase();
  const groups: NotificationGroup[] = [];
  const take = 5;
  const iso = (d: Date) => d.toISOString();

  if (canReviewSubmissions(actor.role)) {
    const where = { status: "PENDING_REVIEW" as const };
    const [count, rows] = await Promise.all([
      db.communityDealSubmission.count({ where }),
      db.communityDealSubmission.findMany({ where, orderBy: { submittedAt: "desc" }, take, select: { id: true, title: true, submittedAt: true, resubmissions: true } }),
    ]);
    groups.push({ key: "submissions", label: "Deals submitted by members", count, href: "/admin/submissions", items: rows.map((r) => ({ id: r.id, title: r.title, at: iso(r.submittedAt), note: r.resubmissions > 0 ? "Resubmitted" : "New", href: "/admin/submissions" })) });
  }

  if (roleCan(actor.role, "deal:publish")) {
    const where = { status: { in: ["DRAFT", "PENDING_REVIEW"] as ("DRAFT" | "PENDING_REVIEW")[] } };
    const [count, rows] = await Promise.all([
      db.deal.count({ where }),
      db.deal.findMany({ where, orderBy: { updatedAt: "desc" }, take, select: { id: true, title: true, updatedAt: true, status: true } }),
    ]);
    groups.push({ key: "drafts", label: "Deals ready to publish", count, href: "/admin/deals", items: rows.map((r) => ({ id: r.id, title: r.title, at: iso(r.updatedAt), note: r.status === "DRAFT" ? "Draft" : "Pending review", href: "/admin/deals" })) });
  }

  if (roleCan(actor.role, "mod:queue:read")) {
    const postWhere = { status: "PENDING_REVIEW" as const };
    const [postCount, posts, reportCount, dmReports, reports] = await Promise.all([
      db.forumPost.count({ where: postWhere }),
      db.forumPost.findMany({ where: postWhere, orderBy: { createdAt: "desc" }, take, select: { id: true, title: true, createdAt: true } }),
      db.forumReport.count({ where: { status: "OPEN" } }),
      db.dmReport.count({ where: { status: "OPEN" } }),
      db.forumReport.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take, select: { id: true, category: true, targetType: true, createdAt: true } }),
    ]);
    groups.push({ key: "posts", label: "Community posts to review", count: postCount, href: "/admin/community", items: posts.map((r) => ({ id: r.id, title: r.title, at: iso(r.createdAt), href: "/admin/community" })) });
    groups.push({ key: "reports", label: "Reports", count: reportCount + dmReports, href: "/admin/community", items: reports.map((r) => ({ id: r.id, title: `${r.category.toLowerCase().replaceAll("_", " ")} report on a ${r.targetType.toLowerCase()}`, at: iso(r.createdAt), href: "/admin/community" })) });
  }

  return { total: groups.reduce((sum, g) => sum + g.count, 0), groups };
}

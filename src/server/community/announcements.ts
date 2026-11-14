import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { roleCan } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";
import { logger } from "@/server/logging/logger";
import { assertCommunityEnabled } from "./config";
import { prepareRichBody, sanitizeRichHtml } from "./richtext";
import type { Moderator } from "./moderation";

/** What every member sees as the author of an official announcement, whichever staff member wrote it. */
export const OFFICIAL_AUTHOR = "MetaDeals4U Team";
const PERMISSION = "announcement.publish";
const slugify = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "announcement";

// ---------- who may publish: ADMIN and SUPER_ADMIN by role, anyone else only with an explicit grant ----------
export async function canPublish(actor: Moderator): Promise<boolean> {
  if (roleCan(actor.role, PERMISSION)) return true;
  return Boolean(await getDatabase().staffPermissionGrant.findUnique({ where: { userId_permission: { userId: actor.id, permission: PERMISSION } }, select: { id: true } }));
}
async function assertPublisher(actor: Moderator) {
  if (!(await canPublish(actor))) throw new DealError("You do not have permission to manage announcements.", 403);
}

const inputSchema = z.object({
  title: z.string().trim().min(5, "Give the announcement a title (at least 5 characters).").max(200),
  bodyHtml: z.string().min(1, "Write the announcement.").max(60_000),
}).strict();
const editSchema = inputSchema.extend({ version: z.number().int().positive() });

function prepare(bodyHtml: string) {
  const { html, text } = prepareRichBody(bodyHtml);
  if (text.length < 10) throw new DealError("Write a little more: the announcement is too short.", 400);
  if (text.length > 8_000) throw new DealError("The announcement is too long (8,000 characters at most).", 400);
  return { html, text };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>["$transaction"]>[0]>[0];
/** Every change is written to the audit log with the real staff member, in the same transaction as the change. */
const audit = (tx: Tx, actor: Moderator, action: string, announcement: { id: string; title: string; slug: string }, extra: Record<string, unknown> = {}) =>
  tx.auditEvent.create({ data: { actorId: actor.id, action: `announcement.${action}`, targetId: announcement.id, success: true, metadata: { title: announcement.title, slug: announcement.slug, ...extra } } });

// ---------- staff side ----------
export async function listAnnouncementsAdmin(actor: Moderator) {
  await assertPublisher(actor);
  const rows = await getDatabase().forumAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, slug: true, title: true, body: true, bodyHtml: true, status: true, version: true, publishedAt: true, createdAt: true, updatedAt: true, createdBy: { select: { email: true, name: true } }, publishedBy: { select: { email: true, name: true } } } });
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}

export async function createAnnouncement(actor: Moderator, raw: unknown) {
  await assertPublisher(actor);
  const input = inputSchema.parse(raw);
  const { html, text } = prepare(input.bodyHtml);
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const row = await tx.forumAnnouncement.create({ data: { slug: `${slugify(input.title)}-${randomBytes(3).toString("hex")}`, title: input.title, body: text, bodyHtml: html, createdById: actor.id }, select: { id: true, slug: true, title: true, version: true, status: true } });
    await audit(tx, actor, "create", row);
    return row;
  });
}

export async function updateAnnouncement(actor: Moderator, id: string, raw: unknown) {
  await assertPublisher(actor);
  const input = editSchema.parse(raw);
  const { html, text } = prepare(input.bodyHtml);
  return getDatabase().$transaction(async (tx) => {
    const changed = await tx.forumAnnouncement.updateMany({ where: { id, version: input.version }, data: { title: input.title, body: text, bodyHtml: html, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError((await tx.forumAnnouncement.findUnique({ where: { id }, select: { id: true } })) ? "This announcement changed. Reload and try again." : "Announcement not found.", 409);
    const row = await tx.forumAnnouncement.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true, title: true, version: true, status: true } });
    await audit(tx, actor, "edit", row, { version: row.version, wasPublished: row.status === "PUBLISHED" });
    return row;
  });
}

/** Publishing makes it public and tells every member once. Publishing again after unpublishing tells them again only if they had not got it. */
export async function publishAnnouncement(actor: Moderator, id: string) {
  await assertPublisher(actor);
  const db = getDatabase();
  const row = await db.$transaction(async (tx) => {
    const changed = await tx.forumAnnouncement.updateMany({ where: { id, status: { in: ["DRAFT", "UNPUBLISHED"] } }, data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: actor.id, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("This announcement is already published or no longer exists.", 409);
    const r = await tx.forumAnnouncement.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true, title: true } });
    await audit(tx, actor, "publish", r);
    return r;
  });
  await fanOut(row).catch((error) => logger.warn({ event: "announcement.notify_failed", message: error instanceof Error ? error.message : "unknown" }, "announcement notices could not all be created"));
  return row;
}

export async function unpublishAnnouncement(actor: Moderator, id: string) {
  await assertPublisher(actor);
  const db = getDatabase();
  const row = await db.$transaction(async (tx) => {
    const changed = await tx.forumAnnouncement.updateMany({ where: { id, status: "PUBLISHED" }, data: { status: "UNPUBLISHED", version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("Only a published announcement can be unpublished.", 409);
    const r = await tx.forumAnnouncement.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true, title: true } });
    await audit(tx, actor, "unpublish", r);
    return r;
  });
  await db.forumNotification.deleteMany({ where: { type: "ANNOUNCEMENT", postId: id } });
  return row;
}

export async function deleteAnnouncement(actor: Moderator, id: string) {
  await assertPublisher(actor);
  const db = getDatabase();
  await db.$transaction(async (tx) => {
    const r = await tx.forumAnnouncement.findUnique({ where: { id }, select: { id: true, slug: true, title: true, status: true } });
    if (!r) throw new DealError("Announcement not found.", 404);
    await tx.forumAnnouncement.delete({ where: { id } });
    await audit(tx, actor, "delete", r, { wasPublished: r.status === "PUBLISHED" });
  });
  await db.forumNotification.deleteMany({ where: { type: "ANNOUNCEMENT", postId: id } });
  return { deleted: true };
}

/** One notice per member, created in small batches. */
async function fanOut(a: { id: string; slug: string; title: string }) {
  const db = getDatabase();
  await db.forumNotification.deleteMany({ where: { type: "ANNOUNCEMENT", postId: a.id } });
  let cursor: string | undefined;
  for (;;) {
    const members = await db.forumProfile.findMany({ select: { id: true }, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (!members.length) break;
    await db.forumNotification.createMany({ data: members.map((m) => ({ recipientId: m.id, type: "ANNOUNCEMENT", postId: a.id, postSlug: a.slug.slice(0, 120), postTitle: a.title.slice(0, 200) })) });
    cursor = members[members.length - 1].id;
    if (members.length < 500) break;
  }
}

// ---------- explicit grants (SUPER_ADMIN only) ----------
export async function listPublishers(actor: Moderator) {
  if (!roleCan(actor.role, "security:manage")) throw new DealError("Only a super admin manages who can publish.", 403);
  const staff = await getDatabase().user.findMany({ where: { status: "ACTIVE" }, orderBy: { email: "asc" }, select: { id: true, email: true, name: true, role: true, permissionGrants: { where: { permission: PERMISSION }, select: { id: true } } } });
  return staff.map((s) => ({ id: s.id, email: s.email, name: s.name, role: s.role, byRole: roleCan(s.role as Moderator["role"], PERMISSION), granted: s.permissionGrants.length > 0 }));
}

export async function setPublisherGrant(actor: Moderator, userId: string, granted: boolean) {
  if (!roleCan(actor.role, "security:manage")) throw new DealError("Only a super admin manages who can publish.", 403);
  const db = getDatabase();
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  if (!target) throw new DealError("Staff member not found.", 404);
  await db.$transaction(async (tx) => {
    if (granted) await tx.staffPermissionGrant.upsert({ where: { userId_permission: { userId, permission: PERMISSION } }, create: { userId, permission: PERMISSION, grantedById: actor.id }, update: {} });
    else await tx.staffPermissionGrant.deleteMany({ where: { userId, permission: PERMISSION } });
    await tx.auditEvent.create({ data: { actorId: actor.id, action: granted ? "announcement.grant" : "announcement.revoke", targetId: userId, success: true, metadata: { permission: PERMISSION } } });
  });
  return { userId, granted };
}

// ---------- public side: the staff member is never part of what leaves the server ----------
const publicShape = (r: { slug: string; title: string; body: string; bodyHtml: string | null; publishedAt: Date | null }) => ({
  slug: r.slug, title: r.title, body: r.body, bodyHtml: r.bodyHtml ? sanitizeRichHtml(r.bodyHtml) : null,
  publishedAt: r.publishedAt?.toISOString() ?? null, author: { name: OFFICIAL_AUTHOR, official: true as const },
});

export async function listPublicAnnouncements(limit = 10, page = 1) {
  assertCommunityEnabled();
  const db = getDatabase();
  const where = { status: "PUBLISHED" } as const;
  const [rows, total] = await Promise.all([
    db.forumAnnouncement.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], skip: (Math.max(page, 1) - 1) * limit, take: limit, select: { slug: true, title: true, body: true, bodyHtml: true, publishedAt: true } }),
    db.forumAnnouncement.count({ where }),
  ]);
  return { items: rows.map(publicShape), total };
}

export async function getPublicAnnouncement(slug: string) {
  assertCommunityEnabled();
  const row = await getDatabase().forumAnnouncement.findFirst({ where: { slug, status: "PUBLISHED" }, select: { slug: true, title: true, body: true, bodyHtml: true, publishedAt: true } });
  return row ? publicShape(row) : null;
}

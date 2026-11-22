import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma-mariadb/client";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "@/server/auth/audit";
import { roleCan, type AdminRole } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";

export const PAGE_SIZE = 25;

/** Only Super Administrators and Administrators see people's details. Editors and moderators do not. */
export function assertCanViewUsers(role: AdminRole) {
  if (!roleCan(role, "users:view")) throw new DealError("Permission denied.", 403);
}

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  q: z.string().trim().max(80).default(""),
  days: z.coerce.number().int().refine((d) => [1, 7, 30, 90].includes(d)).default(7),
});
export const parseUsersQuery = (url: string) => querySchema.parse(Object.fromEntries(new URL(url).searchParams));

type MemberSource = {
  id: string; name: string; email: string; createdAt: Date; emailVerifiedAt: Date | null; disabledAt: Date | null; passwordHash: string | null;
  identities: { provider: string }[]; forumProfile: { handle: string; lastSeenAt: Date | null; status: string } | null;
  _count: { dealComments: number; dealVotes: number; savedDeals: number; submissions: number };
};

/** What the list shows about a registered member. Passwords, dates of birth, sex and location are never part of it. */
export function toMemberRow(m: MemberSource) {
  const methods = [...(m.passwordHash ? ["Email and password"] : []), ...m.identities.map((i) => (i.provider === "google" ? "Google" : i.provider === "apple" ? "Apple" : i.provider))];
  return {
    id: m.id, name: m.name, email: m.email, handle: m.forumProfile?.handle ?? null, joinedAt: m.createdAt.toISOString(),
    lastSeenAt: m.forumProfile?.lastSeenAt?.toISOString() ?? null, emailVerified: Boolean(m.emailVerifiedAt),
    status: m.disabledAt ? "Disabled" : m.forumProfile && m.forumProfile.status !== "ACTIVE" ? m.forumProfile.status.toLowerCase() : "Active",
    signInMethods: [...new Set(methods)], comments: m._count.dealComments, votes: m._count.dealVotes, saved: m._count.savedDeals, submissions: m._count.submissions,
  };
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Ids of members whose name, email or user name contains the text. MariaDB on the staging host needs a plain LIKE (see like-search.ts). */
async function matchingMemberIds(text: string): Promise<string[]> {
  const db = getDatabase();
  if ((process.env.DATABASE_URL ?? "").startsWith("mysql:")) {
    const p = `%${escapeLike(text)}%`;
    const rows = await (db as unknown as { $queryRaw: <T>(q: Prisma.Sql) => Promise<T> }).$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT c.id FROM Customer c LEFT JOIN ForumProfile f ON f.customerId = c.id WHERE c.email LIKE ${p} OR c.name LIKE ${p} OR f.handle LIKE ${p} LIMIT 500`,
    );
    return rows.map((r) => r.id);
  }
  const rows = await db.customer.findMany({ where: { OR: [{ email: { contains: text } }, { name: { contains: text } }, { forumProfile: { handle: { contains: text } } }] }, select: { id: true }, take: 500 });
  return rows.map((r) => r.id);
}

export async function listMembers(actor: { id: string; role: AdminRole }, query: { page: number; q: string }) {
  assertCanViewUsers(actor.role);
  const db = getDatabase();
  const ids = query.q ? await matchingMemberIds(query.q) : null;
  const where = ids ? { id: { in: ids } } : {};
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, name: true, email: true, createdAt: true, emailVerifiedAt: true, disabledAt: true, passwordHash: true,
        identities: { select: { provider: true } }, forumProfile: { select: { handle: true, lastSeenAt: true, status: true } },
        _count: { select: { dealComments: true, dealVotes: true, savedDeals: true, submissions: true } },
      },
    }),
  ]);
  // Looking at people's details is itself recorded; the search text is not stored because it may be an email address.
  await writeAudit({ actorId: actor.id, action: "users.members.viewed", success: true, metadata: { page: query.page, searched: Boolean(query.q), rows: rows.length } });
  return { data: rows.map(toMemberRow), page: query.page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/**
 * Visits by people who are not signed in. Nothing here identifies a person: there is no name, email or address.
 * Only visitors who pressed Accept on the cookie banner are counted, and "visitor" is a scrambled code from their browser cookie.
 */
export async function listVisitors(actor: { id: string; role: AdminRole }, query: { page: number; days: number }) {
  assertCanViewUsers(actor.role);
  const db = getDatabase();
  const since = new Date(Date.now() - query.days * 86_400_000);
  const where = { startedAt: { gte: since }, customerId: null };
  const [total, signedIn, unique, rows] = await Promise.all([
    db.analyticsSession.count({ where }),
    db.analyticsSession.count({ where: { startedAt: { gte: since }, customerId: { not: null } } }),
    db.analyticsSession.groupBy({ by: ["visitorKey"], where: { ...where, visitorKey: { not: null } } }).then((g) => g.length),
    db.analyticsSession.findMany({
      where, orderBy: { startedAt: "desc" }, skip: (query.page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { id: true, startedAt: true, lastSeenAt: true, pageCount: true, activeSeconds: true, entryPath: true, exitPath: true, referrerHost: true, channel: true, utmSource: true, deviceType: true, browser: true, os: true, returning: true, visitorKey: true },
    }),
  ]);
  return {
    data: rows.map((s) => ({
      id: s.id, startedAt: s.startedAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), pages: s.pageCount, seconds: s.activeSeconds, entry: s.entryPath, exit: s.exitPath,
      source: s.utmSource ?? s.referrerHost ?? s.channel ?? "Direct", device: s.deviceType, browser: s.browser, os: s.os, returning: s.returning, visitor: s.visitorKey ? s.visitorKey.slice(0, 6) : null,
    })),
    summary: { days: query.days, anonymousVisits: total, signedInVisits: signedIn, uniqueTrackedVisitors: unique },
    page: query.page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

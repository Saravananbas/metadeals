import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { hashPassword, verifyPassword, validatePassword } from "@/server/auth/crypto";
import { listingSchema } from "@/features/deals/validation";
import { publicWhere } from "@/server/deals/repository";
import { communityEnabled } from "@/server/community/config";
import { ensureProfile } from "@/server/community/service";
import { getBadgeBoard } from "@/server/badges/counts";
import { CustomerError, limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";

export const FREQUENCIES = ["IMMEDIATE", "DAILY", "WEEKLY", "OFF"] as const;

/**
 * How each number is counted (all from existing rows, for this member only, never from the request):
 * - submitted: the member's deal submissions (history is never removed when a deal expires).
 * - approved: submissions a moderator approved.
 * - live: approved submissions whose deal is published right now.
 * - views: the stored view counter of those deals, each deal once (a submission owns at most one deal).
 * - helpfulVotes: likes other members gave the member's published posts and comments (their own likes are not counted).
 * - badges: how many badge tiers are unlocked (see src/server/badges/counts.ts); filled in by getDashboard.
 */
export async function getStats(customerId: string) {
  const db = getDatabase();
  const mine = { customerId };
  const profile = communityEnabled() ? await db.forumProfile.findUnique({ where: { customerId }, select: { id: true } }) : null;
  const [submitted, approved, live, views, postLikes, commentLikes] = await Promise.all([
    db.communityDealSubmission.count({ where: mine }),
    db.communityDealSubmission.count({ where: { ...mine, status: "APPROVED" } }),
    db.communityDealSubmission.count({ where: { ...mine, status: "APPROVED", deal: { is: { status: "PUBLISHED" } } } }),
    db.deal.aggregate({ _sum: { viewCount: true }, where: { communitySubmission: { is: { customerId } } } }),
    profile ? db.forumPostLike.count({ where: { post: { authorId: profile.id, status: "PUBLISHED" }, profileId: { not: profile.id } } }) : 0,
    profile ? db.forumCommentLike.count({ where: { comment: { authorId: profile.id, status: "PUBLISHED" }, profileId: { not: profile.id } } }) : 0,
  ]);
  return { submitted, approved, live, views: views._sum.viewCount ?? 0, helpfulVotes: postLikes + commentLikes, badges: 0 };
}

export async function getPreferences(customerId: string) {
  const row = await getDatabase().customerPreference.findUnique({ where: { customerId } });
  return {
    dealAlerts: row?.dealAlerts ?? true,
    emailUpdates: row?.emailUpdates ?? true,
    frequency: (FREQUENCIES as readonly string[]).includes(row?.frequency ?? "") ? (row!.frequency as (typeof FREQUENCIES)[number]) : "IMMEDIATE",
    categorySlugs: row?.categorySlugs ? row.categorySlugs.split(",").filter(Boolean) : [],
  };
}

const preferenceSchema = z.object({
  dealAlerts: z.boolean().optional(),
  emailUpdates: z.boolean().optional(),
  frequency: z.enum(FREQUENCIES).optional(),
  categorySlugs: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).strict();

/** Only the fields sent are changed; categories must exist. */
export async function updatePreferences(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`preferences:${customer.id}`, 40, 3600);
  const input = preferenceSchema.parse(raw);
  const db = getDatabase();
  let categorySlugs: string | null | undefined;
  if (input.categorySlugs) {
    const slugs = [...new Set(input.categorySlugs)];
    const known = slugs.length ? await db.category.findMany({ where: { slug: { in: slugs } }, select: { slug: true } }) : [];
    if (known.length !== slugs.length) throw new CustomerError("One of the chosen categories does not exist.");
    categorySlugs = slugs.length ? slugs.join(",") : null;
  }
  const data = { ...(input.dealAlerts === undefined ? {} : { dealAlerts: input.dealAlerts }), ...(input.emailUpdates === undefined ? {} : { emailUpdates: input.emailUpdates }), ...(input.frequency ? { frequency: input.frequency } : {}), ...(categorySlugs === undefined ? {} : { categorySlugs }) };
  await db.customerPreference.upsert({ where: { customerId: customer.id }, create: { customerId: customer.id, ...data }, update: data });
  return getPreferences(customer.id);
}

export async function getDashboard(customerId: string) {
  const customer = await assertActiveCustomer(customerId);
  const db = getDatabase();
  const row = await db.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { name: true, email: true, emailVerifiedAt: true, sex: true, dateOfBirth: true, location: true, createdAt: true, passwordHash: true, forumProfile: { select: { handle: true, displayName: true, bio: true, location: true, avatarKey: true, verifiedAt: true } } } });
  const forum = communityEnabled() ? await ensureProfile(customer.id).then((p) => ({ handle: p.handle, displayName: p.displayName, bio: p.bio, location: p.location, hasAvatar: Boolean(p.avatarKey), verified: Boolean(p.verifiedAt) })).catch(() => null) : null;
  const profileId = forum ? (await db.forumProfile.findUnique({ where: { customerId: customer.id }, select: { id: true } }))?.id : undefined;
  const [stats, badgeBoard, preferences, posts, comments, unread] = await Promise.all([
    getStats(customer.id),
    getBadgeBoard(customer.id),
    getPreferences(customer.id),
    profileId ? db.forumPost.count({ where: { authorId: profileId, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } } }) : 0,
    profileId ? db.forumComment.count({ where: { authorId: profileId, status: "PUBLISHED" } }) : 0,
    profileId ? db.forumNotification.count({ where: { recipientId: profileId, readAt: null } }) : 0,
  ]);
  const days = Math.max(0, Math.floor((Date.now() - row.createdAt.getTime()) / 86_400_000));
  return {
    account: { name: row.name, email: row.email, emailVerified: Boolean(row.emailVerifiedAt), hasPassword: Boolean(row.passwordHash), sex: row.sex, dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null, location: row.forumProfile?.location ?? row.location, memberSince: row.createdAt.toISOString(), daysSinceJoining: days },
    forum, stats: { ...stats, badges: badgeBoard.earned }, badgeBoard, preferences, unreadNotifications: unread,
    highlights: { daysSinceJoining: days, discussions: posts, comments, dealsContributed: stats.submitted },
  };
}

const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(1).max(128) }).strict();

/** Requires the current password. A new password ends every native-app sign-in. Browser sessions are stateless tokens and expire on their own. */
export async function changePassword(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`password-change:${customer.id}`, 5, 3600);
  const input = passwordSchema.parse(raw);
  const db = getDatabase();
  const row = await db.customer.findUniqueOrThrow({ where: { id: customer.id }, select: { passwordHash: true, email: true } });
  if (!row.passwordHash) throw new CustomerError("This account signs in with Google or Apple and has no password yet. Use Forgot password on the sign-in page to set one.");
  if (!(await verifyPassword(row.passwordHash, input.currentPassword))) throw new CustomerError("Your current password is not correct.", 403);
  const policy = validatePassword(input.newPassword, row.email);
  if (policy) throw new CustomerError(policy);
  if (input.newPassword === input.currentPassword) throw new CustomerError("Choose a password you have not used just now.");
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction([
    db.customer.update({ where: { id: customer.id }, data: { passwordHash } }),
    db.customerAppToken.updateMany({ where: { customerId: customer.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { changed: true };
}

const dealIdSchema = z.object({ dealId: z.string().trim().min(1).max(191) }).strict();

export async function listSavedDeals(customerId: string) {
  const customer = await assertActiveCustomer(customerId);
  const rows = await getDatabase().savedDeal.findMany({
    where: { customerId: customer.id, deal: { is: publicWhere(listingSchema.parse({})) } },
    orderBy: { createdAt: "desc" }, take: 100,
    select: { createdAt: true, deal: { select: { id: true, slug: true, title: true, priceMinor: true, mrpMinor: true, status: true, mediaId: true, merchant: { select: { name: true } } } } },
  });
  return rows.map((r) => ({ id: r.deal.id, slug: r.deal.slug, title: r.deal.title, merchant: r.deal.merchant.name, priceMinor: r.deal.priceMinor, mrpMinor: r.deal.mrpMinor, expired: r.deal.status === "EXPIRED", image: `/api/v1/media/${r.deal.mediaId}`, savedAt: r.createdAt.toISOString() }));
}

/** Only deals anyone can see can be saved; saving twice is harmless. */
export async function saveDeal(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`saved-deals:${customer.id}`, 120, 3600);
  const { dealId } = dealIdSchema.parse(raw);
  const db = getDatabase();
  const deal = await db.deal.findFirst({ where: { AND: [publicWhere(listingSchema.parse({})), { OR: [{ id: dealId }, { slug: dealId }] }] }, select: { id: true } });
  if (!deal) throw new CustomerError("That deal could not be found.", 404);
  if ((await db.savedDeal.count({ where: { customerId: customer.id } })) >= 500) throw new CustomerError("You have reached the saved deals limit. Remove some first.");
  await db.savedDeal.upsert({ where: { customerId_dealId: { customerId: customer.id, dealId: deal.id } }, create: { customerId: customer.id, dealId: deal.id }, update: {} });
  return { saved: true };
}

export async function removeSavedDeal(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  const { dealId } = dealIdSchema.parse(raw);
  const done = await getDatabase().savedDeal.deleteMany({ where: { customerId: customer.id, OR: [{ dealId }, { deal: { is: { slug: dealId } } }] } });
  return { removed: done.count };
}

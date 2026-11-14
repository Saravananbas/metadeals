import "server-only";
import { usesMariaDb, searchPostIdsMariaDb } from "./like-search";
import { assertNotRestricted } from "./restrictions";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prepareRichBody, sanitizeRichHtml } from "./richtext";
import { notify } from "./notifications";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { assertActiveCustomer } from "@/server/customer/session";
import { canonicalProductUrl, hashProductUrl } from "@/server/customer/submissions";
import {
  commentEditSchema, commentInputSchema, feedQuerySchema, findUrls, forumProfileSchema, LIMITS, postEditSchema, postInputSchema, reportSchema, voteSchema,
} from "@/features/community/validation";
import { assertCommunityEnabled, assertWritesEnabled, EDIT_WINDOW_HOURS, isRetryableConflict, newAccountHours, withRetry } from "./config";

type Db = ReturnType<typeof getDatabase>;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const slugify = (title: string) => title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";

// ---------- public shapes (allowlists: nothing else ever leaves the server) ----------
export const postSelect = {
  id: true, slug: true, type: true, title: true, body: true, url: true, merchantName: true, priceMinor: true, mrpMinor: true, couponCode: true,
  status: true, locked: true, score: true, commentCount: true, viewCount: true, likeCount: true, bodyHtml: true, createdAt: true, publishedAt: true, editedAt: true, version: true, removalReason: true,
  community: { select: { slug: true, name: true } }, author: { select: { id: true, handle: true, avatarKey: true } },
  images: { orderBy: { position: "asc" }, select: { id: true, width: true, height: true } },
} as const;
type PostRow = Prisma.ForumPostGetPayload<{ select: typeof postSelect }>;

export type PostDto = ReturnType<typeof postDto>;
export function postDto(row: PostRow, viewer?: { vote: number; saved: boolean; mine: boolean; liked?: boolean }) {
  return {
    id: row.id, slug: row.slug, type: row.type, title: row.title, body: row.body, url: row.url, merchantName: row.merchantName,
    priceMinor: row.priceMinor, mrpMinor: row.mrpMinor, couponCode: row.couponCode, locked: row.locked, score: row.score, commentCount: row.commentCount, viewCount: row.viewCount, likeCount: row.likeCount, bodyHtml: row.bodyHtml,
    images: row.images.map((i) => ({ id: i.id, url: `/api/v1/community/images/${i.id}`, width: i.width, height: i.height })),
    createdAt: row.createdAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null, editedAt: row.editedAt?.toISOString() ?? null,
    community: row.community, author: { handle: row.author.handle, avatarUrl: row.author.avatarKey ? `/api/v1/avatars/${row.author.handle}` : null },
    // Always user-reported content; the price and link are not verified by MetaDeals4U.
    userReported: true,
    ...(viewer ? { viewer: { vote: viewer.vote, saved: viewer.saved, liked: viewer.liked ?? false, mine: viewer.mine, canEdit: viewer.mine && editable({ status: row.status, locked: row.locked, createdAt: row.createdAt }), version: row.version, status: row.status, removalReason: viewer.mine ? row.removalReason : null } } : {}),
  };
}

const commentSelect = {
  id: true, postId: true, parentId: true, depth: true, body: true, bodyHtml: true, likeCount: true, status: true, score: true, createdAt: true, editedAt: true, version: true,
  author: { select: { id: true, handle: true, avatarKey: true } },
} as const;
type CommentRow = Prisma.ForumCommentGetPayload<{ select: typeof commentSelect }>;
function commentDto(row: CommentRow, viewerId?: string, vote = 0, liked = false) {
  const hidden = row.status !== "PUBLISHED";
  return {
    id: row.id, parentId: row.parentId, depth: row.depth, createdAt: row.createdAt.toISOString(), editedAt: row.editedAt?.toISOString() ?? null, score: row.score, likeCount: row.likeCount,
    status: row.status === "PUBLISHED" ? "PUBLISHED" : row.status === "DELETED" ? "DELETED" : "REMOVED",
    body: hidden ? null : row.body, bodyHtml: hidden || !row.bodyHtml ? null : sanitizeRichHtml(row.bodyHtml), author: hidden ? null : { handle: row.author.handle, avatarUrl: row.author.avatarKey ? `/api/v1/avatars/${row.author.handle}` : null },
    viewer: viewerId ? { mine: row.author.id === viewerId, vote, liked, version: row.version, canEdit: row.author.id === viewerId && row.status === "PUBLISHED" && Date.now() - row.createdAt.getTime() < EDIT_WINDOW_HOURS * 3_600_000 } : undefined,
  };
}

// ---------- profile and account gates ----------
function newHandle() { return "member-" + randomBytes(3).toString("hex"); }

export async function ensureProfile(customerId: string, db: Db = getDatabase()) {
  const existing = await db.forumProfile.findUnique({ where: { customerId } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.forumProfile.create({ data: { customerId, handle: newHandle() } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      const again = await db.forumProfile.findUnique({ where: { customerId } });
      if (again) return again;
    }
  }
  throw new CustomerError("Could not create your community profile. Please try again.", 503);
}

/** Verified, active customer whose community access is not suspended. Authentication alone is never enough. */
export async function writableProfile(customerId: string, options: { posting?: boolean } = {}) {
  assertWritesEnabled();
  const customer = await assertActiveCustomer(customerId);
  const row = await getDatabase().customer.findUniqueOrThrow({ where: { id: customer.id }, select: { createdAt: true } });
  const profile = await ensureProfile(customer.id);
  const suspended = profile.status === "SUSPENDED" && (!profile.suspendedUntil || profile.suspendedUntil > new Date());
  if (suspended) throw new CustomerError(profile.suspendedUntil ? `Your community access is paused until ${profile.suspendedUntil.toLocaleDateString("en-IN")}.` : "Your community access is paused.", 403);
  // Publishing paths (new discussion, comment, reply, and edits of them) also honour a moderator's time-limited posting restriction.
  if (options.posting) await assertNotRestricted(profile.id);
  return { profile, accountAgeHours: (Date.now() - row.createdAt.getTime()) / 3_600_000 };
}

async function viewerProfileId(customerId?: string | null) {
  if (!customerId) return undefined;
  return (await getDatabase().forumProfile.findUnique({ where: { customerId }, select: { id: true } }))?.id;
}

// ---------- cursors ----------
const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
function decodeCursor<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T; } catch { return null; }
}

// ---------- reads ----------
let lastCategorySync = 0;
/** Every shop category gets a discussion community (existing ones, including deactivated ones, are left alone). Runs at most once a minute per server. */
async function syncCategoryCommunities(db: ReturnType<typeof getDatabase>) {
  if (Date.now() - lastCategorySync < 60_000) return;
  lastCategorySync = Date.now();
  const categories = await db.category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } });
  const data = categories.map((c, i) => ({ slug: c.slug.slice(0, 40).replace(/-+$/, ""), name: c.name.slice(0, 60), description: `Discuss ${c.name} deals, products and questions.`.slice(0, 300), sortOrder: 100 + i })).filter((c) => c.slug.length >= 2);
  if (data.length) await db.forumCommunity.createMany({ data, skipDuplicates: true });
  // The five general discussion areas shown first in the sidebar (rows only, no schema change). Announcements goes through review so only approved posts appear.
  await db.forumCommunity.createMany({ data: CURATED_COMMUNITIES.map((c, i) => ({ ...c, sortOrder: i + 1 })), skipDuplicates: true });
}
export const CURATED_COMMUNITIES = [
  { slug: "announcements", name: "Announcements", description: "News and updates from the MetaDeals4U team.", requiresReview: true },
  { slug: "deals-discussions", name: "Deals Discussions", description: "Talk about deals, offers and prices.", requiresReview: false },
  { slug: "help-support", name: "Help & Support", description: "Ask for help using MetaDeals4U or shopping online.", requiresReview: false },
  { slug: "feedback-ideas", name: "Feedback & Ideas", description: "Tell us what to improve and what to build next.", requiresReview: false },
  { slug: "off-topic", name: "Off Topic / General", description: "Everything else shoppers like to talk about.", requiresReview: false },
] as const;

export async function listCommunities(customerId?: string | null) {
  assertCommunityEnabled();
  const db = getDatabase();
  await syncCategoryCommunities(db).catch(() => { lastCategorySync = 0; });
  const me = await viewerProfileId(customerId);
  const [rows, counts, follows] = await Promise.all([
    db.forumCommunity.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, description: true } }),
    db.forumPost.groupBy({ by: ["communityId"], where: { status: "PUBLISHED" }, _count: { _all: true } }),
    me ? db.forumFollow.findMany({ where: { profileId: me }, select: { communityId: true } }) : Promise.resolve([]),
  ]);
  const count = new Map(counts.map((c) => [c.communityId, c._count._all])), followed = new Set(follows.map((f) => f.communityId));
  return rows.map((c) => ({ slug: c.slug, name: c.name, description: c.description, postCount: count.get(c.id) ?? 0, following: followed.has(c.id) }));
}

export async function getCommunity(slug: string, customerId?: string | null) {
  const all = await listCommunities(customerId);
  const found = all.find((c) => c.slug === slug.toLowerCase());
  if (!found) throw new CustomerError("Community not found.", 404);
  return found;
}

type FeedCursor = { p: string; s?: number; i: string };

export async function listFeed(rawQuery: unknown, customerId?: string | null) {
  assertCommunityEnabled();
  const q = feedQuerySchema.parse(rawQuery);
  const db = getDatabase();
  const me = await viewerProfileId(customerId);
  const cursor = decodeCursor<FeedCursor>(q.cursor);
  const since = q.sort === "top" && q.window !== "all" ? new Date(Date.now() - { day: 1, week: 7, month: 30 }[q.window] * 86_400_000) : undefined;

  const where: Prisma.ForumPostWhereInput = {
    status: "PUBLISHED", community: { isActive: true, ...(q.community ? { slug: q.community } : {}) }, ...(q.type ? { type: q.type } : {}),
    ...(since ? { publishedAt: { gte: since } } : {}),
  };
  if (cursor) {
    const at = new Date(cursor.p);
    where.AND = q.sort === "new"
      ? [{ OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: cursor.i } }] }]
      : [{ OR: [{ score: { lt: cursor.s ?? 0 } }, { score: cursor.s ?? 0, publishedAt: { lt: at } }, { score: cursor.s ?? 0, publishedAt: at, id: { lt: cursor.i } }] }];
  }
  const rows = await db.forumPost.findMany({
    where, take: q.limit + 1, select: postSelect,
    orderBy: q.sort === "new" ? [{ publishedAt: "desc" }, { id: "desc" }] : [{ score: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  const states = await viewerStates(db, me, page.map((p) => p.id));
  return {
    items: page.map((row) => postDto(row, me ? { ...(states.get(row.id) ?? { vote: 0, saved: false }), mine: row.author.id === me } : undefined)),
    nextCursor: rows.length > q.limit && last ? encodeCursor({ p: last.publishedAt?.toISOString() ?? "", s: last.score, i: last.id } satisfies FeedCursor) : null,
  };
}

async function viewerStates(db: Db, me: string | undefined, postIds: string[]) {
  const states = new Map<string, { vote: number; saved: boolean; liked: boolean }>();
  if (!me || !postIds.length) return states;
  const [votes, saves, likes] = await Promise.all([
    db.forumPostVote.findMany({ where: { profileId: me, postId: { in: postIds } }, select: { postId: true, value: true } }),
    db.forumSave.findMany({ where: { profileId: me, postId: { in: postIds } }, select: { postId: true } }),
    db.forumPostLike.findMany({ where: { profileId: me, postId: { in: postIds } }, select: { postId: true } }),
  ]);
  for (const id of postIds) states.set(id, { vote: 0, saved: false, liked: false });
  for (const l of likes) states.get(l.postId)!.liked = true;
  for (const v of votes) states.get(v.postId)!.vote = v.value;
  for (const s of saves) states.get(s.postId)!.saved = true;
  return states;
}

/** Published posts are public. An author can also open their own post while it is waiting for review. */
export async function getPost(ref: string, customerId?: string | null) {
  assertCommunityEnabled();
  const db = getDatabase();
  const me = await viewerProfileId(customerId);
  const row = await db.forumPost.findFirst({
    where: {
      community: { isActive: true },
      AND: [{ OR: [{ slug: ref }, { id: ref }] }, me ? { OR: [{ status: "PUBLISHED" }, { status: "PENDING_REVIEW", authorId: me }] } : { status: "PUBLISHED" }],
    },
    select: postSelect,
  });
  if (!row) throw new CustomerError("Post not found.", 404);
  const states = await viewerStates(db, me, [row.id]);
  return postDto(row, me ? { ...(states.get(row.id) ?? { vote: 0, saved: false }), mine: row.author.id === me } : undefined);
}

export const COMMENT_SORTS = ["newest", "oldest", "liked", "upvoted"] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];

export async function listComments(ref: string, rawCursor: string | undefined, customerId?: string | null, sort: CommentSort = "oldest") {
  assertCommunityEnabled();
  const db = getDatabase();
  const me = await viewerProfileId(customerId);
  const post = await db.forumPost.findFirst({ where: { OR: [{ slug: ref }, { id: ref }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true } });
  if (!post) throw new CustomerError("Post not found.", 404);
  const cursor = decodeCursor<{ t?: string; i?: string; o?: number }>(rawCursor);
  const take = 20;
  // "oldest" pages by position in time; the other orders page by offset (ties are broken by id so pages never repeat).
  const keyset = sort === "oldest" && cursor?.t && cursor.i;
  const offset = !keyset && typeof cursor?.o === "number" ? Math.max(0, Math.min(cursor.o, 1000)) : 0;
  const order = sort === "newest" ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
    : sort === "liked" ? [{ likeCount: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
    : sort === "upvoted" ? [{ score: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }]
    : [{ createdAt: "asc" as const }, { id: "asc" as const }];
  const top = await db.forumComment.findMany({
    where: { postId: post.id, parentId: null, ...(keyset ? { OR: [{ createdAt: { gt: new Date(cursor!.t!) } }, { createdAt: new Date(cursor!.t!), id: { gt: cursor!.i! } }] } : {}) },
    orderBy: order, skip: offset, take: take + 1, select: commentSelect,
  });
  const page = top.slice(0, take);
  // Replies up to the maximum depth, loaded in two bounded queries (no per-comment lookups).
  const level1 = page.length ? await db.forumComment.findMany({ where: { parentId: { in: page.map((c) => c.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200, select: commentSelect }) : [];
  const level2 = level1.length ? await db.forumComment.findMany({ where: { parentId: { in: level1.map((c) => c.id) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200, select: commentSelect }) : [];
  const all = [...page, ...level1, ...level2];
  const votes = me && all.length ? await db.forumCommentVote.findMany({ where: { profileId: me, commentId: { in: all.map((c) => c.id) } }, select: { commentId: true, value: true } }) : [];
  const voteOf = new Map(votes.map((v) => [v.commentId, v.value]));
  const likes = me && all.length ? await db.forumCommentLike.findMany({ where: { profileId: me, commentId: { in: all.map((c) => c.id) } }, select: { commentId: true } }) : [];
  const likedSet = new Set(likes.map((l) => l.commentId));
  const last = page[page.length - 1];
  return {
    items: all.map((c) => commentDto(c, me, voteOf.get(c.id) ?? 0, likedSet.has(c.id))),
    nextCursor: top.length > take && last ? encodeCursor(sort === "oldest" ? { t: last.createdAt.toISOString(), i: last.id } : { o: offset + take }) : null,
  };
}

export async function getPublicProfile(handle: string) {
  assertCommunityEnabled();
  const db = getDatabase();
  const profile = await db.forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true, handle: true, bio: true, createdAt: true } });
  if (!profile) throw new CustomerError("Member not found.", 404);
  const [postCount, commentCount, posts] = await Promise.all([
    db.forumPost.count({ where: { authorId: profile.id, status: "PUBLISHED" } }),
    db.forumComment.count({ where: { authorId: profile.id, status: "PUBLISHED" } }),
    db.forumPost.findMany({ where: { authorId: profile.id, status: "PUBLISHED", community: { isActive: true } }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 20, select: postSelect }),
  ]);
  // Only these fields: never email, name, birth date, sex, location, saves, reports or moderation notes.
  return { handle: profile.handle, bio: profile.bio, joined: profile.createdAt.toISOString().slice(0, 7), postCount, commentCount, posts: posts.map((p) => postDto(p)) };
}

// ---------- writes ----------
async function assertCommentLinkPolicy(body: string, accountAgeHours: number) {
  if (findUrls(body).length && accountAgeHours < newAccountHours()) throw new CustomerError("New accounts cannot add links yet. Please try again after your account is a day old.", 403);
}

export async function createPost(customerId: string, raw: unknown) {
  const { profile, accountAgeHours } = await writableProfile(customerId, { posting: true });
  // Text written in the editor is sanitized here; its plain text becomes `body`, which every other part of the community already uses.
  const rawObject = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rich = typeof rawObject.bodyHtml === "string" && rawObject.bodyHtml.trim() ? prepareRichBody(rawObject.bodyHtml) : null;
  if (rich && rich.text.length > LIMITS.richBody) throw new CustomerError(`Your post is too long (${rich.text.length} of ${LIMITS.richBody} characters).`, 400);
  const input = postInputSchema.parse(rich ? { ...rawObject, body: rich.text, bodyHtml: rich.html } : { ...rawObject, bodyHtml: undefined }); // invalid payloads do not use up the quota
  await limitCustomerRequests(`forum-post:${profile.id}`, 5, 3600);
  await limitCustomerRequests(`forum-post-day:${profile.id}`, 20, 86_400);
  const db = getDatabase();
  const community = await db.forumCommunity.findFirst({ where: { slug: input.communitySlug, isActive: true } });
  if (!community) throw new CustomerError("Community not found.", 404);
  // Members can never post as the official team: the announcements area is written by staff only (see announcements.ts).
  if (community.slug === "announcements") throw new CustomerError("Official announcements are posted by the MetaDeals4U Team only.", 403);

  const hasLink = Boolean(input.url) || findUrls(input.body).length > 0;
  const review = community.requiresReview || (hasLink && accountAgeHours < newAccountHours());
  const contentHash = sha([input.type, community.id, input.title.toLowerCase(), input.body.toLowerCase()].join("|"));
  const urlHash = input.url ? hashProductUrl(input.url) : null;

  if (await db.forumPost.findFirst({ where: { authorId: profile.id, contentHash, status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { id: true } })) {
    throw new CustomerError("You already shared this.", 409);
  }
  if (urlHash && input.type === "DEAL") {
    const dup = await db.forumPost.findFirst({ where: { urlHash, type: "DEAL", status: { in: ["PUBLISHED", "PENDING_REVIEW"] }, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }, select: { slug: true } });
    if (dup) throw new CustomerError("This link was already shared recently. Please join the existing discussion instead.", 409);
  }

  const { ownStagedImages, deleteDraft } = await import("./composer");
  const imageIds = await ownStagedImages(profile.id, input.imageIds ?? []);
  const now = new Date();
  const row = await db.$transaction(async (tx) => {
    const created = await tx.forumPost.create({
    data: {
      slug: `${slugify(input.title)}-${randomBytes(3).toString("hex")}`, communityId: community.id, authorId: profile.id, type: input.type, title: input.title, body: input.body,
      url: input.url ? canonicalProductUrl(input.url) : null, urlHash, merchantName: input.merchantName || null, priceMinor: input.priceMinor ?? null, mrpMinor: input.mrpMinor ?? null,
      couponCode: input.couponCode ? input.couponCode.toUpperCase() : null, contentHash, status: review ? "PENDING_REVIEW" : "PUBLISHED", publishedAt: review ? null : now,
      bodyHtml: rich ? rich.html : null, notifyReplies: Boolean(input.notifyReplies),
    },
    select: { id: true },
  });
    for (const [position, id] of imageIds.entries()) {
      const done = await tx.forumPostImage.updateMany({ where: { id, profileId: profile.id, postId: null }, data: { postId: created.id, position } });
      if (done.count !== 1) throw new CustomerError("One of the pictures is no longer available. Please add it again.", 409);
    }
    return tx.forumPost.findUniqueOrThrow({ where: { id: created.id }, select: postSelect });
  });
  await deleteDraft(customerId).catch(() => {});
  logger.info({ event: "community.post.created", postId: row.id, status: row.status }, "community post created");
  return postDto(row, { vote: 0, saved: false, mine: true });
}

const editable = (post: { status: string; locked: boolean; createdAt: Date }) =>
  ["PUBLISHED", "PENDING_REVIEW"].includes(post.status) && !post.locked && Date.now() - post.createdAt.getTime() < EDIT_WINDOW_HOURS * 3_600_000;

export async function editPost(customerId: string, ref: string, raw: unknown) {
  const { profile, accountAgeHours } = await writableProfile(customerId, { posting: true });
  const rawEdit = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const richEdit = typeof rawEdit.bodyHtml === "string" && rawEdit.bodyHtml.trim() ? prepareRichBody(rawEdit.bodyHtml) : null;
  if (richEdit && richEdit.text.length > LIMITS.richBody) throw new CustomerError(`Your post is too long (${richEdit.text.length} of ${LIMITS.richBody} characters).`, 400);
  const input = postEditSchema.parse(richEdit ? { ...rawEdit, body: richEdit.text, bodyHtml: richEdit.html } : rawEdit);
  const db = getDatabase();
  const current = await db.forumPost.findFirst({ where: { OR: [{ id: ref }, { slug: ref }], authorId: profile.id }, select: { id: true, status: true, locked: true, createdAt: true, title: true, body: true, communityId: true, type: true } });
  if (!current) throw new CustomerError("Post not found.", 404);
  if (!editable(current)) throw new CustomerError(`Posts can be edited for ${EDIT_WINDOW_HOURS} hours, unless they are locked or removed.`, 409);
  const body = input.body ?? current.body, title = input.title ?? current.title;
  if (findUrls(body).length > LIMITS.maxLinksPost) throw new CustomerError(`Use at most ${LIMITS.maxLinksPost} links in a post.`, 400);
  await assertCommentLinkPolicy(body, accountAgeHours);
  const changed = await db.forumPost.updateMany({
    where: { id: current.id, authorId: profile.id, version: input.version, locked: false, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } },
    data: { title, body, contentHash: sha([current.type, current.communityId, title.toLowerCase(), body.toLowerCase()].join("|")), editedAt: new Date(), version: { increment: 1 }, ...(input.bodyHtml !== undefined ? { bodyHtml: input.bodyHtml } : input.body !== undefined ? { bodyHtml: null } : {}) },
  });
  if (changed.count !== 1) throw new CustomerError("This post changed. Reload and try again.", 409);
  return getPost(current.id, customerId);
}

export async function deletePost(customerId: string, ref: string) {
  const { profile } = await writableProfile(customerId);
  const changed = await getDatabase().forumPost.updateMany({
    where: { OR: [{ id: ref }, { slug: ref }], authorId: profile.id, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } },
    data: { status: "DELETED", version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new CustomerError("Post not found.", 404);
  return { deleted: true };
}

export async function createComment(customerId: string, ref: string, raw: unknown) {
  const { profile, accountAgeHours } = await writableProfile(customerId, { posting: true });
  const rawObject = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rich = typeof rawObject.bodyHtml === "string" && rawObject.bodyHtml.trim() ? prepareRichBody(rawObject.bodyHtml) : null;
  if (rich && rich.text.length > LIMITS.richComment) throw new CustomerError(`Your comment is too long (${rich.text.length} of ${LIMITS.richComment} characters).`, 400);
  const input = commentInputSchema.parse(rich ? { ...rawObject, body: rich.text, bodyHtml: rich.html } : { ...rawObject, bodyHtml: undefined });
  await assertCommentLinkPolicy(input.body, accountAgeHours);
  await limitCustomerRequests(`forum-comment:${profile.id}`, 30, 3600);
  const db = getDatabase();
  const post = await db.forumPost.findFirst({ where: { OR: [{ id: ref }, { slug: ref }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true, locked: true, authorId: true, notifyReplies: true, slug: true, title: true } });
  if (!post) throw new CustomerError("Post not found.", 404);
  if (post.locked) throw new CustomerError("This discussion is locked.", 409);
  let depth = 0, parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await db.forumComment.findFirst({ where: { id: input.parentId, postId: post.id, status: "PUBLISHED" }, select: { depth: true, authorId: true } });
    parentAuthorId = parent?.authorId ?? null;
    if (!parent) throw new CustomerError("The comment you are replying to is not available.", 404);
    depth = parent.depth + 1;
    if (depth > LIMITS.maxCommentDepth) throw new CustomerError("Replies cannot be nested any deeper. Reply to the thread above instead.", 400);
  }
  const row = await withRetry(() => db.$transaction(async (tx) => {
    const comment = await tx.forumComment.create({ data: { postId: post.id, authorId: profile.id, parentId: input.parentId ?? null, depth, body: input.body, bodyHtml: rich ? rich.html : null }, select: commentSelect });
    await tx.forumPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });
    // Notices: a reply always tells the comment's author; a new comment tells the discussion's author when they asked to be told
    // (and never twice for the same comment).
    const about = { id: post.id, slug: post.slug, title: post.title };
    if (parentAuthorId) await notify(tx, { recipientId: parentAuthorId, actorId: profile.id, type: "COMMENT_REPLY", post: about, commentId: comment.id });
    if (post.notifyReplies && post.authorId !== parentAuthorId) await notify(tx, { recipientId: post.authorId, actorId: profile.id, type: "POST_COMMENT", post: about, commentId: comment.id });
    return comment;
  }));
  logger.info({ event: "community.comment.created", commentId: row.id }, "community comment created");
  return commentDto(row, profile.id);
}

export async function editComment(customerId: string, id: string, raw: unknown) {
  const { profile } = await writableProfile(customerId, { posting: true });
  const rawObject = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rich = typeof rawObject.bodyHtml === "string" && rawObject.bodyHtml.trim() ? prepareRichBody(rawObject.bodyHtml) : null;
  if (rich && rich.text.length > LIMITS.richComment) throw new CustomerError(`Your comment is too long (${rich.text.length} of ${LIMITS.richComment} characters).`, 400);
  const input = commentEditSchema.parse(rich ? { ...rawObject, body: rich.text, bodyHtml: rich.html } : { ...rawObject, bodyHtml: undefined });
  const db = getDatabase();
  const current = await db.forumComment.findFirst({ where: { id, authorId: profile.id }, select: { createdAt: true, status: true, post: { select: { locked: true } } } });
  if (!current) throw new CustomerError("Comment not found.", 404);
  if (current.status !== "PUBLISHED" || current.post.locked || Date.now() - current.createdAt.getTime() > EDIT_WINDOW_HOURS * 3_600_000) throw new CustomerError(`Comments can be edited for ${EDIT_WINDOW_HOURS} hours, unless locked or removed.`, 409);
  const changed = await db.forumComment.updateMany({ where: { id, authorId: profile.id, status: "PUBLISHED", version: input.version }, data: { body: input.body, bodyHtml: rich ? rich.html : null, editedAt: new Date(), version: { increment: 1 } } });
  if (changed.count !== 1) throw new CustomerError("This comment changed. Reload and try again.", 409);
  return commentDto(await db.forumComment.findUniqueOrThrow({ where: { id }, select: commentSelect }), profile.id);
}

export async function deleteComment(customerId: string, id: string) {
  const { profile } = await writableProfile(customerId);
  const db = getDatabase();
  const done = await withRetry(() => db.$transaction(async (tx) => {
    const changed = await tx.forumComment.updateMany({ where: { id, authorId: profile.id, status: "PUBLISHED" }, data: { status: "DELETED", version: { increment: 1 } } });
    if (changed.count !== 1) return false;
    const c = await tx.forumComment.findUniqueOrThrow({ where: { id }, select: { postId: true } });
    await tx.forumPost.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
    return true;
  }));
  if (!done) throw new CustomerError("Comment not found.", 404);
  return { deleted: true };
}

// One vote per member per item, enforced by a unique index; the score changes by the difference, atomically.
async function applyVote(kind: "post" | "comment", customerId: string, ref: string, raw: unknown | null) {
  const { profile } = await writableProfile(customerId);
  const value = raw === null ? 0 : voteSchema.parse(raw).value;
  await limitCustomerRequests(`forum-vote:${profile.id}`, 120, 3600);
  const db = getDatabase();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        if (kind === "post") {
          const post = await tx.forumPost.findFirst({ where: { OR: [{ id: ref }, { slug: ref }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true, authorId: true } });
          if (!post) throw new CustomerError("Post not found.", 404);
          if (post.authorId === profile.id) throw new CustomerError("You cannot vote on your own post.", 403);
          const existing = await tx.forumPostVote.findUnique({ where: { postId_profileId: { postId: post.id, profileId: profile.id } } });
          const delta = value - (existing?.value ?? 0);
          if (delta === 0) return { score: (await tx.forumPost.findUniqueOrThrow({ where: { id: post.id }, select: { score: true } })).score, vote: value };
          if (value === 0) await tx.forumPostVote.delete({ where: { id: existing!.id } });
          else if (existing) await tx.forumPostVote.update({ where: { id: existing.id }, data: { value } });
          else await tx.forumPostVote.create({ data: { postId: post.id, profileId: profile.id, value } });
          const updated = await tx.forumPost.update({ where: { id: post.id }, data: { score: { increment: delta } }, select: { score: true } });
          return { score: updated.score, vote: value };
        }
        const comment = await tx.forumComment.findFirst({ where: { id: ref, status: "PUBLISHED", post: { status: "PUBLISHED" } }, select: { id: true, authorId: true } });
        if (!comment) throw new CustomerError("Comment not found.", 404);
        if (comment.authorId === profile.id) throw new CustomerError("You cannot vote on your own comment.", 403);
        const existing = await tx.forumCommentVote.findUnique({ where: { commentId_profileId: { commentId: comment.id, profileId: profile.id } } });
        const delta = value - (existing?.value ?? 0);
        if (delta === 0) return { score: (await tx.forumComment.findUniqueOrThrow({ where: { id: comment.id }, select: { score: true } })).score, vote: value };
        if (value === 0) await tx.forumCommentVote.delete({ where: { id: existing!.id } });
        else if (existing) await tx.forumCommentVote.update({ where: { id: existing.id }, data: { value } });
        else await tx.forumCommentVote.create({ data: { commentId: comment.id, profileId: profile.id, value } });
        const updated = await tx.forumComment.update({ where: { id: comment.id }, data: { score: { increment: delta } }, select: { score: true } });
        return { score: updated.score, vote: value };
      });
    } catch (error) {
      // A concurrent duplicate lost the race on the unique index or on a deadlock: look again and apply the difference.
      if (!isRetryableConflict(error) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1) + Math.floor(Math.random() * 25)));
    }
  }
  throw new CustomerError("Could not record your vote. Please try again.", 503);
}
export const votePost = (customerId: string, ref: string, raw: unknown) => applyVote("post", customerId, ref, raw);
export const clearPostVote = (customerId: string, ref: string) => applyVote("post", customerId, ref, null);
export const voteComment = (customerId: string, id: string, raw: unknown) => applyVote("comment", customerId, id, raw);
export const clearCommentVote = (customerId: string, id: string) => applyVote("comment", customerId, id, null);

export async function setSaved(customerId: string, ref: string, saved: boolean) {
  const { profile } = await writableProfile(customerId);
  await limitCustomerRequests(`forum-save:${profile.id}`, 120, 3600);
  const db = getDatabase();
  const post = await db.forumPost.findFirst({ where: { OR: [{ id: ref }, { slug: ref }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true } });
  if (!post) throw new CustomerError("Post not found.", 404);
  if (saved) {
    try { await db.forumSave.create({ data: { postId: post.id, profileId: profile.id } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; }
  } else {
    await db.forumSave.deleteMany({ where: { postId: post.id, profileId: profile.id } });
  }
  return { saved };
}

export async function setFollowing(customerId: string, slug: string, following: boolean) {
  const { profile } = await writableProfile(customerId);
  await limitCustomerRequests(`forum-follow:${profile.id}`, 120, 3600);
  const db = getDatabase();
  const community = await db.forumCommunity.findFirst({ where: { slug: slug.toLowerCase(), isActive: true }, select: { id: true } });
  if (!community) throw new CustomerError("Community not found.", 404);
  if (following) {
    try { await db.forumFollow.create({ data: { communityId: community.id, profileId: profile.id } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; }
  } else {
    await db.forumFollow.deleteMany({ where: { communityId: community.id, profileId: profile.id } });
  }
  return { following };
}

export async function reportContent(customerId: string, raw: unknown) {
  const { profile } = await writableProfile(customerId);
  const input = reportSchema.parse(raw);
  await limitCustomerRequests(`forum-report:${profile.id}`, 10, 3600);
  const db = getDatabase();
  const data: Prisma.ForumReportUncheckedCreateInput = { reporterId: profile.id, targetType: input.targetType, category: input.category, details: input.details || null };
  if (input.targetType === "POST") {
    const post = await db.forumPost.findFirst({ where: { OR: [{ id: input.targetId }, { slug: input.targetId }], status: { in: ["PUBLISHED", "PENDING_REVIEW"] } }, select: { id: true, authorId: true } });
    if (!post) throw new CustomerError("Post not found.", 404);
    if (post.authorId === profile.id) throw new CustomerError("You cannot report your own post.", 400);
    data.postId = post.id;
  } else if (input.targetType === "COMMENT") {
    const comment = await db.forumComment.findFirst({ where: { id: input.targetId, status: "PUBLISHED" }, select: { id: true, authorId: true } });
    if (!comment) throw new CustomerError("Comment not found.", 404);
    if (comment.authorId === profile.id) throw new CustomerError("You cannot report your own comment.", 400);
    data.commentId = comment.id;
  } else {
    const target = await db.forumProfile.findFirst({ where: { OR: [{ id: input.targetId }, { handle: input.targetId.toLowerCase() }] }, select: { id: true } });
    if (!target) throw new CustomerError("Member not found.", 404);
    if (target.id === profile.id) throw new CustomerError("You cannot report yourself.", 400);
    data.targetProfileId = target.id;
  }
  try {
    await db.forumReport.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { reported: true, duplicate: true };
    throw error;
  }
  logger.info({ event: "community.report.created", targetType: input.targetType, category: input.category }, "community report created");
  return { reported: true, duplicate: false };
}

// ---------- the signed-in member's own area ----------
export async function getActivity(customerId: string) {
  assertCommunityEnabled();
  await assertActiveCustomer(customerId);
  const db = getDatabase();
  const profile = await ensureProfile(customerId);
  const [counts, posts, comments, saved, follows, reports] = await Promise.all([
    db.forumPost.groupBy({ by: ["status"], where: { authorId: profile.id }, _count: { _all: true } }),
    db.forumPost.findMany({ where: { authorId: profile.id }, orderBy: { createdAt: "desc" }, take: 50, select: postSelect }),
    db.forumComment.findMany({ where: { authorId: profile.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, body: true, createdAt: true, post: { select: { slug: true, title: true } } } }),
    db.forumSave.findMany({ where: { profileId: profile.id, post: { status: "PUBLISHED" } }, orderBy: { createdAt: "desc" }, take: 50, select: { post: { select: postSelect } } }),
    db.forumFollow.findMany({ where: { profileId: profile.id }, select: { community: { select: { slug: true, name: true } } } }),
    db.forumReport.findMany({ where: { reporterId: profile.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, targetType: true, category: true, status: true, createdAt: true } }),
  ]);
  const byStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  return {
    profile: { handle: profile.handle, bio: profile.bio, status: profile.status, suspendedUntil: profile.suspendedUntil?.toISOString() ?? null },
    counts: { published: byStatus("PUBLISHED"), awaitingReview: byStatus("PENDING_REVIEW"), removed: byStatus("REMOVED"), deleted: byStatus("DELETED") },
    posts: posts.map((p) => postDto(p, { vote: 0, saved: false, mine: true })),
    comments: comments.map((c) => ({ id: c.id, excerpt: c.body.slice(0, 160), createdAt: c.createdAt.toISOString(), post: c.post })),
    saved: saved.map((s) => postDto(s.post)),
    following: follows.map((f) => f.community),
    // Reporters see only the status of their own reports, never moderator names or notes.
    reports: reports.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

export async function updateOwnProfile(customerId: string, raw: unknown) {
  const { profile } = await writableProfile(customerId);
  const input = forumProfileSchema.parse(raw);
  await limitCustomerRequests(`forum-profile:${profile.id}`, 10, 86_400);
  try {
    const updated = await getDatabase().forumProfile.update({ where: { id: profile.id }, data: { handle: input.handle, bio: input.bio || null }, select: { handle: true, bio: true } });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerError("That name is already taken.", 409);
    throw error;
  }
}

// ---------- discussion list with filters, sorting, search and page numbers ----------
export const FEED_FILTERS = ["latest", "trending", "liked", "commented", "unanswered"] as const;
export const FEED_SORTS = ["recent", "oldest", "viewed"] as const;
export const FEED_VIEWS = ["all", "mine", "saved", "following"] as const;
const discussionQuerySchema = z.object({
  filter: z.enum(FEED_FILTERS).default("latest"),
  sort: z.enum(FEED_SORTS).optional(),
  view: z.enum(FEED_VIEWS).default("all"),
  type: z.enum(["DEAL", "DISCUSSION", "QUESTION"]).optional(),
  community: z.string().trim().toLowerCase().max(40).optional(),
  // Wildcard characters typed by a visitor are removed so they cannot turn a search into a slow scan.
  q: z.string().transform((v) => v.replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim()).pipe(z.string().max(80)).optional(),
  page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});

export async function listDiscussions(rawQuery: unknown, customerId?: string | null) {
  assertCommunityEnabled();
  const q = discussionQuerySchema.parse(rawQuery);
  const db = getDatabase();
  const me = await viewerProfileId(customerId);
  const empty = { items: [] as PostDto[], total: 0, page: q.page, pageCount: 1, limit: q.limit, requiresSignIn: false };
  if (q.view !== "all" && !me) return { ...empty, requiresSignIn: true };

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const and: Prisma.ForumPostWhereInput[] = [];
  const where: Prisma.ForumPostWhereInput = { status: "PUBLISHED", community: { isActive: true, ...(q.community ? { slug: q.community } : {}) }, ...(q.type ? { type: q.type } : {}), AND: and };
  if (q.view === "mine") { where.authorId = me; where.status = { in: ["PUBLISHED", "PENDING_REVIEW"] }; }
  if (q.view === "saved") where.saves = { some: { profileId: me } };
  if (q.view === "following") where.community = { isActive: true, follows: { some: { profileId: me } } };
  if (q.filter === "trending") where.publishedAt = { gte: weekAgo };
  if (q.filter === "unanswered") where.commentCount = 0;
  if (q.q) and.push(usesMariaDb() ? { id: { in: await searchPostIdsMariaDb(q.q) } } : { OR: [{ title: { contains: q.q } }, { body: { contains: q.q } }, { author: { handle: { contains: q.q } } }, { community: { name: { contains: q.q } } }] });

  const asc = "asc" as const, desc = "desc" as const;
  const order: Prisma.ForumPostOrderByWithRelationInput[] =
    q.sort === "oldest" ? [{ publishedAt: asc }, { id: asc }]
    : q.sort === "viewed" ? [{ viewCount: desc }, { publishedAt: desc }, { id: desc }]
    : q.sort === "recent" ? [{ publishedAt: desc }, { id: desc }]
    : q.filter === "liked" ? [{ score: desc }, { publishedAt: desc }, { id: desc }]
    : q.filter === "commented" ? [{ commentCount: desc }, { publishedAt: desc }, { id: desc }]
    : q.filter === "trending" ? [{ score: desc }, { commentCount: desc }, { publishedAt: desc }, { id: desc }]
    : [{ publishedAt: desc }, { id: desc }];

  const [total, rows] = await Promise.all([
    db.forumPost.count({ where }),
    db.forumPost.findMany({ where, orderBy: order, skip: (q.page - 1) * q.limit, take: q.limit, select: postSelect }),
  ]);
  const states = await viewerStates(db, me, rows.map((r) => r.id));
  return {
    items: rows.map((row) => postDto(row, me ? { ...(states.get(row.id) ?? { vote: 0, saved: false }), mine: row.author.id === me } : undefined)),
    total, page: q.page, pageCount: Math.max(1, Math.ceil(total / q.limit)), limit: q.limit, requiresSignIn: false,
  };
}

/** Numbers for the sidebars. All values are counted from the database; nothing is invented. */
export async function communityOverview(customerId?: string | null) {
  assertCommunityEnabled();
  const db = getDatabase();
  const me = await viewerProfileId(customerId);
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [members, discussions, comments, recent, mine] = await Promise.all([
    db.forumProfile.count(),
    db.forumPost.count({ where: { status: "PUBLISHED", community: { isActive: true } } }),
    db.forumComment.count({ where: { status: "PUBLISHED", post: { status: "PUBLISHED" } } }),
    db.forumPost.groupBy({ by: ["communityId"], where: { status: "PUBLISHED", publishedAt: { gte: since }, community: { isActive: true } }, _count: { _all: true }, orderBy: { _count: { communityId: "desc" } }, take: 5 }),
    me ? Promise.all([
      db.forumPost.count({ where: { authorId: me, status: { in: ["PUBLISHED", "PENDING_REVIEW"] } } }),
      db.forumComment.count({ where: { authorId: me, status: "PUBLISHED" } }),
      db.forumSave.count({ where: { profileId: me, post: { status: "PUBLISHED" } } }),
      db.forumFollow.count({ where: { profileId: me } }),
    ]) : Promise.resolve(null),
  ]);
  const names = recent.length ? await db.forumCommunity.findMany({ where: { id: { in: recent.map((r) => r.communityId) } }, select: { id: true, slug: true, name: true } }) : [];
  const byId = new Map(names.map((n) => [n.id, n]));
  return {
    stats: { members, discussions, comments },
    // Topics are the communities with the most new posts in the last 14 days (there is no separate tag system).
    trendingTopics: recent.flatMap((r) => { const c = byId.get(r.communityId); return c ? [{ slug: c.slug, name: c.name, posts: r._count._all }] : []; }),
    mine: mine ? { discussions: mine[0], comments: mine[1], saved: mine[2], following: mine[3] } : null,
  };
}

/** Counts a view once per visitor and post every six hours (same address and browser). Bots are ignored. */
export async function recordPostView(ref: string, visitor: { ip: string | null; userAgent: string }) {
  assertCommunityEnabled();
  if (!visitor.userAgent || /bot|crawler|spider|robot|crawling|lighthouse|headless|preview/i.test(visitor.userAgent)) return { counted: false };
  const db = getDatabase();
  const post = await db.forumPost.findFirst({ where: { OR: [{ slug: ref }, { id: ref }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true } });
  if (!post) throw new CustomerError("Post not found.", 404);
  try { await limitCustomerRequests(`forum-view:${post.id}:${sha((visitor.ip ?? "?") + "|" + visitor.userAgent).slice(0, 24)}`, 1, 21_600); }
  catch (error) { if (error instanceof CustomerError) return { counted: false }; throw error; }
  await db.forumPost.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } });
  return { counted: true };
}

/** The signed-in member's community name and picture for the top bar (no profile is created by looking). */
export async function viewerHandle(customerId: string) {
  const row = await getDatabase().forumProfile.findUnique({ where: { customerId }, select: { handle: true, avatarKey: true } });
  return row ? { handle: row.handle, avatarUrl: row.avatarKey ? `/api/v1/avatars/${row.handle}` : null } : null;
}

// ---------- likes (separate from votes: a vote ranks content, a like only says "I liked this") ----------
async function applyLike(kind: "post" | "comment", customerId: string, ref: string, liked: boolean) {
  const { profile } = await writableProfile(customerId);
  await limitCustomerRequests(`forum-like:${profile.id}`, 240, 3600);
  const db = getDatabase();
  const run = () => db.$transaction(async (tx) => {
    if (kind === "post") {
      const post = await tx.forumPost.findFirst({ where: { OR: [{ id: ref }, { slug: ref }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true } });
      if (!post) throw new CustomerError("Post not found.", 404);
      if (liked) {
        const made = await tx.forumPostLike.createMany({ data: [{ postId: post.id, profileId: profile.id }], skipDuplicates: true });
        if (made.count === 1) await tx.forumPost.update({ where: { id: post.id }, data: { likeCount: { increment: 1 } } });
      } else {
        const gone = await tx.forumPostLike.deleteMany({ where: { postId: post.id, profileId: profile.id } });
        if (gone.count === 1) await tx.forumPost.update({ where: { id: post.id }, data: { likeCount: { decrement: 1 } } });
      }
      return { liked, likeCount: (await tx.forumPost.findUniqueOrThrow({ where: { id: post.id }, select: { likeCount: true } })).likeCount };
    }
    const comment = await tx.forumComment.findFirst({ where: { id: ref, status: "PUBLISHED", post: { status: "PUBLISHED", community: { isActive: true } } }, select: { id: true } });
    if (!comment) throw new CustomerError("Comment not found.", 404);
    if (liked) {
      const made = await tx.forumCommentLike.createMany({ data: [{ commentId: comment.id, profileId: profile.id }], skipDuplicates: true });
      if (made.count === 1) await tx.forumComment.update({ where: { id: comment.id }, data: { likeCount: { increment: 1 } } });
    } else {
      const gone = await tx.forumCommentLike.deleteMany({ where: { commentId: comment.id, profileId: profile.id } });
      if (gone.count === 1) await tx.forumComment.update({ where: { id: comment.id }, data: { likeCount: { decrement: 1 } } });
    }
    return { liked, likeCount: (await tx.forumComment.findUniqueOrThrow({ where: { id: comment.id }, select: { likeCount: true } })).likeCount };
  });
  return withRetry(run);
}
export const setPostLike = (customerId: string, ref: string, liked: boolean) => applyLike("post", customerId, ref, liked);
export const setCommentLike = (customerId: string, id: string, liked: boolean) => applyLike("comment", customerId, id, liked);

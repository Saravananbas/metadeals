import { getBadgeBoard } from "@/server/badges/counts";
import { topBadges } from "@/features/badges/catalog";
import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { cleanText, handleSchema, looksLikeStaffName, RESERVED_HANDLES } from "@/features/community/validation";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { assertCommunityEnabled } from "./config";
import { ensureProfile, postDto, postSelect, writableProfile } from "./service";

export const PROFILE_TABS = ["overview", "deals", "discussions", "comments", "saved", "about"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];
const STAGE_LABEL = { PENDING_REVIEW: "Awaiting review", APPROVED: "Approved", REJECTED: "Not approved", LIVE: "Live" } as const;

const optional = (max: number, label: string) => z.string().transform(cleanText).pipe(z.string().max(max, `${label} is too long.`)).nullable().optional();
const profileSchema = z.object({
  handle: handleSchema.optional(),
  displayName: optional(60, "Display name").refine((v) => !v || (!RESERVED_HANDLES.has(v.toLowerCase()) && !looksLikeStaffName(v)), "That display name is reserved."),
  bio: optional(280, "Bio"),
  location: optional(80, "City / state"),
}).strict();

/**
 * A member's public page. Everything here is public by design EXCEPT what is marked owner-only:
 * never email, real account name, birth date, sex, phone, reports, moderation notes or anything about sign-in.
 * Saved items and deals that are not live are returned only to the member themself.
 */
export async function getMemberProfile(handle: string, viewerCustomerId: string | null, tab: ProfileTab = "overview") {
  assertCommunityEnabled();
  const db = getDatabase();
  const profile = await db.forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true, customerId: true, handle: true, displayName: true, bio: true, location: true, avatarKey: true, verifiedAt: true, createdAt: true, customer: { select: { createdAt: true, disabledAt: true } } } });
  if (!profile || profile.customer.disabledAt) throw new CustomerError("Member not found.", 404);
  const isOwner = Boolean(viewerCustomerId && viewerCustomerId === profile.customerId);
  const liveDeal = { status: "APPROVED" as const, deal: { is: { AND: [publicWhere(listingSchema.parse({})), { status: "PUBLISHED" as const, everPublished: true }] } } };
  const posts = { authorId: profile.id, status: "PUBLISHED" as const, community: { isActive: true } };
  const comments = { authorId: profile.id, status: "PUBLISHED" as const, post: { status: "PUBLISHED" as const, community: { isActive: true } } };

  const viewerProfile = viewerCustomerId && !isOwner ? await db.forumProfile.findUnique({ where: { customerId: viewerCustomerId }, select: { id: true } }) : null;
  const [followers, following, iFollow] = await Promise.all([
    db.forumMemberFollow.count({ where: { followedId: profile.id } }),
    db.forumMemberFollow.count({ where: { followerId: profile.id } }),
    viewerProfile ? db.forumMemberFollow.findUnique({ where: { followerId_followedId: { followerId: viewerProfile.id, followedId: profile.id } }, select: { id: true } }) : null,
  ]);
  const [discussionCount, commentCount, postLikes, commentLikes, publishedDeals, submitted, savedCount] = await Promise.all([
    db.forumPost.count({ where: posts }),
    db.forumComment.count({ where: comments }),
    db.forumPost.aggregate({ where: posts, _sum: { likeCount: true } }),
    db.forumComment.aggregate({ where: comments, _sum: { likeCount: true } }),
    db.communityDealSubmission.count({ where: { customerId: profile.customerId, ...liveDeal } }),
    isOwner ? db.communityDealSubmission.count({ where: { customerId: profile.customerId } }) : null,
    isOwner ? db.forumSave.count({ where: { profileId: profile.id, post: { status: "PUBLISHED" } } }) : null,
  ]);

  const dealSelect = { id: true, status: true, title: true, priceMinor: true, mrpMinor: true, merchantName: true, submittedAt: true, deal: { select: { status: true, everPublished: true, slug: true, mediaId: true, publishedAt: true } } } as const;
  const dealDto = (r: Prisma.CommunityDealSubmissionGetPayload<{ select: typeof dealSelect }>) => {
    const live = r.status === "APPROVED" && Boolean(r.deal?.everPublished) && r.deal?.status === "PUBLISHED";
    const stage = r.status === "APPROVED" ? (live ? "LIVE" : "APPROVED") : r.status;
    return { id: r.id, title: r.title, priceMinor: r.priceMinor, mrpMinor: r.mrpMinor, merchantName: r.merchantName, stage, stageLabel: STAGE_LABEL[stage], url: live ? `/deal/${r.deal!.slug}` : null, imageUrl: live ? `/api/v1/media/${r.deal!.mediaId}` : null, at: (r.deal?.publishedAt ?? r.submittedAt).toISOString() };
  };
  // Visitors only ever get live deals; the owner also sees their own submissions in every state (never the reviewer or the review notes).
  const loadDeals = (take: number) => db.communityDealSubmission.findMany({ where: { customerId: profile.customerId, ...(isOwner ? {} : liveDeal) }, orderBy: { submittedAt: "desc" }, take, select: dealSelect }).then((rows) => rows.map(dealDto));
  const loadPosts = (take: number) => db.forumPost.findMany({ where: posts, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take, select: postSelect }).then((rows) => rows.map((p) => postDto(p)));
  const loadComments = (take: number) => db.forumComment.findMany({ where: comments, orderBy: { createdAt: "desc" }, take, select: { id: true, body: true, createdAt: true, parentId: true, post: { select: { slug: true, title: true } } } })
    .then((rows) => rows.map((c) => ({ id: c.id, excerpt: c.body.slice(0, 200), isReply: Boolean(c.parentId), createdAt: c.createdAt.toISOString(), post: c.post })));

  const data: {
    deals?: Awaited<ReturnType<typeof loadDeals>>; discussions?: Awaited<ReturnType<typeof loadPosts>>; comments?: Awaited<ReturnType<typeof loadComments>>; saved?: Awaited<ReturnType<typeof loadPosts>>;
    activity?: { kind: "deal" | "discussion" | "comment"; title: string; url: string; at: string }[];
  } = {};
  if (tab === "overview") {
    const [d, p, c] = await Promise.all([db.communityDealSubmission.findMany({ where: { customerId: profile.customerId, ...liveDeal }, orderBy: { submittedAt: "desc" }, take: 5, select: dealSelect }).then((rows) => rows.map(dealDto)), loadPosts(5), loadComments(5)]);
    data.deals = d; data.discussions = p; data.comments = c;
    data.activity = [
      ...d.filter((x) => x.url).map((x) => ({ kind: "deal" as const, title: x.title, url: x.url as string, at: x.at })),
      ...p.map((x) => ({ kind: "discussion" as const, title: x.title, url: `/community/post/${x.slug}`, at: x.publishedAt ?? x.createdAt })),
      ...c.map((x) => ({ kind: "comment" as const, title: x.post.title, url: `/community/post/${x.post.slug}#c-${x.id}`, at: x.createdAt })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  } else if (tab === "deals") data.deals = await loadDeals(50);
  else if (tab === "discussions") data.discussions = await loadPosts(30);
  else if (tab === "comments") data.comments = await loadComments(40);
  else if (tab === "saved") {
    if (!isOwner) throw new CustomerError("Member not found.", 404); // saved items are private; a visitor asking for them learns nothing
    data.saved = (await db.forumSave.findMany({ where: { profileId: profile.id, post: { status: "PUBLISHED", community: { isActive: true } } }, orderBy: { createdAt: "desc" }, take: 50, select: { post: { select: postSelect } } })).map((s) => postDto(s.post));
  }

  return {
    handle: profile.handle, displayName: profile.displayName, bio: profile.bio, location: profile.location, verified: Boolean(profile.verifiedAt),
    followers, following, viewer: viewerProfile ? { following: Boolean(iFollow) } : null,
    // Badges show on the public profile for everyone (names and tiers only, never the counts behind them).
    badges: topBadges(await getBadgeBoard(profile.customerId), 3),
    avatarUrl: profile.avatarKey ? `/api/v1/avatars/${profile.handle}` : null,
    memberSince: profile.customer.createdAt.toISOString().slice(0, 7), profileUrl: `/@${profile.handle}`, isOwner,
    stats: { dealsShared: isOwner ? (submitted as number) : publishedDeals, publishedDeals, discussions: discussionCount, comments: commentCount, likesReceived: (postLikes._sum.likeCount ?? 0) + (commentLikes._sum.likeCount ?? 0), ...(isOwner ? { saved: savedCount as number } : {}) },
    tab, ...data,
  };
}

/** The signed-in member's own public details, for the Edit Profile screen. */
export async function getOwnMemberProfile(customerId: string) {
  const p = await ensureProfile(customerId);
  return { verified: Boolean(p.verifiedAt), handle: p.handle, displayName: p.displayName, bio: p.bio, location: p.location, avatarUrl: p.avatarKey ? `/api/v1/avatars/${p.handle}` : null };
}

export async function updateMemberProfile(customerId: string, raw: unknown) {
  const { profile } = await writableProfile(customerId);
  const input = profileSchema.parse(raw);
  await limitCustomerRequests(`forum-profile:${profile.id}`, 20, 86_400);
  const changingHandle = input.handle !== undefined && input.handle !== profile.handle;
  if (changingHandle) await limitCustomerRequests(`username:${profile.id}`, 10, 86_400);
  try {
    await getDatabase().forumProfile.update({
      where: { id: profile.id },
      data: { ...(changingHandle ? { handle: input.handle } : {}), ...(input.displayName !== undefined ? { displayName: input.displayName || null } : {}), ...(input.bio !== undefined ? { bio: input.bio || null } : {}), ...(input.location !== undefined ? { location: input.location || null } : {}) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerError("That user name is already taken. Try another.", 409);
    throw error;
  }
  // City / State is one value shown in both places: keep the account copy in step with the public one.
  if (input.location !== undefined) await getDatabase().customer.update({ where: { id: customerId }, data: { location: input.location || null } });
  return getOwnMemberProfile(customerId);
}

/** Live check while typing a user name. Says only "free" or why not; it never reveals whose name it is. */
export async function userNameAvailability(customerId: string, raw: string) {
  const parsed = handleSchema.safeParse(raw);
  if (!parsed.success) return { available: false, reason: parsed.error.issues[0]?.message ?? "That name cannot be used." };
  const mine = await ensureProfile(customerId);
  if (parsed.data === mine.handle) return { available: true, reason: null };
  const taken = await getDatabase().forumProfile.findUnique({ where: { handle: parsed.data }, select: { id: true } });
  return taken ? { available: false, reason: "That user name is already taken." } : { available: true, reason: null };
}

/** Follow or unfollow another member. Repeating the call changes nothing; blocked pairs (either way) cannot follow each other. */
/** Give or take back a star ("Give Star" on a member's card). One per pair, never to yourself; a member's stars are their Reputation Points. */
export async function setStar(customerId: string, handle: string, give: boolean) {
  const { profile } = await writableProfile(customerId);
  const db = getDatabase();
  const target = await db.forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true, customer: { select: { disabledAt: true } } } });
  if (!target || target.customer.disabledAt || target.id === profile.id) throw new CustomerError("Member not found.", 404);
  if (give) {
    await limitCustomerRequests(`member-star:${profile.id}`, 60, 3600);
    const blocked = await db.dmBlock.findFirst({ where: { OR: [{ blockerId: profile.id, blockedId: target.id }, { blockerId: target.id, blockedId: profile.id }] }, select: { id: true } });
    if (blocked) throw new CustomerError("You cannot give this member a star.", 403);
    await db.memberStar.createMany({ data: [{ giverId: profile.id, receiverId: target.id }], skipDuplicates: true });
  } else {
    await db.memberStar.deleteMany({ where: { giverId: profile.id, receiverId: target.id } });
  }
  return { starred: give, stars: await db.memberStar.count({ where: { receiverId: target.id } }) };
}

export async function setFollow(customerId: string, handle: string, follow: boolean) {
  const { profile } = await writableProfile(customerId);
  const db = getDatabase();
  const target = await db.forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true, customer: { select: { disabledAt: true } } } });
  if (!target || target.customer.disabledAt || target.id === profile.id) throw new CustomerError("Member not found.", 404);
  if (follow) {
    await limitCustomerRequests(`member-follow:${profile.id}`, 120, 3600);
    const blocked = await db.dmBlock.findFirst({ where: { OR: [{ blockerId: profile.id, blockedId: target.id }, { blockerId: target.id, blockedId: profile.id }] }, select: { id: true } });
    if (blocked) throw new CustomerError("You cannot follow this member.", 403);
    await db.forumMemberFollow.createMany({ data: [{ followerId: profile.id, followedId: target.id }], skipDuplicates: true });
  } else {
    await db.forumMemberFollow.deleteMany({ where: { followerId: profile.id, followedId: target.id } });
  }
  return { following: follow, followers: await db.forumMemberFollow.count({ where: { followedId: target.id } }) };
}

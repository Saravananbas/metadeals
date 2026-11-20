import "server-only";
import { getDatabase } from "@/server/db/client";
import { communityEnabled } from "@/server/community/config";
import { buildBoard, type BadgeBoard, type BadgeCounts } from "@/features/badges/catalog";

/**
 * Everything is counted from rows the site already stores, for this member only (never from the request):
 * - deals: submissions a moderator approved, and the deals they own (views, shares, saves by others, Buy Now clicks);
 * - community: published posts and comments, likes other members gave (own likes are never counted), comments with 10+ likes,
 *   discussions with 20+ comments, followers, likes and upvotes this member gave to other people's content (one per item, so it cannot be farmed by repeating);
 * - safety: reports this member filed that a moderator marked resolved;
 * - membership: days since the account was created.
 * Content that was removed is not published, so it counts for nothing.
 */
export async function getBadgeCounts(customerId: string): Promise<BadgeCounts> {
  const db = getDatabase();
  const [customer, deals] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId }, select: { createdAt: true, forumProfile: { select: { id: true } } } }),
    db.deal.findMany({ where: { communitySubmission: { is: { customerId } } }, select: { id: true, viewCount: true, shareCount: true } }),
  ]);
  const profileId = communityEnabled() ? customer?.forumProfile?.id : undefined;
  const dealIds = deals.map((d) => d.id);
  const mine = profileId ? { authorId: profileId, status: "PUBLISHED" as const } : null;
  const notMine = profileId ? { profileId } : null;

  const [approved, clicks, saves, posts, comments, commentLikes, postLikes, legends, magnets, likesGiven, commentLikesGiven, upvotesGiven, commentUpvotesGiven, followers, reports] = await Promise.all([
    db.communityDealSubmission.count({ where: { customerId, status: "APPROVED" } }),
    dealIds.length ? db.affiliateClick.count({ where: { dealId: { in: dealIds } } }) : 0,
    dealIds.length ? db.savedDeal.count({ where: { dealId: { in: dealIds } } }) : 0,
    mine ? db.forumPost.count({ where: mine }) : 0,
    mine ? db.forumComment.count({ where: mine }) : 0,
    mine ? db.forumCommentLike.count({ where: { comment: mine, profileId: { not: profileId } } }) : 0,
    mine ? db.forumPostLike.count({ where: { post: mine, profileId: { not: profileId } } }) : 0,
    mine ? db.forumComment.count({ where: { ...mine, likeCount: { gte: 10 } } }) : 0,
    mine ? db.forumPost.count({ where: { ...mine, commentCount: { gte: 20 } } }) : 0,
    notMine ? db.forumPostLike.count({ where: { ...notMine, post: { authorId: { not: profileId } } } }) : 0,
    notMine ? db.forumCommentLike.count({ where: { ...notMine, comment: { authorId: { not: profileId } } } }) : 0,
    notMine ? db.forumPostVote.count({ where: { ...notMine, value: { gt: 0 }, post: { authorId: { not: profileId } } } }) : 0,
    notMine ? db.forumCommentVote.count({ where: { ...notMine, value: { gt: 0 }, comment: { authorId: { not: profileId } } } }) : 0,
    profileId ? db.forumMemberFollow.count({ where: { followedId: profileId } }) : 0,
    profileId ? db.forumReport.count({ where: { reporterId: profileId, status: "RESOLVED" } }) : 0,
  ]);

  return {
    "deal-hunter": approved,
    "deal-impact": deals.reduce((n, d) => n + d.viewCount, 0),
    "click-champion": clicks,
    "deal-collectors": saves,
    "sharing-legends": deals.reduce((n, d) => n + d.shareCount, 0),
    "community-voice": comments,
    "conversation-starters": posts,
    "comment-appreciation": commentLikes,
    "discussion-appreciation": postLikes,
    "comment-legends": legends,
    "community-magnets": magnets,
    "positive-influence": likesGiven + commentLikesGiven + upvotesGiven + commentUpvotesGiven,
    "growing-followers": followers,
    "community-guardians": reports,
    "loyalty-journey": customer ? Math.max(0, Math.floor((Date.now() - customer.createdAt.getTime()) / 86_400_000)) : 0,
  };
}

export async function getBadgeBoard(customerId: string): Promise<BadgeBoard> {
  return buildBoard(await getBadgeCounts(customerId));
}

import "server-only";
import { getServerSession } from "next-auth";
import { getDatabase } from "@/server/db/client";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { communityEnabled } from "@/server/community/config";
import { messagesEnabled } from "@/server/messages/service";
import { getBadgeBoard } from "@/server/badges/counts";
import { topBadges } from "@/features/badges/catalog";
import type { Poster } from "@/components/deals/PosterCard";

/** The "About the Poster" card for a deal that came from a member: public facts only (user name, join month, counts, best badges), never email or real name. */
export async function getPoster(dealId: string): Promise<Poster | null> {
  const db = getDatabase();
  const submission = await db.communityDealSubmission.findFirst({
    where: { dealId, status: "APPROVED" },
    select: { customerId: true, customer: { select: { createdAt: true, forumProfile: { select: { id: true, handle: true, avatarKey: true } } } } },
  });
  const profile = submission?.customer.forumProfile;
  if (!submission || !profile) return null;

  let viewerCustomerId: string | null = null;
  try { viewerCustomerId = (await getServerSession(getCustomerAuthOptions()))?.user?.id ?? null; } catch { viewerCustomerId = null; }
  const viewerProfile = viewerCustomerId ? await db.forumProfile.findUnique({ where: { customerId: viewerCustomerId }, select: { id: true } }) : null;
  const forum = communityEnabled();

  const [dealsPosted, dealVotes, postVotes, commentVotes, comments, dealComments, stars, board, following, starred] = await Promise.all([
    db.communityDealSubmission.count({ where: { customerId: submission.customerId, status: "APPROVED" } }),
    db.dealVote.count({ where: { customerId: submission.customerId } }),
    forum ? db.forumPostVote.count({ where: { profileId: profile.id } }) : 0,
    forum ? db.forumCommentVote.count({ where: { profileId: profile.id } }) : 0,
    forum ? db.forumComment.count({ where: { authorId: profile.id, status: "PUBLISHED" } }) : 0,
    db.dealComment.count({ where: { customerId: submission.customerId } }),
    db.memberStar.count({ where: { receiverId: profile.id } }),
    getBadgeBoard(submission.customerId).catch(() => null),
    viewerProfile && viewerProfile.id !== profile.id ? db.forumMemberFollow.findUnique({ where: { followerId_followedId: { followerId: viewerProfile.id, followedId: profile.id } }, select: { id: true } }) : null,
    viewerProfile && viewerProfile.id !== profile.id ? db.memberStar.findUnique({ where: { giverId_receiverId: { giverId: viewerProfile.id, receiverId: profile.id } }, select: { id: true } }) : null,
  ]);

  return {
    handle: profile.handle,
    hasAvatar: Boolean(profile.avatarKey),
    memberSince: submission.customer.createdAt.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
    stats: { reputation: stars, votes: dealVotes + postVotes + commentVotes, deals: dealsPosted, comments: comments + dealComments },
    badges: board ? topBadges(board) : { top: [], total: 0 },
    viewer: { isOwner: Boolean(viewerCustomerId && viewerCustomerId === submission.customerId), signedIn: Boolean(viewerCustomerId), following: Boolean(following), starred: Boolean(starred) },
    messaging: messagesEnabled(),
  };
}

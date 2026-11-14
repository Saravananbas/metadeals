import { NextResponse } from "next/server";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { communityEnabled } from "@/server/community/config";
import { usesMariaDb, findPostByCodeMariaDb, findCommentByCodeMariaDb } from "@/server/community/like-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Short share links: /p/3fd33c opens a discussion, /p/3fd33c.a8021e9 opens it at one comment.
 * The code is the random end of the discussion address; only published discussions are found.
 * The redirect is built from the site's configured public address (never from the request, which behind the host's proxy shows an internal address)
 * and always stays on this site.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const site = getAuthEnv().NEXTAUTH_URL;
  const go = (path: string) => NextResponse.redirect(new URL(path, site), 307);
  const { code } = await params;
  const match = /^([0-9a-f]{6})(?:\.([a-z0-9]{6,12}))?$/.exec(code);
  if (!match || !communityEnabled()) return go("/community");
  const db = getDatabase();
  const maria = usesMariaDb();
  const post = maria ? await findPostByCodeMariaDb(match[1]) : await db.forumPost.findFirst({ where: { slug: { endsWith: `-${match[1]}` }, status: "PUBLISHED", community: { isActive: true } }, select: { id: true, slug: true } });
  if (!post) return go("/community");
  let hash = "";
  if (match[2]) {
    const commentId = maria ? await findCommentByCodeMariaDb(post.id, match[2]) : (await db.forumComment.findFirst({ where: { postId: post.id, id: { endsWith: match[2] } }, select: { id: true } }))?.id;
    if (commentId) hash = `#c-${commentId}`;
  }
  return go(`/community/post/${post.slug}${hash}`);
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommunityShell } from "@/features/community/components/Shell";
import { Breadcrumbs, PostDetail, type DetailPost } from "@/features/community/components/PostDetail";
import { CommentThread, type CommentView } from "@/features/community/components/CommentThread";
import { PostViewTracker } from "@/features/community/components/Interactive";
import { CustomerError } from "@/server/customer/service";
import { getPost, listComments } from "@/server/community/service";
import { sanitizeRichHtml } from "@/server/community/richtext";
import { communityPageViewer } from "@/server/community/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community post | MetaDeals4U", robots: { index: false, follow: false } };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const customerId = await communityPageViewer();
  const { slug } = await params;
  const post = await getPost(slug, customerId).catch((error) => { if (error instanceof CustomerError && error.status === 404) return null; throw error; });
  if (!post) notFound();
  const pending = post.viewer?.status === "PENDING_REVIEW";
  const comments = pending ? { items: [], nextCursor: null } : await listComments(post.id, undefined, customerId, "newest");
  return (
    <CommunityShell>
      <Breadcrumbs category={post.community.name} categorySlug={post.community.slug} title={post.title} />
      <PostDetail post={post as unknown as DetailPost} safeHtml={post.bodyHtml ? sanitizeRichHtml(post.bodyHtml) : null} signedIn={Boolean(customerId)} />
      <PostViewTracker id={post.id} />
      {pending ? <p style={{ fontSize: 13, color: "var(--md-neutral-600)" }}>Only you can see this until a moderator approves it.</p> : (
        <CommentThread postId={post.id} slug={post.slug} op={post.author.handle} locked={post.locked} signedIn={Boolean(customerId)} initial={comments.items as unknown as CommentView[]} initialCursor={comments.nextCursor} total={post.commentCount} />
      )}
    </CommunityShell>
  );
}

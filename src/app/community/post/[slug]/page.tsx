import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityShell } from "@/features/community/components/Shell";
import { CommentSection } from "@/features/community/components/CommentSection";
import { ReportButton, SaveButton } from "@/features/community/components/PostActions";
import { DealBox, PostMeta, RichText } from "@/features/community/components/parts";
import { VoteControl } from "@/features/community/components/VoteControl";
import { CustomerError } from "@/server/customer/service";
import { getPost, listComments } from "@/server/community/service";
import { communityPageViewer } from "@/server/community/session";
import styles from "@/features/community/community.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community post | MetaDeals4U", robots: { index: false, follow: false } };

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const customerId = await communityPageViewer();
  const { slug } = await params;
  const post = await getPost(slug, customerId).catch((error) => { if (error instanceof CustomerError && error.status === 404) return null; throw error; });
  if (!post) notFound();
  const comments = post.viewer?.status === "PENDING_REVIEW" ? { items: [] } : await listComments(post.id, undefined, customerId);
  return (
    <CommunityShell>
      <article className={styles.post} style={{ gridTemplateColumns: "52px minmax(0,1fr)" }}>
        <VoteControl kind="post" id={post.id} score={post.score} initial={post.viewer?.vote ?? 0} disabled={post.viewer?.mine || post.viewer?.status === "PENDING_REVIEW"} />
        <div>
          <h1 className={styles.title}>{post.title}</h1>
          <PostMeta post={post} />
          {post.viewer?.status === "PENDING_REVIEW" && <p className={styles.notice}>Only you can see this until a moderator approves it.</p>}
          <DealBox post={post} />
          {post.body && <RichText text={post.body} className={styles.body} />}
          {post.url && post.type !== "DEAL" && <p><a href={post.url} target="_blank" rel="nofollow ugc noopener noreferrer">{post.url}</a></p>}
          <div className={styles.actions}>
            {!post.viewer?.mine && <SaveButton id={post.id} saved={post.viewer?.saved ?? false} />}
            {!post.viewer?.mine && <ReportButton targetType="POST" targetId={post.id} />}
            <Link className={styles.btn} href={`/community/c/${post.community.slug}`}>More in {post.community.name}</Link>
          </div>
        </div>
      </article>
      {post.viewer?.status !== "PENDING_REVIEW" && (
        <div className={styles.card}><CommentSection postId={post.id} initial={comments.items as never} locked={post.locked} /></div>
      )}
    </CommunityShell>
  );
}

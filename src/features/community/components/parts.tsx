import Link from "next/link";
import type { ReactNode } from "react";
import { linkifyParts } from "../validation";
import type { PostDto } from "@/server/community/service";
import { VoteControl } from "./VoteControl";
import styles from "../community.module.css";

/** Plain text with safe, public HTTPS links only. Everything else is escaped by React. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className}>
      {linkifyParts(text).map((part, i) =>
        part.href ? <a key={i} href={part.href} target="_blank" rel="nofollow ugc noopener noreferrer">{part.text}</a> : <span key={i}>{part.text}</span>,
      )}
    </p>
  );
}

export const TYPE_LABEL = { DEAL: "Deal", DISCUSSION: "Discussion", QUESTION: "Question" } as const;
export const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN")}`;
export const ago = (iso: string | null) => {
  if (!iso) return "";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`;
};

export function PostMeta({ post }: { post: PostDto }) {
  return (
    <div className={styles.meta}>
      <span className={`${styles.badge} ${styles[post.type]}`}>{TYPE_LABEL[post.type]}</span>
      <Link href={`/community/c/${post.community.slug}`}>{post.community.name}</Link>
      <span>by <Link href={`/community/u/${post.author.handle}`}>{post.author.handle}</Link></span>
      <span>{ago(post.publishedAt ?? post.createdAt)}</span>
      {post.viewer?.status === "PENDING_REVIEW" && <span className={`${styles.badge} ${styles.pending}`}>Awaiting review</span>}
    </div>
  );
}

export function DealBox({ post }: { post: PostDto }) {
  if (post.type !== "DEAL" || post.priceMinor == null) return null;
  return (
    <div className={styles.dealBox}>
      <strong>{rupees(post.priceMinor)}{post.mrpMinor ? <> <s>{rupees(post.mrpMinor)}</s></> : null}{post.merchantName ? <> at {post.merchantName}</> : null}</strong>
      {post.couponCode && <span>Coupon: <code>{post.couponCode}</code></span>}
      {post.url && <a href={post.url} target="_blank" rel="nofollow ugc noopener noreferrer">Open the store page ↗</a>}
      <span className={styles.notice}>Shared by a member. Price and link are not checked by MetaDeals4U. Check the store before you buy. This is not an official MetaDeals4U deal.</span>
    </div>
  );
}

export function PostCard({ post }: { post: PostDto }) {
  const excerpt = post.body.length > 220 ? post.body.slice(0, 220) + "…" : post.body;
  return (
    <article className={styles.post}>
      <VoteControl kind="post" id={post.id} score={post.score} initial={post.viewer?.vote ?? 0} disabled={post.viewer?.mine} />
      <div>
        <h2 className={styles.title}><Link href={`/community/post/${post.slug}`}>{post.title}</Link></h2>
        <PostMeta post={post} />
        <DealBox post={post} />
        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
        <div className={styles.meta} style={{ marginTop: 8 }}>
          <Link href={`/community/post/${post.slug}`}>{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</Link>
        </div>
      </div>
    </article>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={`${styles.card} ${styles.empty}`}>{children}</div>;
}

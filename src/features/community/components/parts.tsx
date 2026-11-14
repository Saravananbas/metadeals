import Link from "next/link";
import type { ReactNode } from "react";
import { linkifyParts } from "../validation";
import type { PostDto } from "@/server/community/service";
import { CardBar, ClickCard } from "./CardBar";
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

/** Round profile picture, or the first letter of the user name when there is none. */
export function Avatar({ handle, url, size = 22 }: { handle: string; url?: string | null; size?: number }) {
  return url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className={styles.avatar} src={url} alt="" width={size} height={size} loading="lazy" />
    : <span className={styles.avatar} aria-hidden style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>{handle.slice(0, 1).toUpperCase()}</span>;
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
      <span className={styles.byline}>by <Avatar handle={post.author.handle} url={post.author.avatarUrl} size={20} /><Link href={`/community/u/${post.author.handle}`}>{post.author.handle}</Link></span>
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
  const excerpt = post.body.length > 200 ? post.body.slice(0, 200) + "…" : post.body;
  const when = ago(post.publishedAt ?? post.createdAt);
  return (
    <ClickCard href={"/community/post/" + post.slug} className={styles.dcard}>
      <div className={styles.dmain}>
        <div className={styles.dtop}>
          <Avatar handle={post.author.handle} url={post.author.avatarUrl} size={28} />
          <Link href={"/community/u/" + post.author.handle} className={styles.dauthor}>{post.author.handle}</Link>
          <span className={styles.notice}>{when}</span>
          <Link href={"/community/c/" + post.community.slug} className={styles.pill}>{post.community.name}</Link>
          <span className={styles.dtype + " " + styles[post.type]}>{TYPE_LABEL[post.type]}</span>
          {post.viewer?.status === "PENDING_REVIEW" && <span className={styles.dtype + " " + styles.pending}>Awaiting review</span>}
        </div>
        <h2 className={styles.dtitle}><Link href={"/community/post/" + post.slug}>{post.title}</Link></h2>
        <DealBox post={post} />
        {excerpt && <p className={styles.dexcerpt}>{excerpt}</p>}
        <CardBar post={post} />
      </div>
    </ClickCard>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={`${styles.card} ${styles.empty}`}>{children}</div>;
}

"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, MessageSquare, ThumbsUp } from "lucide-react";
import { VoteControl } from "./VoteControl";
import { BookmarkButton } from "./Interactive";
import { ShareMenu, callApi, shortPath, useToast } from "./detail-shared";
import detail from "../detail.module.css";
import styles from "../community.module.css";

type CardPost = { id: string; slug: string; title: string; score: number; likeCount: number; commentCount: number; viewCount: number; viewer?: { vote: number; saved: boolean; liked: boolean; mine: boolean } };

/** The row under each feed card: vote, like, comments, views, share, bookmark and the View Discussion button. All use the same APIs as the discussion page. */
export function CardBar({ post }: { post: CardPost }) {
  const { show, node } = useToast();
  const [liked, setLiked] = useState(post.viewer?.liked ?? false), [likes, setLikes] = useState(post.likeCount), [busy, setBusy] = useState(false);
  async function like() {
    if (busy) return; setBusy(true);
    const next = !liked; setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    const r = await callApi(`/api/v1/community/posts/${post.id}/like`, next ? "PUT" : "DELETE");
    if (r.ok) { setLikes(r.data.likeCount); setLiked(r.data.liked); } else { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); show(r.status === 401 ? "Sign in to like discussions." : r.error, { signIn: r.status === 401 }); }
    setBusy(false);
  }
  return (
    <div className={styles.cardBar}>
      <VoteControl kind="post" id={post.id} score={post.score} initial={post.viewer?.vote ?? 0} disabled={post.viewer?.mine} />
      <button type="button" className={`${styles.cardChip} ${liked ? styles.cardChipOn : ""}`} aria-pressed={liked} aria-label={`Like, ${likes} likes`} onClick={like} disabled={busy}><ThumbsUp size={15} /> {likes}</button>
      <Link href={`/community/post/${post.slug}#comments`} className={styles.cardChip} aria-label={`${post.commentCount} comments`}><MessageSquare size={15} /> {post.commentCount}</Link>
      <span className={styles.cardChip} aria-label={`${post.viewCount} views`} style={{ cursor: "default" }}><Eye size={15} /> {post.viewCount}</span>
      <span className={detail.cardShare}><ShareMenu path={shortPath(post.slug)} title={post.title} className={styles.cardChip} compact /></span>
      <BookmarkButton id={post.id} saved={post.viewer?.saved ?? false} />
      <Link href={`/community/post/${post.slug}`} className={styles.viewBtn}>View Discussion</Link>
      {node}
    </div>
  );
}

/** Makes the whole card open the discussion, without getting in the way of links, buttons and menus inside it. */
export function ClickCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <article className={className} onClick={(e) => {
      if ((e.target as HTMLElement).closest("a, button, input, select, textarea, summary, [role=menu], [role=menuitem], label")) return;
      if (window.getSelection()?.toString()) return; // the reader is selecting text
      router.push(href);
    }} style={{ cursor: "pointer" }}>{children}</article>
  );
}

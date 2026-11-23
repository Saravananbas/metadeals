"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, ChevronRight, Eye, Flag, Link2, MoreHorizontal, Pencil, Quote, ThumbsUp, Trash2, Reply, ChevronRight as Arrow } from "lucide-react";
import { Avatar, ago } from "./parts";
import { VoteControl } from "./VoteControl";
import { RichEditor } from "./RichEditor";
import { LIMITS } from "../validation";
import { Menu, ReportDialog, ShareMenu, callApi, shortPath, useToast } from "./detail-shared";
import styles from "../detail.module.css";

export type DetailPost = {
  id: string; slug: string; type: "DEAL" | "DISCUSSION" | "QUESTION"; title: string; body: string; url: string | null; merchantName: string | null; priceMinor: number | null; mrpMinor: number | null;
  couponCode: string | null; locked: boolean; score: number; likeCount: number; commentCount: number; viewCount: number; createdAt: string; publishedAt: string | null; editedAt: string | null;
  community: { slug: string; name: string }; author: { handle: string; avatarUrl: string | null }; images: { id: string; url: string; width: number; height: number }[];
  viewer?: { vote: number; saved: boolean; liked: boolean; mine: boolean; canEdit: boolean; version: number; status: string };
};
const TYPE_LABEL = { DEAL: "Deal", DISCUSSION: "Discussion", QUESTION: "Question" } as const;
const TYPE_CLASS = { DEAL: styles.badgeDeal, DISCUSSION: styles.badgeType, QUESTION: styles.badgeQuestion } as const;
const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN")}`;

export function Breadcrumbs({ category, categorySlug, title }: { category: string; categorySlug: string; title: string }) {
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <Link href="/community">Community</Link><ChevronRight size={14} aria-hidden />
      <Link href={`/community/c/${categorySlug}`}>{category}</Link><ChevronRight size={14} aria-hidden />
      <span className={styles.crumbCurrent} aria-current="page">{title}</span>
    </nav>
  );
}

/** The discussion itself: votes, title, content, pictures, like/reply/quote/share/save, and the bookmark and ⋯ menu. */
export function PostDetail({ post, safeHtml, signedIn }: { post: DetailPost; safeHtml: string | null; signedIn: boolean }) {
  const canEdit = post.viewer?.canEdit ?? false;
  const router = useRouter();
  const { show, node } = useToast();
  const mine = post.viewer?.mine ?? false;
  const [liked, setLiked] = useState(post.viewer?.liked ?? false), [likes, setLikes] = useState(post.likeCount), [likeBusy, setLikeBusy] = useState(false);
  const [saved, setSaved] = useState(post.viewer?.saved ?? false);
  const [reporting, setReporting] = useState(false), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(post.title), [editHtml, setEditHtml] = useState(safeHtml ?? (post.body ? `<p>${post.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").split("\n").join("</p><p>")}</p>` : ""));
  const [editLen, setEditLen] = useState(post.body.length), [version, setVersion] = useState(post.viewer?.version ?? 1);
  const url = () => new URL(shortPath(post.slug), window.location.origin).href;

  async function toggleLike() {
    if (likeBusy) return; setLikeBusy(true);
    const next = !liked; setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // shown at once, undone if the server says no
    const r = await callApi(`/api/v1/community/posts/${post.id}/like`, next ? "PUT" : "DELETE");
    if (r.ok) { setLikes(r.data.likeCount); setLiked(r.data.liked); }
    else { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); show(r.status === 401 ? "Sign in to like this discussion." : r.error, { signIn: r.status === 401 }); }
    setLikeBusy(false);
  }
  async function toggleSave() {
    const next = !saved; setSaved(next);
    const r = await callApi(`/api/v1/community/posts/${post.id}/save`, next ? "PUT" : "DELETE");
    if (!r.ok) { setSaved(!next); show(r.status === 401 ? "Sign in to save discussions." : r.error, { signIn: r.status === 401 }); }
    else show(next ? "Saved to your bookmarks." : "Removed from your bookmarks.", { ok: true });
  }
  const quote = () => window.dispatchEvent(new CustomEvent("md-quote", { detail: { handle: post.author.handle, text: post.body.slice(0, 400) } }));
  const reply = () => window.dispatchEvent(new CustomEvent("md-reply-post"));
  async function saveEdit() {
    setBusy(true);
    const r = await callApi(`/api/v1/community/posts/${post.id}`, "PATCH", { version, title: title.trim(), bodyHtml: editHtml || undefined, ...(editHtml ? {} : { body: "" }) });
    setBusy(false);
    if (r.ok) { setEditing(false); setVersion(r.data.viewer?.version ?? version + 1); show("Saved your changes.", { ok: true }); router.refresh(); }
    else show(r.error);
  }
  async function remove() {
    if (!window.confirm("Delete this discussion? This cannot be undone.")) return;
    const r = await callApi(`/api/v1/community/posts/${post.id}`, "DELETE");
    if (r.ok) { router.push(`/community/c/${post.community.slug}`); router.refresh(); } else show(r.error);
  }

  return (
    <article className={`${styles.card} ${styles.post}`}>
      <div className={styles.main}>
        <div className={styles.headRow}>
          <div style={{ minWidth: 0 }}>
            {editing ? null : <h1 className={styles.title}>{post.title}</h1>}
            <div className={styles.metaRow}>
              <span className={`${styles.badge} ${TYPE_CLASS[post.type]}`}>{TYPE_LABEL[post.type]}</span>
              <Link href={`/community/c/${post.community.slug}`} className={`${styles.badge} ${styles.badgeCat}`}>{post.community.name}</Link>
              <span className={styles.by}>by <Avatar handle={post.author.handle} url={post.author.avatarUrl} size={22} /><Link href={`/community/u/${post.author.handle}`}>{post.author.handle}</Link>{mine && <span className={styles.authorBadge}>You</span>}</span>
              <span className={styles.dot} aria-hidden />
              <span>{ago(post.publishedAt ?? post.createdAt)}{post.editedAt ? " (edited)" : ""}</span>
              <span className={styles.dot} aria-hidden />
              <span className={styles.views}><Eye size={15} /> {post.viewCount.toLocaleString("en-IN")} views</span>
              {post.viewer?.status === "PENDING_REVIEW" && <span className={`${styles.badge} ${styles.badgeDeal}`}>Awaiting review</span>}
            </div>
          </div>
          <div className={styles.tools}>
            {!mine && (
              <button type="button" className={`${styles.iconBtn} ${saved ? styles.iconOn : ""}`} aria-pressed={saved} aria-label={saved ? "Remove bookmark" : "Bookmark this discussion"} onClick={toggleSave}>{saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button>
            )}
            <Menu label="More actions" trigger={<MoreHorizontal size={18} />}>
              {(close) => (
                <>
                  {mine && canEdit && <button type="button" role="menuitem" onClick={() => { setEditing(true); close(); }}><Pencil size={16} /> Edit Post</button>}
                  {!mine && <button type="button" role="menuitem" className={styles.menuDanger} onClick={() => { close(); if (!signedIn) show("Sign in to report a discussion.", { signIn: true }); else setReporting(true); }}><Flag size={16} /> Report to Admin</button>}
                  <button type="button" role="menuitem" onClick={async () => { close(); try { await navigator.clipboard.writeText(url()); show("Link copied.", { ok: true }); } catch { show("Could not copy the link."); } }}><Link2 size={16} /> Copy Link</button>
                  {mine && <button type="button" role="menuitem" className={styles.menuDanger} onClick={() => { close(); void remove(); }}><Trash2 size={16} /> Delete Post</button>}
                </>
              )}
            </Menu>
          </div>
        </div>

        {editing ? (
          <div className={styles.editBox}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.newPostTitle} aria-label="Title" />
            <RichEditor id="edit-post" initialHtml={editHtml} version={1} limit={LIMITS.richBody} placeholder="Your post" onChange={(h, n) => { setEditHtml(h); setEditLen(n); }} />
            <div className={styles.cActionsRow}>
              <button type="button" className={styles.primary} disabled={busy || title.trim().length < 5 || (post.type !== "DEAL" && editLen < 10)} onClick={saveEdit}>{busy ? "Saving…" : "Save changes"}</button>
              <button type="button" className={styles.ghost} onClick={() => { setEditing(false); setTitle(post.title); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {post.type === "DEAL" && post.priceMinor != null && (
              <div className={styles.dealBox}>
                <strong>{rupees(post.priceMinor)}{post.mrpMinor ? <> <s>{rupees(post.mrpMinor)}</s></> : null}{post.merchantName ? <> at {post.merchantName}</> : null}</strong>
                {post.couponCode && <span>Coupon: <code>{post.couponCode}</code></span>}
                {post.url && <a href={post.url} target="_blank" rel="nofollow ugc noopener noreferrer">Open the store page ↗</a>}
                <span className={styles.notice}>Shared by a member. Price and link are not checked by MetaDeals4U. Check the store before you buy. This is not an official MetaDeals4U deal.</span>
              </div>
            )}
            <div className={styles.bodyRow}>
            <div className={styles.bodyText}>
            {/* Sanitized on the server when saved and again before it reaches this page. */}
            {safeHtml ? <div className={styles.content} dangerouslySetInnerHTML={{ __html: safeHtml }} /> : post.body ? <p className={`${styles.content} ${styles.plain}`}>{post.body}</p> : null}
            </div>
            {post.images.length > 0 && (
              <div className={styles.gallery}>
                {post.images.map((img) => (
                  <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer"><img src={img.url} alt="" loading="lazy" width={img.width} height={img.height} /></a>
                ))}
              </div>
            )}
            </div>
          </>
        )}

        <div className={styles.actions}>
          <VoteControl kind="post" id={post.id} score={post.score} initial={post.viewer?.vote ?? 0} disabled={mine || post.viewer?.status === "PENDING_REVIEW"} />
          <button type="button" className={`${styles.pill} ${liked ? styles.pillOn : ""} ${styles.like}`} aria-pressed={liked} onClick={toggleLike} disabled={likeBusy}><ThumbsUp size={17} /> Like ({likes})</button>
          {!post.locked && <button type="button" className={styles.pill} onClick={reply}><Reply size={17} /> Reply</button>}
          {!post.locked && <button type="button" className={styles.pill} onClick={quote}><Quote size={17} /> Quote Reply</button>}
          <ShareMenu path={shortPath(post.slug)} title={post.title} />
          {!mine && <button type="button" className={`${styles.pill} ${saved ? styles.pillOn : ""}`} aria-pressed={saved} onClick={toggleSave}>{saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />} {saved ? "Saved" : "Save"}</button>}
          <Link href={`/community/c/${post.community.slug}`} className={`${styles.pill} ${styles.pillLink}`}>More in {post.community.name} <Arrow size={15} /></Link>
        </div>
      </div>
      {reporting && <ReportDialog targetType="POST" targetId={post.id} onClose={() => setReporting(false)} onDone={(text, ok, signIn) => show(text, { ok, signIn })} />}
      {node}
    </article>
  );
}

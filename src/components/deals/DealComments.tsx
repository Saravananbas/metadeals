"use client";

import { useEffect, useMemo, useRef } from "react";
import { Calendar, ImagePlus, MessageCircle, Send, ThumbsUp, User, X } from "lucide-react";
import { ACCEPTED_IMAGES, useDealComments, type DealComment } from "./useDealComments";
import { MemberMenu } from "./MemberMenu";
import styles from "./DealComments.module.css";

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n));
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function Avatar({ comment }: { comment: DealComment }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (comment.member?.hasAvatar) return <img className={styles.avatar} src={`/api/v1/avatars/${comment.member.handle}`} alt="" width={56} height={56} loading="lazy" />;
  return <span className={styles.avatarFallback} aria-hidden="true"><User size={28} /></span>;
}

/** The comments on a deal page: member comments show a name menu, join month and like/reply buttons; guests are labelled Guest. Newest first, with the form to add one. */
export function DealComments({ dealIdOrSlug, messaging = false }: { dealIdOrSlug: string; messaging?: boolean }) {
  const c = useDealComments(dealIdOrSlug);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (c.image ? URL.createObjectURL(c.image) : null), [c.image]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function reply(comment: DealComment) {
    if (!c.content) c.setContent(`@${comment.member?.handle ?? comment.authorName} `);
    document.getElementById("deal-comment-text")?.focus();
  }

  return (
    <section className={styles.section} id="comments" aria-labelledby="deal-page-comments-title">
      <h2 id="deal-page-comments-title"><MessageCircle size={20} aria-hidden="true" /> Comments <span>({c.count})</span></h2>

      <div className={styles.list} aria-live="polite">
        {c.loading && <p className={styles.muted}>Loading comments…</p>}
        {!c.loading && !c.error && c.comments.length === 0 && <p className={styles.muted}>No comments yet. Be the first to share your thoughts about this deal.</p>}
        {c.comments.map((comment) => (
          <article className={styles.comment} key={comment.id}>
            <Avatar comment={comment} />
            <div className={styles.body}>
              <div className={styles.meta}>
                {comment.member ? <MemberMenu handle={comment.member.handle} messaging={messaging} label={comment.member.handle} /> : <><strong>{comment.authorName}</strong> <span className={styles.tag}>Guest</span></>}
                <time dateTime={comment.createdAt}>{when(comment.createdAt)}</time>
              </div>
              {comment.member && (
                <div className={styles.sub}>
                  <span><MessageCircle size={14} aria-hidden="true" /> {compact(comment.member.comments)} Comment{comment.member.comments === 1 ? "" : "s"}</span>
                  <span><Calendar size={14} aria-hidden="true" /> Joined {comment.member.joined}</span>
                </div>
              )}
              <p>{comment.content}</p>
              {comment.hasImage && (
                <a href={`${c.endpoint}/${comment.id}/image`} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.attached} src={`${c.endpoint}/${comment.id}/image`} alt="Picture attached to this comment" loading="lazy" />
                </a>
              )}
              <div className={styles.actions}>
                <button type="button" className={`${styles.pill} ${comment.liked ? styles.pillOn : ""}`} aria-pressed={Boolean(comment.liked)} onClick={() => void c.toggleLike(comment.id)}>
                  <ThumbsUp size={16} fill={comment.liked ? "currentColor" : "none"} aria-hidden="true" /> Like{comment.likes ? ` (${compact(comment.likes)})` : ""}
                </button>
                <button type="button" className={styles.pill} onClick={() => reply(comment)}>Reply</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <form className={styles.form} onSubmit={c.submit}>
        <strong>Leave a comment</strong>
        <label>
          Name <span>(optional, members use their user name)</span>
          <input value={c.authorName} onChange={(e) => c.setAuthorName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Guest" />
        </label>
        <label>
          Comment
          <textarea id="deal-comment-text" value={c.content} onChange={(e) => c.setContent(e.target.value)} maxLength={1000} rows={3} required placeholder="Share your thoughts about this deal" />
          <span className={styles.counter}>{c.content.length}/1000</span>
        </label>
        <div className={styles.attach}>
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGES} hidden onChange={(e) => { c.setImage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <button type="button" className={styles.pill} onClick={() => fileRef.current?.click()}><ImagePlus size={16} aria-hidden="true" /> Add picture</button>
          <span>JPEG, PNG, GIF, WebP or AVIF up to 5 MB. Members only; a GIF is saved as a still picture.</span>
        </div>
        {preview && (
          <div className={styles.previewBox}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Picture to be attached" />
            <button type="button" aria-label="Remove the picture" onClick={() => c.setImage(null)}><X size={16} /></button>
          </div>
        )}
        <label className={styles.honeypot} aria-hidden="true" tabIndex={-1}>
          Website
          <input value={c.website} onChange={(e) => c.setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
        {c.error && <p className={styles.error} role="alert">{c.error}</p>}
        {c.notice && <p className={styles.notice} role="status">{c.notice}</p>}
        <button className={styles.submit} type="submit" disabled={c.submitting || !c.content.trim()}>
          <Send size={16} aria-hidden="true" /> {c.submitting ? "Posting…" : "Post comment"}
        </button>
        <p className={styles.note}>Guests can comment without an account. Sign in to attach a picture, like comments and follow members. Please keep comments respectful.</p>
      </form>
    </section>
  );
}

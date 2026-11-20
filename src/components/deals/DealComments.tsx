"use client";

import { useEffect, useMemo, useRef } from "react";
import { Calendar, ImagePlus, MessageCircle, Send, ThumbsUp, User, X } from "lucide-react";
import { ACCEPTED_IMAGES, useDealComments, type DealComment } from "./useDealComments";
import { MemberMenu } from "./MemberMenu";
import styles from "./DealComments.module.css";

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n));
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function Avatar({ comment }: { comment: DealComment }) {
  return (
    <span className={styles.avatarWrap}>
      {comment.member?.hasAvatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className={styles.avatar} src={`/api/v1/avatars/${comment.member.handle}`} alt="" width={56} height={56} loading="lazy" />
        : <span className={styles.avatarFallback} aria-hidden="true"><User size={28} /></span>}
      {comment.member?.online && <span className={styles.online} role="img" aria-label="Online now" title="Online now" />}
    </span>
  );
}

/** The comments on a deal page: member comments show a name menu, join month and like/reply buttons; guests are labelled Guest. Newest first, with the form to add one. */
export function DealComments({ dealIdOrSlug, messaging = false }: { dealIdOrSlug: string; messaging?: boolean }) {
  const c = useDealComments(dealIdOrSlug);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (c.image ? URL.createObjectURL(c.image) : null), [c.image]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Replies sit under the comment they answer (one level deep); a reply whose parent is not in the list shows as a normal comment.
  const { tops, repliesOf } = useMemo(() => {
    const ids = new Set(c.comments.map((x) => x.id));
    const byParent = new Map<string, DealComment[]>();
    const top: DealComment[] = [];
    for (const x of c.comments) {
      if (x.parentId && ids.has(x.parentId)) byParent.set(x.parentId, [...(byParent.get(x.parentId) ?? []), x]);
      else top.push(x);
    }
    for (const list of byParent.values()) list.sort((p, q) => p.createdAt.localeCompare(q.createdAt));
    return { tops: top, repliesOf: byParent };
  }, [c.comments]);

  function reply(comment: DealComment) {
    const name = comment.member?.handle ?? comment.authorName;
    c.setReplyTo({ id: comment.parentId ?? comment.id, name });
    if (!c.content) c.setContent(`@${name} `);
    document.getElementById("deal-comment-text")?.focus();
  }

  function renderComment(comment: DealComment, isReply: boolean) {
    return (
      <article className={`${styles.comment} ${isReply ? styles.replyItem : ""}`} key={comment.id}>
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
            {c.signedIn && <button type="button" className={styles.pill} onClick={() => reply(comment)}>Reply</button>}
          </div>
          {repliesOf.get(comment.id)?.map((r) => renderComment(r, true))}
        </div>
      </article>
    );
  }

  return (
    <section className={styles.section} id="comments" aria-labelledby="deal-page-comments-title">
      <h2 id="deal-page-comments-title"><MessageCircle size={20} aria-hidden="true" /> Comments <span>({c.count})</span></h2>

      <div className={styles.list} aria-live="polite">
        {c.loading && <p className={styles.muted}>Loading comments…</p>}
        {!c.loading && !c.error && c.comments.length === 0 && <p className={styles.muted}>No comments yet. {c.signedIn ? "Be the first to share your thoughts about this deal." : "Sign in to start the conversation."}</p>}
        {tops.map((comment) => renderComment(comment, false))}
      </div>

      {c.signedIn === false && <p className={styles.signin}>Please <a href="/account">sign in</a> to comment, reply and like. Only signed-in members can comment.</p>}
      {c.signedIn && (
      <form className={styles.form} onSubmit={c.submit}>
        <strong>{c.replyTo ? "Write a reply" : "Leave a comment"}</strong>
        {c.replyTo && (
          <p className={styles.replying}>Replying to <strong>@{c.replyTo.name}</strong> <button type="button" onClick={() => c.setReplyTo(null)} aria-label="Cancel reply"><X size={14} /></button></p>
        )}
        <label>
          Comment
          <textarea id="deal-comment-text" value={c.content} onChange={(e) => c.setContent(e.target.value)} maxLength={1000} rows={3} required placeholder="Share your thoughts about this deal" />
          <span className={styles.counter}>{c.content.length}/1000</span>
        </label>
        <div className={styles.attach}>
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGES} hidden onChange={(e) => { c.setImage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          <button type="button" className={styles.pill} onClick={() => fileRef.current?.click()}><ImagePlus size={16} aria-hidden="true" /> Add picture</button>
          <span>JPEG, PNG, GIF, WebP or AVIF up to 5 MB. A GIF is saved as a still picture.</span>
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
          <Send size={16} aria-hidden="true" /> {c.submitting ? "Posting…" : c.replyTo ? "Post reply" : "Post comment"}
        </button>
        <p className={styles.note}>Your comment shows your user name. Please keep comments respectful.</p>
      </form>
      )}
    </section>
  );
}

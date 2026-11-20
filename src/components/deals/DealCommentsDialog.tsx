"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Send, X } from "lucide-react";
import { useDealComments } from "./useDealComments";
import styles from "./DealCommentsDialog.module.css";

type DealCommentsDialogProps = {
  dealIdOrSlug: string;
  dealTitle: string;
  onClose: () => void;
};

export function DealCommentsDialog({ dealIdOrSlug, dealTitle, onClose }: DealCommentsDialogProps) {
  const { comments, count, authorName, setAuthorName, content, setContent, website, setWebsite, loading, submitting, error, notice, submit } = useDealComments(dealIdOrSlug);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Rendered into <body>: inside a deal card a transformed or clipped ancestor would pin the "fixed" overlay to the card, far below the viewport.
  return createPortal(
    <div
      className={styles.backdrop}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-comments-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id="deal-comments-title"><MessageCircle size={19} /> Comments</h2>
            <p className={styles.dealTitle}>{dealTitle}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close comments">
            <X size={20} />
          </button>
        </header>

        <div className={styles.commentList} aria-live="polite">
          {loading && <p className={styles.muted}>Loading comments…</p>}
          {!loading && !error && comments.length === 0 && <p className={styles.muted}>No comments yet. Start the conversation.</p>}
          {comments.map((comment) => (
            <article className={styles.comment} key={comment.id}>
              <div className={styles.commentMeta}>
                <strong>{comment.authorName}</strong> <span className={styles.guestTag}>Guest</span>
                <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
              </div>
              <p>{comment.content}</p>
            </article>
          ))}
        </div>

        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formHeading}>
            <strong>Leave a comment</strong>
            <span>{count} {count === 1 ? "comment" : "comments"}</span>
          </div>
          <label className={styles.label}>
            Name <span>(optional)</span>
            <input value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={80} autoComplete="name" placeholder="Guest" />
          </label>
          <label className={styles.label}>
            Comment
            <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={1000} rows={3} required placeholder="Share your thoughts about this deal" />
            <span className={styles.counter}>{content.length}/1000</span>
          </label>
          <label className={styles.honeypot} aria-hidden="true" tabIndex={-1}>
            Website
            <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
          </label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <button className={styles.submitButton} type="submit" disabled={submitting || !content.trim()}>
            <Send size={16} /> {submitting ? "Posting…" : "Post comment"}
          </button>
          <p className={styles.privacyNote}>No account is required. Please keep comments respectful.</p>
        </form>
      </section>
    </div>,
    document.body,
  );
}

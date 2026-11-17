"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Send, X } from "lucide-react";
import styles from "./DealCommentsDialog.module.css";

type DealComment = {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
};

type CommentsResponse = {
  ok?: boolean;
  error?: { message?: string };
  data?: {
    comments?: DealComment[];
    count?: number | null;
    comment?: DealComment | null;
  };
};

async function readCommentsResponse(response: Response): Promise<CommentsResponse> {
  try {
    return await response.json() as CommentsResponse;
  } catch {
    throw new Error("Comments are temporarily unavailable.");
  }
}

type DealCommentsDialogProps = {
  dealIdOrSlug: string;
  dealTitle: string;
  onClose: () => void;
};

export function DealCommentsDialog({ dealIdOrSlug, dealTitle, onClose }: DealCommentsDialogProps) {
  const [comments, setComments] = useState<DealComment[]>([]);
  const [count, setCount] = useState(0);
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const endpoint = `/api/v1/deals/${encodeURIComponent(dealIdOrSlug)}/comments`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const result = await readCommentsResponse(response);
        if (!response.ok || !result.ok) throw new Error(result.error?.message || "Comments could not be loaded.");
        setComments(result.data?.comments ?? []);
        setCount(result.data?.count ?? 0);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Comments could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [endpoint]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ authorName, content, website }),
      });
      const result = await readCommentsResponse(response);
      if (!response.ok || !result.ok) throw new Error(result.error?.message || "Your comment could not be posted.");
      const postedComment = result.data?.comment;
      if (postedComment) {
        setComments((current) => [postedComment, ...current].slice(0, 100));
        setCount(result.data?.count ?? 0);
        setContent("");
        setWebsite("");
        setNotice("Your comment has been posted.");
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Your comment could not be posted.");
    } finally {
      setSubmitting(false);
    }
  }

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

        <form className={styles.form} onSubmit={submitComment}>
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

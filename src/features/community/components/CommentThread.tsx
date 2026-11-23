"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowBigDown, ArrowBigUp, ChevronDown, ChevronUp, Flag, MoreVertical, Pencil, Quote, Reply, ThumbsUp, Trash2 } from "lucide-react";
import { ago } from "./parts";
import { RichEditor } from "./RichEditor";
import { Menu, ReportDialog, ShareMenu, callApi, shortPath, useToast } from "./detail-shared";
import { LIMITS } from "../validation";
import styles from "../detail.module.css";

export type CommentView = {
  id: string; parentId: string | null; depth: number; createdAt: string; editedAt: string | null; score: number; likeCount: number; status: "PUBLISHED" | "DELETED" | "REMOVED";
  body: string | null; bodyHtml: string | null; author: { handle: string; avatarUrl?: string | null } | null; viewer?: { mine: boolean; vote: number; liked: boolean; version: number; canEdit: boolean };
};
type Sort = "newest" | "oldest" | "liked" | "upvoted";
const SORTS: { value: Sort; label: string }[] = [{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }, { value: "liked", label: "Most Liked" }, { value: "upvoted", label: "Most Upvoted" }];
const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function MiniVote({ id, score, initial, disabled, onNeedSignIn }: { id: string; score: number; initial: number; disabled?: boolean; onNeedSignIn: (text: string) => void }) {
  const [state, setState] = useState({ score, vote: initial }), [busy, setBusy] = useState(false);
  async function cast(value: 1 | -1) {
    if (busy) return; setBusy(true);
    const before = state, clearing = before.vote === value, nextVote = clearing ? 0 : value;
    setState({ vote: nextVote, score: before.score + nextVote - before.vote }); // shown at once, undone if refused
    const r = await callApi(`/api/v1/community/comments/${id}/vote`, clearing ? "DELETE" : "PUT", clearing ? undefined : { value });
    if (r.ok) setState({ score: r.data.score, vote: r.data.vote }); else { setState(before); onNeedSignIn(r.status === 401 ? "Sign in to vote." : r.error); }
    setBusy(false);
  }
  return (
    <span className={styles.mini}>
      <button type="button" className={`${styles.miniArrow} ${state.vote === 1 ? styles.miniOn : ""}`} aria-label="Upvote" aria-pressed={state.vote === 1} disabled={disabled || busy} onClick={() => void cast(1)}><ArrowBigUp size={18} /></button>
      <span aria-live="polite">{state.score}</span>
      <button type="button" className={`${styles.miniArrow} ${state.vote === -1 ? styles.miniDown : ""}`} aria-label="Downvote" aria-pressed={state.vote === -1} disabled={disabled || busy} onClick={() => void cast(-1)}><ArrowBigDown size={18} /></button>
    </span>
  );
}

function CommentItem({ c, all, op, slug, locked, signedIn, onReply, onQuote, onChanged, toast, openReport }: {
  c: CommentView; all: CommentView[]; op: string; slug: string; locked: boolean; signedIn: boolean;
  onReply: (c: CommentView) => void; onQuote: (c: CommentView) => void; onChanged: () => void; toast: (text: string, o?: { ok?: boolean; signIn?: boolean }) => void; openReport: (id: string) => void;
}) {
  const [liked, setLiked] = useState(c.viewer?.liked ?? false), [likes, setLikes] = useState(c.likeCount), [likeBusy, setLikeBusy] = useState(false);
  const [editing, setEditing] = useState(false), [editHtml, setEditHtml] = useState(c.bodyHtml ?? `<p>${escapeHtml(c.body ?? "").split("\n").join("</p><p>")}</p>`), [editLen, setEditLen] = useState((c.body ?? "").length), [busy, setBusy] = useState(false);
  const [hideReplies, setHideReplies] = useState(false);
  const children = all.filter((x) => x.parentId === c.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const mine = c.viewer?.mine ?? false;
  const withinEdit = c.viewer?.canEdit ?? false;

  if (c.status !== "PUBLISHED") return <div className={`${styles.comment} ${c.depth ? styles.reply : ""}`}><span /><p className={styles.tomb}>{c.status === "DELETED" ? "[deleted by the author]" : "[removed by a moderator]"}</p></div>;

  async function like() {
    if (likeBusy) return; setLikeBusy(true);
    const next = !liked; setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    const r = await callApi(`/api/v1/community/comments/${c.id}/like`, next ? "PUT" : "DELETE");
    if (r.ok) { setLikes(r.data.likeCount); setLiked(r.data.liked); } else { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); toast(r.status === 401 ? "Sign in to like comments." : r.error, { signIn: r.status === 401 }); }
    setLikeBusy(false);
  }
  async function saveEdit() {
    setBusy(true);
    const r = await callApi(`/api/v1/community/comments/${c.id}`, "PATCH", { version: c.viewer?.version ?? 1, bodyHtml: editHtml });
    setBusy(false);
    if (r.ok) { setEditing(false); toast("Comment updated.", { ok: true }); onChanged(); } else toast(r.error);
  }
  async function remove() {
    if (!window.confirm("Delete this comment?")) return;
    const r = await callApi(`/api/v1/community/comments/${c.id}`, "DELETE");
    if (r.ok) { toast("Comment deleted.", { ok: true }); onChanged(); } else toast(r.error);
  }

  return (
    <div id={`c-${c.id}`} className={`${styles.comment} ${c.depth ? styles.reply : ""}`}>
      <span className={styles.cAvatar} aria-hidden>{c.author?.avatarUrl ? <img src={c.author.avatarUrl} alt="" /> : (c.author?.handle ?? "?").slice(0, 1).toUpperCase()}</span>
      <div style={{ minWidth: 0 }}>
        <div className={styles.cMeta}>
          <Link href={`/community/u/${c.author?.handle}`}>{c.author?.handle}</Link>
          {c.author?.handle === op && <span className={styles.authorBadge}>Author</span>}
          <span className={styles.when}>· {ago(c.createdAt)}{c.editedAt ? " (edited)" : ""}</span>
        </div>
        {editing ? (
          <div className={styles.editBox}>
            <RichEditor id={`edit-${c.id}`} initialHtml={editHtml} version={1} limit={LIMITS.richComment} placeholder="Edit your comment" minHeight={90} onChange={(h, n) => { setEditHtml(h); setEditLen(n); }} />
            <div className={styles.cActionsRow}><button type="button" className={styles.primary} disabled={busy || editLen < 1} onClick={saveEdit}>{busy ? "Saving…" : "Save"}</button><button type="button" className={styles.ghost} onClick={() => setEditing(false)}>Cancel</button></div>
          </div>
        ) : c.bodyHtml ? <div className={styles.cBody} dangerouslySetInnerHTML={{ __html: c.bodyHtml }} /> : <p className={`${styles.cBody} ${styles.plain}`}>{c.body}</p>}
        <div className={styles.cActions}>
          <MiniVote id={c.id} score={c.score} initial={c.viewer?.vote ?? 0} disabled={mine} onNeedSignIn={(t) => toast(t, { signIn: !signedIn })} />
          <button type="button" className={`${styles.cBtn} ${liked ? styles.cBtnOn : ""}`} aria-pressed={liked} onClick={like} disabled={likeBusy}><ThumbsUp size={15} /> Like ({likes})</button>
          {!locked && c.depth < LIMITS.maxCommentDepth && <button type="button" className={styles.cBtn} onClick={() => onReply(c)}><Reply size={15} /> Reply</button>}
          {!locked && <button type="button" className={styles.cBtn} onClick={() => onQuote(c)}><Quote size={15} /> Quote</button>}
          <ShareMenu path={shortPath(slug, c.id)} title="A comment on MetaDeals4U" className={styles.cBtn} compact />
          <span className={styles.spacer} />
          <Menu label="Comment actions" trigger={<MoreVertical size={16} />}>
            {(close) => (
              <>
                {mine && withinEdit && !locked && <button type="button" role="menuitem" onClick={() => { setEditing(true); close(); }}><Pencil size={16} /> Edit</button>}
                {mine && <button type="button" role="menuitem" className={styles.menuDanger} onClick={() => { close(); void remove(); }}><Trash2 size={16} /> Delete</button>}
                {!mine && <button type="button" role="menuitem" className={styles.menuDanger} onClick={() => { close(); if (!signedIn) toast("Sign in to report a comment.", { signIn: true }); else openReport(c.id); }}><Flag size={16} /> Report</button>}
              </>
            )}
          </Menu>
        </div>
        {children.length > 0 && c.depth === 0 && (
          <button type="button" className={styles.cBtn} onClick={() => setHideReplies((v) => !v)} aria-expanded={!hideReplies}>{hideReplies ? <ChevronDown size={15} /> : <ChevronUp size={15} />} {hideReplies ? `Show ${children.length} ${children.length === 1 ? "reply" : "replies"}` : "Hide replies"}</button>
        )}
        {!hideReplies && children.map((child) => <CommentItem key={child.id} c={child} all={all} op={op} slug={slug} locked={locked} signedIn={signedIn} onReply={onReply} onQuote={onQuote} onChanged={onChanged} toast={toast} openReport={openReport} />)}
      </div>
    </div>
  );
}

export function CommentThread({ postId, slug, op, locked, signedIn, initial, initialCursor, total }: { postId: string; slug: string; op: string; locked: boolean; signedIn: boolean; initial: CommentView[]; initialCursor: string | null; total: number }) {
  const { show, node } = useToast();
  const [items, setItems] = useState(initial), [cursor, setCursor] = useState(initialCursor), [count, setCount] = useState(total);
  const [sort, setSort] = useState<Sort>("newest"), [loading, setLoading] = useState(false), [more, setMore] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; handle: string } | null>(null);
  const [html, setHtml] = useState(""), [len, setLen] = useState(0), [seed, setSeed] = useState({ html: "", v: 0 }), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  const load = useCallback(async (nextSort: Sort, after?: string | null) => {
    const params = new URLSearchParams({ sort: nextSort }); if (after) params.set("cursor", after);
    const r = await callApi(`/api/v1/community/posts/${postId}/comments?${params}`, "GET");
    if (!r.ok) throw new Error(r.error);
    return r.data as { items: CommentView[]; nextCursor: string | null };
  }, [postId]);

  const refresh = useCallback(async (s: Sort = sort) => {
    setLoading(true);
    try { const d = await load(s); setItems(d.items); setCursor(d.nextCursor); setCount(d.items.filter((x) => x.status === "PUBLISHED").length); } catch (e) { show(e instanceof Error ? e.message : "Could not load comments."); }
    setLoading(false);
  }, [load, sort, show]);

  useEffect(() => { if (first.current) { first.current = false; return; } void refresh(sort); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  const focusComposer = () => { composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => (document.getElementById("comment-editor") as HTMLElement | null)?.focus(), 350); };
  const addQuote = useCallback((handle: string, text: string) => {
    const quoted = `<blockquote><p><strong>${escapeHtml(handle)} wrote:</strong></p><p>${escapeHtml(text.slice(0, 400)).split("\n").join("</p><p>")}</p></blockquote><p></p>`;
    setSeed((s) => ({ html: (html || "") + quoted, v: s.v + 1 })); focusComposer();
  }, [html]);
  useEffect(() => {
    const onQuote = (e: Event) => { const d = (e as CustomEvent).detail as { handle: string; text: string }; setReplyTo(null); addQuote(d.handle, d.text); };
    const onReply = () => { setReplyTo(null); focusComposer(); };
    window.addEventListener("md-quote", onQuote); window.addEventListener("md-reply-post", onReply);
    return () => { window.removeEventListener("md-quote", onQuote); window.removeEventListener("md-reply-post", onReply); };
  }, [addQuote]);

  async function post() {
    if (busy || len < 1) return; setBusy(true); setError("");
    const r = await callApi(`/api/v1/community/posts/${postId}/comments`, "POST", { bodyHtml: html, parentId: replyTo?.id ?? null });
    setBusy(false);
    if (!r.ok) { setError(r.status === 401 ? "Please sign in to comment." : r.error); return; }
    setSeed((s) => ({ html: "", v: s.v + 1 })); setHtml(""); setLen(0); setReplyTo(null);
    show("Comment posted.", { ok: true }); await refresh(sort);
  }
  const cancel = () => { setSeed((s) => ({ html: "", v: s.v + 1 })); setHtml(""); setLen(0); setReplyTo(null); setError(""); };

  const roots = useMemo(() => items.filter((c) => c.parentId === null), [items]);

  return (
    <section className={`${styles.card} ${styles.commentsCard}`} id="comments" aria-label="Comments">
      <div className={styles.cHead}>
        <h2>{count} {count === 1 ? "Comment" : "Comments"}</h2>
        <label className={styles.sort}>Sort by: <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort comments">{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      </div>

      {loading ? <><div className={styles.skeleton} /><div className={styles.skeleton} /></> : roots.length ? roots.map((c) => (
        <CommentItem key={c.id} c={c} all={items} op={op} slug={slug} locked={locked} signedIn={signedIn} toast={show} openReport={setReportId}
          onReply={(x) => { setReplyTo({ id: x.id, handle: x.author?.handle ?? "" }); focusComposer(); }}
          onQuote={(x) => { setReplyTo(x.depth < LIMITS.maxCommentDepth ? { id: x.id, handle: x.author?.handle ?? "" } : null); addQuote(x.author?.handle ?? "", x.body ?? ""); }}
          onChanged={() => void refresh(sort)} />
      )) : <p className={styles.empty}>No comments yet. Be the first to reply.</p>}

      {cursor && !loading && <button type="button" className={styles.ghost} disabled={more} onClick={async () => { setMore(true); try { const d = await load(sort, cursor); setItems((l) => [...l, ...d.items.filter((n) => !l.some((x) => x.id === n.id))]); setCursor(d.nextCursor); } catch { show("Could not load more comments."); } setMore(false); }}>{more ? "Loading…" : "Load more comments"}</button>}

      <div className={styles.composer} ref={composerRef}>
        <h3>Add a comment</h3>
        {locked ? <p className={styles.signInNote}>This discussion is locked.</p>
          : !signedIn ? <p className={styles.signInNote}>Please <Link href="/account">sign in</Link> to join the conversation.</p>
          : (
            <>
              {replyTo && <div className={styles.replyChip}><span>Replying to <strong>{replyTo.handle}</strong></span><button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel the reply">✕ Cancel reply</button></div>}
              <RichEditor id="comment-editor" initialHtml={seed.html} version={seed.v} limit={LIMITS.richComment} placeholder="Write your comment…" minHeight={110} onChange={(h, n) => { setHtml(h); setLen(n); }} />
              {error && <span className={styles.err} role="alert">{error}</span>}
              <div className={styles.cActionsRow}>
                <button type="button" className={styles.primary} onClick={post} disabled={busy || len < 1 || len > LIMITS.richComment}>{busy ? "Posting…" : "Post Comment"}</button>
                <button type="button" className={styles.ghost} onClick={cancel} disabled={busy}>Cancel</button>
              </div>
            </>
          )}
      </div>
      {reportId && <ReportDialog targetType="COMMENT" targetId={reportId} onClose={() => setReportId(null)} onDone={(text, ok, signIn) => show(text, { ok, signIn })} />}
      {node}
    </section>
  );
}

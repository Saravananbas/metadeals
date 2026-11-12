"use client";
import { useState } from "react";
import Link from "next/link";
import { RichText, ago } from "./parts";
import { ReportButton } from "./PostActions";
import { VoteControl } from "./VoteControl";
import { LIMITS } from "../validation";
import styles from "../community.module.css";

export type CommentView = {
  id: string; parentId: string | null; depth: number; createdAt: string; editedAt: string | null; score: number; status: "PUBLISHED" | "DELETED" | "REMOVED";
  body: string | null; author: { handle: string } | null; viewer?: { mine: boolean; vote: number; version: number };
};

function Composer({ postId, parentId, onDone, locked }: { postId: string; parentId?: string; onDone: (c: CommentView) => void; locked: boolean }) {
  const [body, setBody] = useState("");
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  if (locked) return <p className={styles.notice}>This discussion is locked.</p>;
  return (
    <form className={styles.form} onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setSay("");
      try {
        const response = await fetch(`/api/v1/community/posts/${postId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, parentId: parentId ?? null }) });
        const result = await response.json().catch(() => ({}));
        if (response.ok) { onDone(result.data); setBody(""); }
        else setSay(response.status === 401 ? "Please sign in to comment." : result?.error ?? "Could not post your comment");
      } finally { setBusy(false); }
    }}>
      <label>{parentId ? "Your reply" : "Add a comment"}
        <textarea rows={3} value={body} maxLength={LIMITS.comment} required onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className={styles.actions}>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || body.trim().length === 0}>{busy ? "Posting…" : "Post"}</button>
        {say && <span className={styles.err} role="alert">{say} {say.startsWith("Please sign in") && <Link href="/account">Sign in</Link>}</span>}
      </div>
    </form>
  );
}

function Node({ c, all, postId, locked, onAdd }: { c: CommentView; all: CommentView[]; postId: string; locked: boolean; onAdd: (c: CommentView) => void }) {
  const [replying, setReplying] = useState(false);
  const children = all.filter((x) => x.parentId === c.id);
  return (
    <div className={`${styles.comment} ${c.depth === 0 ? styles.commentRoot : ""}`}>
      {c.status === "PUBLISHED" ? (
        <>
          <div className={styles.meta}>
            <Link href={`/community/u/${c.author?.handle}`}>{c.author?.handle}</Link><span>{ago(c.createdAt)}</span>{c.editedAt && <span>(edited)</span>}
          </div>
          <RichText text={c.body ?? ""} className={styles.body} />
          <div className={styles.actions}>
            <VoteControl kind="comment" id={c.id} score={c.score} initial={c.viewer?.vote ?? 0} disabled={c.viewer?.mine} />
            {c.depth < LIMITS.maxCommentDepth && !locked && <button className={styles.btn} onClick={() => setReplying((v) => !v)}>Reply</button>}
            {!c.viewer?.mine && <ReportButton targetType="COMMENT" targetId={c.id} />}
          </div>
          {replying && <Composer postId={postId} parentId={c.id} locked={locked} onDone={(n) => { onAdd(n); setReplying(false); }} />}
        </>
      ) : <p className={styles.tomb}>{c.status === "DELETED" ? "[deleted by the author]" : "[removed by a moderator]"}</p>}
      {children.map((child) => <Node key={child.id} c={child} all={all} postId={postId} locked={locked} onAdd={onAdd} />)}
    </div>
  );
}

export function CommentSection({ postId, initial, locked }: { postId: string; initial: CommentView[]; locked: boolean }) {
  const [items, setItems] = useState(initial);
  const add = (c: CommentView) => setItems((list) => [...list, c]);
  const roots = items.filter((c) => c.parentId === null);
  return (
    <section aria-label="Comments">
      <h2>{items.filter((c) => c.status === "PUBLISHED").length} comments</h2>
      <Composer postId={postId} locked={locked} onDone={add} />
      {roots.map((c) => <Node key={c.id} c={c} all={items} postId={postId} locked={locked} onAdd={add} />)}
      {!roots.length && <p className={styles.notice}>No comments yet. Be the first to reply.</p>}
    </section>
  );
}

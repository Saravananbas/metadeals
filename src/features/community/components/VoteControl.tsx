"use client";
import { useState } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import styles from "../community.module.css";

/** Up arrow, count, down arrow in one row (outline arrows; the chosen one fills in). Uses the existing voting API. */
export function VoteControl({ kind, id, score, initial, disabled }: { kind: "post" | "comment"; id: string; score: number; initial: number; disabled?: boolean }) {
  const [state, setState] = useState({ score, vote: initial });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function cast(value: 1 | -1) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const before = state, clearing = before.vote === value, next = clearing ? 0 : value;
    setState({ vote: next, score: before.score + next - before.vote }); // shown at once, undone if the server refuses
    const url = `/api/v1/community/${kind === "post" ? "posts" : "comments"}/${id}/vote`;
    try {
      const response = await fetch(url, { method: clearing ? "DELETE" : "PUT", headers: clearing ? undefined : { "Content-Type": "application/json" }, body: clearing ? undefined : JSON.stringify({ value }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setState(before); setMessage(response.status === 401 ? "Sign in to vote" : body?.error ?? "Could not vote"); }
      else setState({ score: body.data.score, vote: body.data.vote });
    } catch { setState(before); setMessage("Network problem"); }
    finally { setBusy(false); }
  }

  return (
    <span className={styles.voteRow}>
      <button type="button" className={`${styles.voteArrow} ${state.vote === 1 ? styles.voteArrowUp : ""}`} aria-label="Upvote" aria-pressed={state.vote === 1} disabled={busy || disabled} onClick={() => void cast(1)}><ArrowBigUp size={22} strokeWidth={1.8} /></button>
      <span className={styles.voteCount} aria-live="polite">{state.score}</span>
      <button type="button" className={`${styles.voteArrow} ${state.vote === -1 ? styles.voteArrowDown : ""}`} aria-label="Downvote" aria-pressed={state.vote === -1} disabled={busy || disabled} onClick={() => void cast(-1)}><ArrowBigDown size={22} strokeWidth={1.8} /></button>
      {message && <span className={styles.notice} role="status">{message}</span>}
    </span>
  );
}

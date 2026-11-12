"use client";
import { useState } from "react";
import styles from "../community.module.css";

export function VoteControl({ kind, id, score, initial, disabled }: { kind: "post" | "comment"; id: string; score: number; initial: number; disabled?: boolean }) {
  const [state, setState] = useState({ score, vote: initial });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function cast(value: 1 | -1) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const url = `/api/v1/community/${kind === "post" ? "posts" : "comments"}/${id}/vote`;
    const clearing = state.vote === value;
    try {
      const response = await fetch(url, { method: clearing ? "DELETE" : "PUT", headers: clearing ? undefined : { "Content-Type": "application/json" }, body: clearing ? undefined : JSON.stringify({ value }) });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) setMessage("Sign in to vote");
      else if (!response.ok) setMessage(body?.error ?? "Could not vote");
      else setState({ score: body.data.score, vote: body.data.vote });
    } finally { setBusy(false); }
  }

  return (
    <div className={styles.vote}>
      <button type="button" className={`${styles.voteBtn} ${state.vote === 1 ? styles.voteOn : ""}`} aria-label="Upvote" aria-pressed={state.vote === 1} disabled={busy || disabled} onClick={() => void cast(1)}>▲</button>
      <span className={styles.score} aria-live="polite">{state.score}</span>
      <button type="button" className={`${styles.voteBtn} ${state.vote === -1 ? styles.voteDown : ""}`} aria-label="Downvote" aria-pressed={state.vote === -1} disabled={busy || disabled} onClick={() => void cast(-1)}>▼</button>
      {message && <span className={styles.notice} role="status">{message}</span>}
    </div>
  );
}

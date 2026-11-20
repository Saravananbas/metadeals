"use client";

import { useEffect, useState, type FormEvent } from "react";
import styles from "./DealExtras.module.css";

type Note = { id: string; content: string; createdAt: string; author: string; mine: boolean };

/** Community Notes: short tips from signed-in members about this deal. Reading is public; writing needs an account (the server decides). */
export function DealNotes({ slug }: { slug: string }) {
  const base = `/api/v1/deals/${encodeURIComponent(slug)}/notes`;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; signIn: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(base, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((b) => setNotes(b?.data?.notes ?? []))
      .catch(() => { if (!controller.signal.aborted) setNotes([]); });
    return () => controller.abort();
  }, [base]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setError({ message: body?.error ?? "Your note could not be added.", signIn: response.status === 401 }); return; }
      setNotes((current) => [body.data.note, ...(current ?? [])]);
      setText("");
    } catch { setError({ message: "Your note could not be added.", signIn: false }); } finally { setBusy(false); }
  }

  async function remove(id: string) {
    const response = await fetch(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setNotes((current) => (current ?? []).filter((n) => n.id !== id));
  }

  return (
    <>
      <h3>Community Notes</h3>
      <p className={styles.muted}>Short, useful facts from members: bank offers that work, price changes, stock. For a conversation, use the comments below.</p>
      <div aria-live="polite">
        {notes === null && <p className={styles.muted}>Loading notes…</p>}
        {notes?.length === 0 && <p className={styles.muted}>No notes yet. Add the first tip.</p>}
        {!!notes?.length && (
          <ul className={styles.noteList}>
            {notes.map((n) => (
              <li key={n.id} className={styles.note}>
                <div className={styles.noteMeta}>
                  <strong>@{n.author}</strong>
                  <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</time>
                  {n.mine && <button type="button" className={styles.link} onClick={() => void remove(n.id)}>Delete</button>}
                </div>
                <p>{n.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form className={styles.form} onSubmit={submit}>
        <label htmlFor={`note-${slug}`}><strong>Add a note</strong></label>
        <textarea id={`note-${slug}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="e.g. Extra 5% off with HDFC credit cards at checkout" />
        {error && <p className={styles.error} role="alert">{error.message}{error.signIn && <> <a href="/account">Sign in</a></>}</p>}
        <button className={styles.submit} type="submit" disabled={busy || text.trim().length < 3}>{busy ? "Adding…" : "Add note"}</button>
      </form>
    </>
  );
}

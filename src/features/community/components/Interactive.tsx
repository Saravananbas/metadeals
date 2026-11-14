"use client";
import { useEffect, useState } from "react";
import styles from "../community.module.css";

/** Icon bookmark used on discussion cards (same save API as the Save button on a post page). */
export function BookmarkButton({ id, saved, disabled }: { id: string; saved: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(saved);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span className={styles.bookmarkWrap}>
      <button type="button" className={`${styles.iconBtn} ${on ? styles.iconOn : ""}`} aria-pressed={on} aria-label={on ? "Remove bookmark" : "Bookmark this discussion"} title={on ? "Saved" : "Save"} disabled={busy || disabled} onClick={async () => {
        setBusy(true); setNote("");
        try {
          const response = await fetch(`/api/v1/community/posts/${id}/save`, { method: on ? "DELETE" : "PUT" });
          if (response.ok) setOn(!on);
          else setNote(response.status === 401 ? "Sign in to save" : "Could not save");
        } finally { setBusy(false); }
      }}>{on ? "★" : "☆"}</button>
      {note && <span className={styles.notice} role="status">{note}</span>}
    </span>
  );
}

/** Counts one view per visitor and discussion (the server also limits repeats); never blocks the page. */
export function PostViewTracker({ id }: { id: string }) {
  useEffect(() => {
    const key = `md_post_view_${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    fetch(`/api/v1/community/posts/${id}/view`, { method: "POST" }).catch(() => {});
  }, [id]);
  return null;
}

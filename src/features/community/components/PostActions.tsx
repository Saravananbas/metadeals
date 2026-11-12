"use client";
import { useState } from "react";
import Link from "next/link";
import { REPORT_CATEGORIES, REPORT_LABELS } from "../validation";
import styles from "../community.module.css";

type Say = { ok: boolean; text: string } | null;

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, result };
}
const signInNote = (status: number) => (status === 401 ? "Please sign in first." : null);

export function FollowButton({ slug, following }: { slug: string; following: boolean }) {
  const [on, setOn] = useState(following);
  const [say, setSay] = useState("");
  return (
    <>
      <button className={styles.btn} aria-pressed={on} onClick={async () => {
        const r = await send(`/api/v1/community/communities/${slug}/follow`, on ? "DELETE" : "PUT");
        if (r.ok) { setOn(!on); setSay(""); } else setSay(signInNote(r.status) ?? r.result?.error ?? "Could not update");
      }}>{on ? "Following ✓" : "Follow"}</button>
      {say && <span className={styles.notice} role="status">{say}</span>}
    </>
  );
}

export function SaveButton({ id, saved }: { id: string; saved: boolean }) {
  const [on, setOn] = useState(saved);
  const [say, setSay] = useState("");
  return (
    <>
      <button className={styles.btn} aria-pressed={on} onClick={async () => {
        const r = await send(`/api/v1/community/posts/${id}/save`, on ? "DELETE" : "PUT");
        if (r.ok) { setOn(!on); setSay(""); } else setSay(signInNote(r.status) ?? r.result?.error ?? "Could not save");
      }}>{on ? "Saved ✓" : "Save"}</button>
      {say && <span className={styles.notice} role="status">{say}</span>}
    </>
  );
}

export function ReportButton({ targetType, targetId }: { targetType: "POST" | "COMMENT" | "PROFILE"; targetId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number]>("SPAM");
  const [details, setDetails] = useState("");
  const [say, setSay] = useState<Say>(null);
  if (!open) return <button className={styles.btn} onClick={() => setOpen(true)}>Report</button>;
  return (
    <form className={styles.form} style={{ marginTop: 8, maxWidth: 420 }} onSubmit={async (e) => {
      e.preventDefault();
      const r = await send("/api/v1/community/reports", "POST", { targetType, targetId, category, details: details || null });
      if (r.ok) { setSay({ ok: true, text: r.result.data.duplicate ? "You already reported this. Thank you." : "Thank you. Our team will look at it." }); setOpen(false); }
      else setSay({ ok: false, text: signInNote(r.status) ?? r.result?.error ?? "Could not send the report" });
    }}>
      <label>What is wrong?
        <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{REPORT_LABELS[c]}</option>)}</select>
      </label>
      <label>More detail (optional)<textarea rows={2} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
      <div className={styles.actions}>
        <button className={`${styles.btn} ${styles.btnPrimary}`}>Send report</button>
        <button type="button" className={styles.btn} onClick={() => setOpen(false)}>Cancel</button>
        {say && <span className={say.ok ? styles.ok : styles.err} role="status">{say.text}</span>}
      </div>
      <span className={styles.notice}>Reports are private. See also the <Link href="/privacy">privacy details</Link>.</span>
    </form>
  );
}

export function ReportedNote() { return null; }

"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./profile.module.css";

type Notices = {
  restricted: boolean;
  warnings: { id: string; reason: string; status: string; at: string; appeal: string | null }[];
  restrictions: { id: string; reason: string; expiresAt: string; revokedAt: string | null; active: boolean; at: string; appeal: string | null }[];
  removals: { id: string; kind: string; at: string; appeal: string | null }[];
  appeals: { id: string; targetType: string; status: string; note: string | null; at: string; decidedAt: string | null }[];
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

/** A member's own moderation notices and appeals. Moderators are never named. */
export function MyModeration() {
  const [data, setData] = useState<Notices | null>(null), [error, setError] = useState(""), [open, setOpen] = useState<{ type: string; id: string } | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [say, setSay] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/customer/community/moderation", { cache: "no-store" }).catch(() => null);
    const b = await r?.json().catch(() => null);
    if (r?.ok) setData(b.data); else setError(b?.error ?? "Could not load your notices.");
  }, []);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  async function appeal() {
    if (!open) return;
    setBusy(true); setSay("");
    const r = await fetch("/api/v1/customer/community/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: open.type, targetId: open.id, message }) }).catch(() => null);
    const b = await r?.json().catch(() => null);
    if (r?.ok) { setOpen(null); setMessage(""); setSay("Your appeal was sent. An administrator who was not involved will review it."); void load(); } else setSay(b?.error ?? "Could not send the appeal.");
    setBusy(false);
  }
  const AppealButton = ({ type, id, existing }: { type: string; id: string; existing: string | null }) => existing
    ? <span className={styles.hint}>Appeal: {existing.toLowerCase()}</span>
    : <button type="button" className={styles.btn} onClick={() => { setOpen({ type, id }); setSay(""); }}>Appeal</button>;

  if (error) return <div className={`${styles.card} ${styles.form}`}><p className={styles.hintErr}>{error}</p></div>;
  if (!data) return <div className={`${styles.card} ${styles.form}`}><p className={styles.hint}>Loading…</p></div>;
  const none = !data.warnings.length && !data.restrictions.length && !data.removals.length && !data.appeals.length;
  return (
    <div className={styles.wrap}>
      <section className={`${styles.card} ${styles.panel}`}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Moderation notices</h1>
        {data.restricted && <p className={styles.sayErr} role="status">Posting is currently paused on your account. You can still read, vote, save and message.</p>}
        {none && <p className={styles.empty}>No warnings, restrictions or removals in the last 90 days.</p>}
        {say && <p className={styles.hint} role="status">{say}</p>}
      </section>
      {open && (
        <section className={`${styles.card} ${styles.panel}`} aria-label="Appeal">
          <h2>Appeal</h2>
          <label className={styles.field}>Why should this be reconsidered?<textarea rows={4} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <div className={styles.actions}><button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || message.trim().length < 10} onClick={() => void appeal()}>Send appeal</button><button className={styles.btn} onClick={() => setOpen(null)}>Cancel</button></div>
        </section>
      )}
      {data.restrictions.length > 0 && <section className={`${styles.card} ${styles.panel}`}><h2>Posting restrictions</h2><ul className={styles.list}>{data.restrictions.map((r) => <li key={r.id}><div className={styles.grow}>{r.reason}<p>{r.active ? `Ends ${when(r.expiresAt)}` : r.revokedAt ? "Lifted" : "Ended"} · started {when(r.at)}</p></div>{r.active && <AppealButton type="RESTRICTION" id={r.id} existing={r.appeal} />}{!r.active && r.appeal && <span className={styles.hint}>Appeal: {r.appeal.toLowerCase()}</span>}</li>)}</ul></section>}
      {data.warnings.length > 0 && <section className={`${styles.card} ${styles.panel}`}><h2>Warnings</h2><ul className={styles.list}>{data.warnings.map((w) => <li key={w.id}><div className={styles.grow}>{w.reason}<p>{when(w.at)}{w.status === "WITHDRAWN" ? " · withdrawn" : ""}</p></div>{w.status === "ACTIVE" && <AppealButton type="WARNING" id={w.id} existing={w.appeal} />}</li>)}</ul></section>}
      {data.removals.length > 0 && <section className={`${styles.card} ${styles.panel}`}><h2>Removed content</h2><ul className={styles.list}>{data.removals.map((x) => <li key={x.id}><div className={styles.grow}>A {x.kind} of yours was removed<p>{when(x.at)}</p></div><AppealButton type="ACTION" id={x.id} existing={x.appeal} /></li>)}</ul></section>}
      {data.appeals.length > 0 && <section className={`${styles.card} ${styles.panel}`}><h2>Your appeals</h2><ul className={styles.list}>{data.appeals.map((a) => <li key={a.id}><div className={styles.grow}>{a.targetType.toLowerCase()} · {a.status === "OPEN" ? "waiting for review" : a.status === "OVERTURNED" ? "accepted" : "declined"}{a.note ? <p>{a.note}</p> : null}<p>{when(a.at)}</p></div></li>)}</ul></section>}
    </div>
  );
}

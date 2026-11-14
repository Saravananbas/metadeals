"use client";
import { useEffect, useState } from "react";
import styles from "./profile.module.css";

type Preview = { guidelinesVersion: string; guidelines: string[]; probationDays: number; expiresAt: string };

/** The invited member reads the guidelines and accepts. Only the member the invitation was made for can open it (the server checks the signed-in account). */
export function ModeratorInvite({ token }: { token: string }) {
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState(""), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [setupUrl, setSetupUrl] = useState("");
  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/customer/moderator-invite?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (r) => {
      const b = await r.json().catch(() => null);
      if (r.ok) setPreview(b.data); else setError(b?.error ?? "This invitation is not valid.");
    }).catch(() => setError("Could not check the invitation."));
  }, [token]);

  async function accept() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/v1/customer/moderator-invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, agree: true, guidelinesVersion: preview.guidelinesVersion }) });
      const b = await r.json().catch(() => null);
      if (r.ok) setSetupUrl(b.data.setupUrl); else setError(b?.error ?? "Could not accept the invitation.");
    } catch { setError("Could not accept the invitation."); }
    setBusy(false);
  }

  if (!token) return <div className={`${styles.card} ${styles.form}`}><p className={styles.hintErr}>This page needs the invitation link an administrator gave you.</p></div>;
  if (setupUrl) return (
    <div className={`${styles.card} ${styles.form}`}>
      <h1>Invitation accepted</h1>
      <p>One more step: set a password and an authenticator app for your moderator sign-in. This is separate from your member account and cannot be skipped.</p>
      <a className={`${styles.btn} ${styles.btnPrimary}`} href={setupUrl}>Set up moderator sign-in</a>
      <p className={styles.hint}>This link is for you only and expires. Do not share it.</p>
    </div>
  );
  return (
    <div className={`${styles.card} ${styles.form}`}>
      <h1>Community moderator invitation</h1>
      {error && <p className={styles.hintErr} role="alert">{error}</p>}
      {preview && (<>
        <p>You have been invited to help moderate the MetaDeals4U community. You start with {preview.probationDays} days of probation, and an administrator decides afterwards.</p>
        <ol style={{ paddingLeft: 20, display: "grid", gap: 8 }}>{preview.guidelines.map((g) => <li key={g}>{g}</li>)}</ol>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 4 }} /> I have read and agree to follow these guidelines (version {preview.guidelinesVersion}).</label>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!agree || busy} onClick={() => void accept()}>{busy ? "Accepting…" : "Accept and continue"}</button>
      </>)}
    </div>
  );
}

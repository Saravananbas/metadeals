"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./profile.module.css";

type Identity = { handle: string; needsUserName: boolean; avatarUrl: string | null };

async function call(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? "Please try again.");
  return body.data as Identity;
}

function useIdentity() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  useEffect(() => {
    let alive = true;
    call("/api/v1/customer/identity").then((d) => alive && setIdentity(d)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return [identity, setIdentity] as const;
}

/** Shown once after sign-up (and until a user name is chosen): the name appears next to deals and posts the member shares. */
export function UserNamePrompt() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (typeof localStorage !== "undefined" && Date.now() < Number(localStorage.getItem("md_username_later") ?? 0)) return;
    call("/api/v1/customer/identity").then((d) => alive && setIdentity(d)).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!identity?.needsUserName || dismissed) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Choose your user name" style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--md-neutral-900) 45%, transparent)", display: "grid", placeItems: "center", zIndex: 2000, padding: 16 }}>
      <form className={`${styles.card} ${styles.form}`} style={{ maxWidth: 420, width: "100%" }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setSay("");
        try { setIdentity(await call("/api/v1/customer/identity", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: new FormData(e.currentTarget).get("handle") }) })); }
        catch (error) { setSay(error instanceof Error ? error.message : "Could not save"); }
        finally { setBusy(false); }
      }}>
        <h2 style={{ margin: 0 }}>Choose your user name</h2>
        <p className={styles.hint}>This name is shown next to the deals and posts you share. It is not your real name or email. 3 to 30 letters, numbers or underscores.</p>
        <label>User name<input name="handle" required autoFocus pattern="[a-zA-Z0-9_]{3,30}" placeholder="e.g. deal_hunter" /></label>
        {say && <div className={styles.err} role="alert">{say}</div>}
        <div className={styles.actions}>
          <button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className={styles.secondary} onClick={() => { localStorage.setItem("md_username_later", String(Date.now() + 7 * 86_400_000)); setDismissed(true); }}>Maybe later</button>
        </div>
      </form>
    </div>
  );
}

/** User name and profile picture, on the profile page. */
export function IdentityCard() {
  const [identity, setIdentity] = useIdentity();
  const [say, setSay] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bust, setBust] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  if (!identity) return null;
  const run = async (action: () => Promise<Identity>, done: string) => {
    setBusy(true); setSay(null);
    try { setIdentity(await action()); setBust(Date.now()); setSay({ ok: true, text: done }); }
    catch (error) { setSay({ ok: false, text: error instanceof Error ? error.message : "Could not save" }); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  return (
    <section className={styles.card}>
      <h2>Your user name and picture</h2>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {identity.avatarUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`${identity.avatarUrl}?v=${bust}`} alt="Your profile picture" width={72} height={72} style={{ borderRadius: "50%", objectFit: "cover" }} />
          : <div aria-hidden style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--md-purple-100)", color: "var(--md-purple-600)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 28 }}>{identity.handle.slice(0, 1).toUpperCase()}</div>}
        <div className={styles.actions}>
          <label className={styles.secondary} style={{ cursor: "pointer" }}>
            Upload picture
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { const body = new FormData(); body.set("image", f); void run(() => call("/api/v1/customer/identity/avatar", { method: "POST", body }), "Picture saved."); } }} />
          </label>
          {identity.avatarUrl && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void run(() => call("/api/v1/customer/identity/avatar", { method: "DELETE" }), "Picture removed.")}>Remove</button>}
        </div>
      </div>
      <form className={styles.form} style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); const handle = new FormData(e.currentTarget).get("handle"); void run(() => call("/api/v1/customer/identity", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle }) }), "User name saved."); }}>
        <label>User name<input name="handle" defaultValue={identity.needsUserName ? "" : identity.handle} placeholder="Choose a user name" required pattern="[a-zA-Z0-9_]{3,30}" /></label>
        <p className={styles.hint}>Shown next to the deals and posts you share. Pictures are cropped to a small square (JPEG, PNG or WebP, up to 2 MB).</p>
        <div className={styles.actions}><button className={styles.primary} disabled={busy}>Save user name</button>{say && <span className={say.ok ? styles.ok : styles.err} role="status">{say.text}</span>}</div>
      </form>
    </section>
  );
}

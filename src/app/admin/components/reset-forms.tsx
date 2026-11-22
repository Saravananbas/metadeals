"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import styles from "../admin.module.css";
import flow from "./reset-flow.module.css";

type Reply = { error?: string; message?: string };

async function postJson(url: string, body: unknown): Promise<Reply> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = (await response.json().catch(() => ({}))) as Reply;
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

/** The email typed on one reset screen is kept for the next one in this tab only; it never goes into an address. */
export const RESET_EMAIL_KEY = "md-reset-email";
export const rememberEmail = (email: string) => { try { sessionStorage.setItem(RESET_EMAIL_KEY, email); } catch { /* storage blocked: the next screen just asks again */ } };
const recalledEmail = () => { try { return sessionStorage.getItem(RESET_EMAIL_KEY) ?? ""; } catch { return ""; } };

function Brand() {
  return <div className={styles.brand}>MetaDeals<span>4U</span> Admin</div>;
}

/** "Forgot password", step 1: email and a current authenticator code. The answer is the same whatever happened. */
export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    try {
      const result = await postJson("/api/auth/password-reset/request", { email, mfaCode: String(data.get("mfaCode") ?? "").trim() });
      rememberEmail(email);
      setMessage(result.message ?? "If the details match, we have emailed a temporary password.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.panel}>
        <Brand />
        <h1 className={styles.title}>Forgot your password?</h1>
        <p className={styles.subtitle}>Enter your email and the 6-digit code from your authenticator app. If they match, we email you a temporary password.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>Email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
          <label className={styles.field}>Authenticator code<input name="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {message && <p className={styles.notice} role="status">{message}</p>}
          <button className={styles.button} disabled={busy}>{busy ? "Please wait..." : "Email me a temporary password"}</button>
        </form>
        <p className={styles.subtitle}>
          <Link className={styles.link} href="/admin/password-reset/change">I have a temporary password</Link>{" · "}
          <Link className={styles.link} href="/admin/login">Return to sign in</Link>
        </p>
      </section>
    </main>
  );
}

/** "Forgot password", step 2: temporary password, new password twice, then an authenticator code in a popup. Ends at the sign-in page; no admin page opens. */
export function TempPasswordChangeForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fields, setFields] = useState<{ tempPassword: string; newPassword: string; confirmPassword: string } | null>(null);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setEmail(recalledEmail()); }, []);
  useEffect(() => { if (fields) codeInput.current?.focus(); }, [fields]);
  useEffect(() => {
    if (!fields) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setFields(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [fields, busy]);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setDialogError("");
    const data = new FormData(event.currentTarget);
    const next = { tempPassword: String(data.get("tempPassword") ?? ""), newPassword: String(data.get("newPassword") ?? ""), confirmPassword: String(data.get("confirmPassword") ?? "") };
    if (next.newPassword !== next.confirmPassword) { setError("The new password and the confirmation do not match."); return; }
    if (next.newPassword.length < 8) { setError("Use at least 8 characters."); return; }
    if (next.newPassword === next.tempPassword) { setError("Choose a new password that is different from the temporary one."); return; }
    setFields(next);
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fields) return;
    setDialogError(""); setBusy(true);
    const code = String(new FormData(event.currentTarget).get("mfaCode") ?? "").trim();
    try {
      await postJson("/api/auth/password-reset/temp-change", { email: email.trim(), ...fields, mfaCode: code });
      try { sessionStorage.removeItem(RESET_EMAIL_KEY); } catch { /* nothing stored */ }
      router.replace("/admin/login?changed=1");
    } catch (reason) {
      setDialogError(reason instanceof Error ? reason.message : "The password could not be changed.");
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.panel}>
        <Brand />
        <h1 className={styles.title}>Choose a new password</h1>
        <p className={styles.subtitle}>Enter the temporary password from your email and choose a new password. You will confirm with your authenticator code.</p>
        <form className={styles.form} onSubmit={review}>
          <label className={styles.field}>Email<input name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className={styles.field}>Temporary password<input name="tempPassword" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} /></label>
          <label className={styles.field}>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          <label className={styles.field}>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          <p className={styles.meta}>Use at least 8 characters. Avoid your email name or commonly used passwords.</p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.button}>Continue</button>
        </form>
        <p className={styles.subtitle}>
          <Link className={styles.link} href="/admin/password-reset">Send me a new temporary password</Link>{" · "}
          <Link className={styles.link} href="/admin/login">Return to sign in</Link>
        </p>
      </section>
      {fields && (
        <div className={flow.backdrop} onClick={() => { if (!busy) setFields(null); }}>
          <form className={flow.dialog} role="dialog" aria-modal="true" aria-labelledby="otp-title" onClick={(e) => e.stopPropagation()} onSubmit={confirm}>
            <h2 id="otp-title">Confirm with your authenticator</h2>
            <p>Enter the current 6-digit code from your authenticator app to change your password.</p>
            <input ref={codeInput} name="mfaCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required aria-label="Authenticator code" />
            {dialogError && <p className={styles.error} role="alert">{dialogError}</p>}
            <div className={flow.actions}>
              <button type="button" className={flow.cancel} disabled={busy} onClick={() => setFields(null)}>Cancel</button>
              <button className={flow.confirm} disabled={busy}>{busy ? "Changing..." : "Change password"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

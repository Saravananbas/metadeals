"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import styles from "../admin.module.css";

type AuthResponse = {
  error?: string;
  message?: string;
  qrCodeDataUrl?: string;
  secret?: string;
  recoveryCodes?: string[];
};

async function postJson(url: string, body: unknown): Promise<AuthResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as AuthResponse;
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result;
}

function Brand() {
  return <div className={styles.brand}>MetaDeals<span>4U</span> Admin</div>;
}

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postJson("/api/auth/login", {
        email: data.get("email"),
        password: data.get("password"),
        mfaCode: data.get("mfaCode"),
      });
      router.replace("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.panel}>
        <Brand />
        <h1 className={styles.title}>Admin sign in</h1>
        <p className={styles.subtitle}>Sign in with your password and authenticator code or an unused recovery code.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>Email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label>
          <label className={styles.field}>Password<input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
          <label className={styles.field}>Authenticator or recovery code<input name="mfaCode" inputMode="text" autoComplete="one-time-code" required maxLength={32} /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.button} disabled={busy}>{busy ? "Signing in..." : "Sign in securely"}</button>
        </form>
        <p className={styles.subtitle}><Link className={styles.link} href="/admin/password-reset">Forgot your password?</Link></p>
      </section>
    </main>
  );
}

export function SetupForm({ token }: { token: string }) {
  const [enrollment, setEnrollment] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await postJson("/api/auth/setup/start", { token, password: data.get("password") });
      if (!response.qrCodeDataUrl || !response.secret) throw new Error("Enrollment could not be started.");
      setEnrollment({ qrCodeDataUrl: response.qrCodeDataUrl, secret: response.secret });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enrollment could not be started.");
    } finally {
      setBusy(false);
    }
  }

  async function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await postJson("/api/auth/setup/complete", { token, code: data.get("code") });
      setRecoveryCodes(response.recoveryCodes ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account setup could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.panel}>
        <Brand />
        <h1 className={styles.title}>{recoveryCodes ? "Save your recovery codes" : "Secure your account"}</h1>
        <p className={styles.subtitle}>Set a unique password and enable authenticator-based multi-factor authentication.</p>
        {!enrollment && !recoveryCodes && (
          <form className={styles.form} onSubmit={start}>
            <label className={styles.field}>New password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
            <p className={styles.meta}>Use at least 8 characters. Avoid your email name or commonly used passwords.</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.button} disabled={busy}>{busy ? "Preparing enrollment..." : "Set password and continue"}</button>
          </form>
        )}
        {enrollment && !recoveryCodes && (
          <div className={styles.form}>
            <p className={styles.meta}>Scan this QR code with an authenticator app. Keep the setup link private until enrollment is complete.</p>
            <Image className={styles.qr} src={enrollment.qrCodeDataUrl} alt="Authenticator enrollment QR code" width={240} height={240} unoptimized />
            <p className={styles.meta}>If scanning is unavailable, enter this secret manually:</p>
            <code className={styles.secret}>{enrollment.secret}</code>
            <form className={styles.form} onSubmit={finish}>
              <label className={styles.field}>Six-digit authenticator code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <button className={styles.button} disabled={busy}>{busy ? "Verifying..." : "Verify and activate account"}</button>
            </form>
          </div>
        )}
        {recoveryCodes && (
          <div className={styles.form}>
            <p className={styles.notice}>Each recovery code works once. Store these somewhere private; they will not be shown again.</p>
            <pre className={styles.recoveryCodes}>{recoveryCodes.join("\n")}</pre>
            <Link className={styles.button} href="/admin/login">Continue to sign in</Link>
          </div>
        )}
      </section>
    </main>
  );
}

export function PasswordResetConfirmForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await postJson("/api/auth/password-reset/confirm", { token, password: data.get("password") });
      setMessage("Password updated. All active sessions were revoked. You can now sign in.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password reset could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.panel}>
        <Brand />
        <h1 className={styles.title}>Choose a new password</h1>
        <p className={styles.subtitle}>Use at least 8 characters. Reset links expire after 30 minutes.</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>New password<input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          {message && <p className={styles.notice} role="status">{message}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.button} disabled={busy || Boolean(message)}>{busy ? "Updating..." : "Update password"}</button>
        </form>
      </section>
    </main>
  );
}

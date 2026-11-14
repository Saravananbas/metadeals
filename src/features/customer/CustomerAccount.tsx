"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Gift, Lock, Mail, MessageSquareText, ShieldCheck, ShoppingBag, ShoppingCart, Tag, User, Users } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import styles from "./account.module.css";
import { CustomerProfile } from "./CustomerProfile";

type Props = {
  providers: { google: boolean; apple: boolean };
  delivery: "local" | "resend" | "unavailable";
  oauthError?: boolean;
};
type Shopper = { name?: string | null; email?: string | null };

// Google and Apple refuse sign-in inside an app's embedded browser and the browser they fall back to cannot hand the session back to the app, so the MetaDeals4U app (which adds MetaDeals4UApp to its user agent) shows email sign-in only. shortcut: native Google/Apple sign-in for the app is a separate project.
const inApp = () => typeof navigator !== "undefined" && navigator.userAgent.includes("MetaDeals4UApp");

const FEATURES = [
  { icon: Tag, title: "Find Best Deals", text: "Handpicked offers & discounts" },
  { icon: Users, title: "Get Help & Advice", text: "Ask, discuss and get answers" },
  { icon: ShieldCheck, title: "A Trusted Community", text: "Real people, real experiences" },
] as const;

/** 0 (empty) to 4 (strong): a simple guide shown while typing, not a replacement for the server's password rules. */
function passwordStrength(value: string) {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
  return { score, label: ["Weak", "Fair", "Good", "Strong", "Strong"][score] };
}

export function CustomerAccount({ providers, delivery, oauthError }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [step, setStep] = useState<"form" | "verify" | "reset" | "success">("form");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(oauthError ? "Sign-in was not completed. Please use your original sign-in method or try again." : "");
  const [challenge, setChallenge] = useState(""), [email, setEmail] = useState(""), [code, setCode] = useState("");
  const [user, setUser] = useState<Shopper | null>(null), [cooldown, setCooldown] = useState(0), [checked, setChecked] = useState(false);
  const [remember, setRemember] = useState(true), [showPw, setShowPw] = useState(false), [showPw2, setShowPw2] = useState(false), [pw, setPw] = useState("");
  const strength = useMemo(() => passwordStrength(pw), [pw]);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/customer/session", { cache: "no-store" }).then((r) => r.json()).then((s) => { if (alive && s?.user) setUser(s.user); }).catch(() => {}).finally(() => { if (alive) setChecked(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown((v) => v - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);

  const choose = (next: "signin" | "signup") => { setMode(next); setStep("form"); setMessage(""); setCode(""); setPw(""); setShowPw(false); setShowPw2(false); };

  async function post(action: string, body: unknown) {
    const response = await fetch("/api/v1/customer/" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Please try again.");
    return result;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    try {
      if (mode === "forgot" && step === "form") {
        const result = await post("forgot", { email: values.email });
        setChallenge(result.challengeId); setStep("reset"); setCooldown(60);
        setMessage(delivery === "local" ? "Local preview: the reset code is in the developer's private outbox." : "If that account exists, we have emailed a six-digit code. It expires in 10 minutes.");
      } else if (step === "reset") {
        await post("reset", { challengeId: challenge, code: String(values.code ?? code), password: values.password, confirmPassword: values.confirmPassword });
        setMode("signin"); setStep("form"); setPw(""); setCode(""); setMessage("Password updated. Sign in with your new password.");
      } else if (step === "verify") { await post("verify", { challengeId: challenge, code }); setStep("success"); setCode(""); }
      else if (mode === "signup") {
        const { agree: _agree, ...payload } = values; void _agree;
        const result = await post("signup", payload);
        setEmail(String(values.email)); setChallenge(result.challengeId); setStep("verify"); setCooldown(60); form.reset(); setPw("");
      } else {
        const result = await signIn("credentials", { email: values.email, password: values.password, remember: remember ? "1" : "0", redirect: false, callbackUrl: "/" });
        if (result?.error || !result?.ok) throw new Error("Email or password is incorrect, or sign-in is temporarily limited.");
        const session = await fetch("/api/v1/customer/session", { cache: "no-store" }).then((r) => r.json());
        if (!session.user) throw new Error("Unable to start your session. Please retry.");
        setUser(session.user); form.reset(); router.push("/"); router.refresh();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); } finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true); setMessage("");
    try { await post("resend", { challengeId: challenge }); setCooldown(60); setMessage(delivery === "local" ? "A new test code is in the local outbox." : "If eligible, a new code has been sent."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Please retry."); } finally { setBusy(false); }
  }

  const features = (
    <ul className={styles.features}>
      {FEATURES.map(({ icon: Icon, title, text }) => (
        <li key={title}><span className={styles.featIcon}><Icon size={22} /></span><span><b>{title}</b><small>{text}</small></span></li>
      ))}
    </ul>
  );

  return (
    <main className={styles.page}>
      <nav className={styles.navigation}><Link href="/"><ArrowLeft size={18} /> Back to deals</Link></nav>
      {!checked ? <p className={styles.caption} role="status">Checking your sign-in…</p> : user ? <CustomerProfile /> : (
        <div className={styles.shell}>
          <aside className={styles.brandPanel} aria-label="About MetaDeals4U">
            <div className={styles.brandLogo}><BrandLogo /></div>
            <h2 className={styles.brandTitle}>Join the <span>MetaDeals4U</span> Community</h2>
            <p className={styles.brandText}>Discover deals, share insights, ask questions and connect with smart shoppers.</p>
            {features}
            <div className={styles.illus} aria-hidden>
              <Gift size={58} strokeWidth={1.4} className={styles.illGift} />
              <span className={styles.illBag}><ShoppingBag size={92} strokeWidth={1.3} /><b>%</b></span>
              <ShoppingCart size={64} strokeWidth={1.4} className={styles.illCart} />
            </div>
          </aside>

          <section className={styles.formCard} aria-label="Your MetaDeals4U account" aria-busy={busy}>
            {step === "form" && mode !== "forgot" && (
              <div className={styles.tabs} role="tablist" aria-label="Sign in or sign up">
                <button type="button" role="tab" aria-selected={mode === "signin"} className={`${styles.tab} ${mode === "signin" ? styles.tabOn : ""}`} onClick={() => choose("signin")}>Sign In</button>
                <button type="button" role="tab" aria-selected={mode === "signup"} className={`${styles.tab} ${mode === "signup" ? styles.tabOn : ""}`} onClick={() => choose("signup")}>Sign Up</button>
              </div>
            )}

            {step === "success" ? (
              <div className={styles.success}><ShieldCheck size={44} /><h1>Account created!</h1><p>Your email is verified. You can now sign in to MetaDeals4U.</p><button className={styles.primary} onClick={() => choose("signin")}>Sign in to your account</button></div>
            ) : (
              <form onSubmit={submit} key={mode + step} className={styles.form}>
                <h1>{step === "verify" ? "Verify your email" : mode === "forgot" ? (step === "reset" ? "Set a new password" : "Forgot your password?") : mode === "signup" ? "Create a New Account 🎉" : "Welcome back! 👋"}</h1>
                <p className={styles.sub}>{step === "verify" ? `Enter the six-digit code for ${email}.` : mode === "forgot" ? (step === "reset" ? "Enter the code we emailed you and choose a new password." : "Enter your email or user name and we will email you a code.") : mode === "signup" ? "Join MetaDeals4U and be part of our deal community" : "Sign in to your MetaDeals4U account"}</p>

                {mode === "forgot" ? (
                  step === "reset" ? (
                    <>
                      <label htmlFor="otp">Code from your email</label>
                      <input id="otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={styles.otp} />
                      <div className={styles.field}><Lock size={20} aria-hidden /><input id="password" name="password" type={showPw ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} required placeholder="New password" aria-label="New password" onChange={(e) => setPw(e.target.value)} /><button type="button" className={styles.eye} onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
                      <div className={styles.field}><Lock size={20} aria-hidden /><input id="confirmPassword" name="confirmPassword" type={showPw2 ? "text" : "password"} autoComplete="new-password" maxLength={128} required placeholder="Confirm new password" aria-label="Confirm new password" /><button type="button" className={styles.eye} onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? "Hide password" : "Show password"}>{showPw2 ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
                      {pw && <div className={styles.strength} aria-live="polite"><span>Password Strength: <b data-level={strength.score}>{strength.label}</b></span><div className={styles.bars}>{[1, 2, 3, 4].map((n) => <i key={n} className={n <= strength.score ? styles.barOn : ""} data-level={strength.score} />)}</div></div>}
                      <small>Expires in 10 minutes · Maximum 5 attempts</small>
                      <button className={styles.primary} disabled={busy}>{busy ? "Saving…" : "Reset password"}</button>
                      <button type="button" className={styles.ghost} disabled={busy || cooldown > 0} onClick={() => { setStep("form"); setMessage(""); }}>{cooldown ? `Ask for a new code in ${cooldown}s` : "Ask for a new code"}</button>
                    </>
                  ) : (
                    <>
                      <div className={styles.field}><Mail size={20} aria-hidden /><input id="email" name="email" type="text" autoComplete="username" maxLength={254} required placeholder="Email or user name" aria-label="Email or user name" /></div>
                      <button className={styles.primary} disabled={busy}>{busy ? "Please wait…" : "Send reset code"}</button>
                      <p className={styles.switchLine}><button type="button" onClick={() => choose("signin")}>Back to sign in</button></p>
                    </>
                  )
                ) : step === "verify" ? (
                  <>
                    {delivery === "local" && <p className={styles.notice}>Local preview: no email was sent. The test code is in the developer’s private outbox.</p>}
                    <label htmlFor="otp">Verification code</label>
                    <input id="otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={styles.otp} />
                    <small>Expires in 10 minutes · Maximum 5 attempts</small>
                    <button className={styles.primary} disabled={busy}>{busy ? "Verifying…" : "Verify email"}</button>
                    <button type="button" className={styles.ghost} disabled={busy || cooldown > 0} onClick={resend}>{cooldown ? `Resend code in ${cooldown}s` : "Resend code"}</button>
                    <button type="button" className={styles.ghost} onClick={() => { setStep("form"); setMessage(""); }}>Use another email</button>
                  </>
                ) : (
                  <>
                    <div className={styles.socialWrap} suppressHydrationWarning style={inApp() ? { display: "none" } : undefined}>
                      <button type="button" className={styles.socialBtn} disabled={busy || !providers.google} onClick={() => void signIn("google", { callbackUrl: "/" })} title={providers.google ? "Continue with Google" : "Google sign-in awaiting provider credentials"}>
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                          <path style={{ fill: "var(--md-c-4285f4)" }} d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path style={{ fill: "var(--md-c-34a853)" }} d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path style={{ fill: "var(--md-c-fbbc05)" }} d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path style={{ fill: "var(--md-c-ea4335)" }} d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        Continue with Google
                      </button>
                      <button type="button" className={styles.socialBtn} disabled={busy || !providers.apple} onClick={() => void signIn("apple", { callbackUrl: "/" })} title={providers.apple ? "Continue with Apple" : "Apple sign-in awaiting provider credentials"}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8.92-2.85-.9.04-1.98.6-2.62 1.35-.57.65-1.07 1.72-.94 2.74 1 .08 2.02-.49 2.64-1.24z" /></svg>
                        Continue with Apple
                      </button>
                      {(!providers.google || !providers.apple) && <small className={styles.centerNote}>Unavailable sign-in options are awaiting provider setup.</small>}
                      <div className={styles.divider}><span>OR</span></div>
                    </div>

                    {mode === "signup" && (
                      <div className={styles.field}><User size={20} aria-hidden /><input id="name" name="name" autoComplete="name" minLength={2} maxLength={80} required placeholder="Full Name" aria-label="Full name" /></div>
                    )}
                    <div className={styles.field}><Mail size={20} aria-hidden /><input id="email" name="email" type={mode === "signup" ? "email" : "text"} autoComplete={mode === "signup" ? "email" : "username"} maxLength={254} required placeholder={mode === "signup" ? "Email address" : "Username or Email"} aria-label={mode === "signup" ? "Email address" : "Username or email"} /></div>
                    <div className={styles.field}>
                      <Lock size={20} aria-hidden />
                      <input id="password" name="password" type={showPw ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : 1} maxLength={128} required placeholder="Password" aria-label="Password" onChange={(e) => setPw(e.target.value)} />
                      <button type="button" className={styles.eye} onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                    </div>
                    {mode === "signup" && (
                      <>
                        <div className={styles.field}>
                          <Lock size={20} aria-hidden />
                          <input id="confirmPassword" name="confirmPassword" type={showPw2 ? "text" : "password"} autoComplete="new-password" maxLength={128} required placeholder="Confirm Password" aria-label="Confirm password" />
                          <button type="button" className={styles.eye} onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? "Hide password" : "Show password"}>{showPw2 ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                        </div>
                        {pw && (
                          <div className={styles.strength} aria-live="polite">
                            <span>Password Strength: <b data-level={strength.score}>{strength.label}</b></span>
                            <div className={styles.bars}>{[1, 2, 3, 4].map((n) => <i key={n} className={n <= strength.score ? styles.barOn : ""} data-level={strength.score} />)}</div>
                          </div>
                        )}
                        <label className={styles.agree}><input type="checkbox" name="agree" required /> <span>I agree to the <Link href="/terms">Terms &amp; Conditions</Link> and <Link href="/privacy">Privacy Policy</Link></span></label>
                        <small>If you accept analytics, your visits are linked to your account.</small>
                        {delivery === "local" && <small>Local email preview is active. Codes go to a private test outbox.</small>}
                        {delivery === "unavailable" && <p className={styles.notice}>Email verification is awaiting configuration.</p>}
                      </>
                    )}
                    {mode === "signin" && (
                      <div className={styles.rememberRow}>
                        <label className={styles.agree}><input type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>Remember me</span></label>
                        <button type="button" className={styles.forgot} onClick={() => { setMode("forgot"); setStep("form"); setMessage(""); }}>Forgot password?</button>
                      </div>
                    )}
                    <button className={styles.primary} disabled={busy || (mode === "signup" && delivery === "unavailable")}>{busy ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}</button>
                    <p className={styles.switchLine}>
                      {mode === "signin" ? <>New to MetaDeals4U? <button type="button" onClick={() => choose("signup")}>Create an account</button></> : <>Already registered? <button type="button" onClick={() => choose("signin")}>Sign in</button></>}
                    </p>
                  </>
                )}
                {message && <p role="status" className={styles.message}>{message}</p>}
              </form>
            )}
          </section>
        </div>
      )}
      {!user && checked && (
        <div className={styles.bottomFeatures} aria-hidden>
          <span><Tag size={22} />Best Deals</span><span><MessageSquareText size={22} />Helpful Community</span><span><ShieldCheck size={22} />Trusted &amp; Safe</span>
        </div>
      )}
      <p className={styles.caption}>Deals • Offers • Best Prices</p>
    </main>
  );
}

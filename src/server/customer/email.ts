import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
/** SMTP settings, or null when any of the five required values is missing. Port 465 uses TLS from the start; any other port (587) upgrades with STARTTLS. */
export function smtpSettings(env: Record<string, string | undefined> = process.env) {
  const host = env.SMTP_HOST?.trim(), user = env.SMTP_USER?.trim(), pass = env.SMTP_PASSWORD, from = env.EMAIL_FROM?.trim();
  const port = Number(env.SMTP_PORT ?? 465);
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;
  return { host, port, secure, requireTLS: !secure, auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000, from };
}
export function emailMode(): "smtp" | "resend" | "local" | "unavailable" {
  if (process.env.CUSTOMER_EMAIL_MODE === "smtp") return smtpSettings() ? "smtp" : "unavailable";
  if (process.env.CUSTOMER_EMAIL_MODE === "resend") return process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "resend" : "unavailable";
  return process.env.NODE_ENV !== "production" && (process.env.CUSTOMER_EMAIL_MODE ?? "local") === "local" ? "local" : "unavailable";
}
export async function sendSignupCode(email: string, code: string, challengeId: string) {
  return sendCode({ email, code, challengeId, kind: "signup", subject: "Verify your MetaDeals4U account", text: `Your MetaDeals4U verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.` });
}
export async function sendResetCode(email: string, code: string, challengeId: string) {
  return sendCode({ email, code, challengeId, kind: "reset", subject: "Reset your MetaDeals4U password", text: `Your MetaDeals4U password reset code is ${code}. It expires in 10 minutes. If you did not ask to reset your password, ignore this email: your password has not been changed.` });
}
async function sendCode({ email, code, challengeId, kind, subject, text }: { email: string; code: string; challengeId: string; kind: string; subject: string; text: string }) {
  const mode = emailMode();
  if (mode === "unavailable") throw new Error("Email delivery is not configured.");
  if (mode === "local") {
    const dir = path.join(process.cwd(), ".local", "email-outbox");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, challengeId + ".json"), JSON.stringify({ to: email, subject, text, createdAt: new Date().toISOString() }), { mode: 0o600 });
    return mode;
  }
  if (mode === "smtp") {
    const { from, ...transport } = smtpSettings()!;
    try { await nodemailer.createTransport(transport).sendMail({ from, to: email, subject, text }); }
    catch { throw new Error("Email delivery failed."); } // the SMTP error can name the account or server, so it is not passed on
    return mode;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
      "Idempotency-Key": `${kind}-${challengeId}-${code}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email delivery failed.");
  return mode;
}

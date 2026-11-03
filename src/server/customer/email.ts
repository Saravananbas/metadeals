import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
export function emailMode(): "resend" | "local" | "unavailable" {
  if (process.env.CUSTOMER_EMAIL_MODE === "resend") return process.env.RESEND_API_KEY && process.env.EMAIL_FROM ? "resend" : "unavailable";
  return process.env.NODE_ENV !== "production" && (process.env.CUSTOMER_EMAIL_MODE ?? "local") === "local" ? "local" : "unavailable";
}
export async function sendSignupCode(email: string, code: string, challengeId: string) {
  const mode = emailMode();
  if (mode === "unavailable") throw new Error("Email delivery is not configured.");
  const text = `Your MetaDeals4U verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  if (mode === "local") {
    const dir = path.join(process.cwd(), ".local", "email-outbox");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, challengeId + ".json"), JSON.stringify({ to: email, subject: "Verify your MetaDeals4U account", text, createdAt: new Date().toISOString() }), { mode: 0o600 });
    return mode;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json",
      "Idempotency-Key": `signup-${challengeId}-${code}` },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: "Verify your MetaDeals4U account", text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Email delivery failed.");
  return mode;
}

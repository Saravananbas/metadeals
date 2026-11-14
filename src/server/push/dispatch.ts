import "server-only";
import { importPKCS8, SignJWT } from "jose";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { CustomerError } from "@/server/customer/service";

/**
 * Push alerts through Firebase Cloud Messaging (HTTP v1), which also reaches iPhones when an APNs key is added in Firebase.
 * Nothing is sent unless FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON are set. Alert text never contains the message itself
 * (it would show on a locked screen); the app opens the conversation and loads it from the API.
 */
const configured = () => Boolean(process.env.FCM_PROJECT_ID && process.env.FCM_SERVICE_ACCOUNT_JSON);
export const pushConfigured = configured;

let cached: { token: string; until: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const account = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON as string) as { client_email: string; private_key: string; token_uri?: string };
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(account.client_email).setSubject(account.client_email).setAudience(tokenUri).setIssuedAt().setExpirationTime("55m").sign(key);
  const response = await fetch(tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) throw new Error("push provider refused the service account");
  cached = { token: body.access_token, until: Date.now() + (body.expires_in ?? 3000) * 1000 };
  return cached.token;
}
export const forgetPushAccessToken = () => { cached = null; };

export type PushAlert = { title: string; body: string; data: Record<string, string> };

/** Sends one alert to every registered device of a member. Never throws: a failed alert must not fail the message that caused it. */
export async function pushToCustomer(customerId: string, alert: PushAlert): Promise<{ sent: number; removed: number }> {
  if (!configured()) return { sent: 0, removed: 0 };
  try {
    const db = getDatabase();
    const devices = await db.devicePushToken.findMany({ where: { customerId }, select: { id: true, token: true }, take: 10 });
    if (!devices.length) return { sent: 0, removed: 0 };
    const bearer = await accessToken();
    let sent = 0, removed = 0;
    for (const device of devices) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
        method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: device.token, notification: { title: alert.title, body: alert.body }, data: alert.data, android: { priority: "HIGH" } } }),
      });
      if (response.ok) { sent++; continue; }
      // The phone uninstalled the app or the token expired: forget it.
      const text = await response.text().catch(() => "");
      if (response.status === 404 || text.includes("UNREGISTERED")) { await db.devicePushToken.delete({ where: { id: device.id } }).catch(() => {}); removed++; }
    }
    return { sent, removed };
  } catch (error) {
    logger.warn({ event: "push.failed", reason: error instanceof Error ? error.message : "unknown" }, "push alert failed");
    return { sent: 0, removed: 0 };
  }
}

export async function registerPushToken(customerId: string, raw: { token?: unknown; platform?: unknown; device?: unknown }) {
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  const platform = raw.platform === "ios" || raw.platform === "android" ? raw.platform : null;
  if (!platform || token.length < 20 || token.length > 255 || /\s/.test(token)) throw new CustomerError("Check the device token and platform.", 400);
  const db = getDatabase(), device = typeof raw.device === "string" ? raw.device.slice(0, 80) : null;
  // One phone token belongs to one member: signing in as someone else on the same phone moves it.
  await db.devicePushToken.upsert({ where: { token }, update: { customerId, platform, device, lastSeenAt: new Date() }, create: { customerId, token, platform, device } });
  const extra = await db.devicePushToken.findMany({ where: { customerId }, orderBy: { lastSeenAt: "desc" }, skip: 10, select: { id: true } });
  if (extra.length) await db.devicePushToken.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  return { registered: true, delivery: configured() ? "enabled" : "not_configured" };
}
export async function unregisterPushToken(customerId: string, token: string) {
  await getDatabase().devicePushToken.deleteMany({ where: { customerId, token } });
  return { removed: true };
}

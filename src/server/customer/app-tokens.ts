import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDatabase } from "@/server/db/client";
import { CustomerError } from "./service";

/**
 * Sign-in tokens for the native apps (kept in the device's secure storage, e.g. Expo SecureStore).
 * An access token lasts an hour; a refresh token (60 days) is exchanged for a new pair and is replaced every time it is used.
 * Only SHA-256 hashes are stored, so a database leak does not expose usable tokens.
 * If an OLD refresh token is presented again (a stolen copy was used, or the app and a thief raced), the whole sign-in ends.
 */
const ACCESS_PREFIX = "mdt_", REFRESH_PREFIX = "mdr_";
const ACCESS_MS = 3_600_000, REFRESH_MS = 60 * 86_400_000;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const fresh = (prefix: string) => prefix + randomBytes(32).toString("base64url");

export function bearerOf(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1] : null;
}

function pair() {
  const access = fresh(ACCESS_PREFIX), refresh = fresh(REFRESH_PREFIX), now = Date.now();
  return { access, refresh, accessExpires: new Date(now + ACCESS_MS), refreshExpires: new Date(now + REFRESH_MS) };
}
const answer = (p: ReturnType<typeof pair>) => ({ token: p.access, expiresAt: p.accessExpires.toISOString(), refreshToken: p.refresh, refreshExpiresAt: p.refreshExpires.toISOString(), tokenType: "Bearer" as const });

export async function issueAppToken(customerId: string, device?: string | null) {
  const p = pair(), db = getDatabase();
  // A member keeps at most 10 app sign-ins; the oldest are ended.
  const old = await db.customerAppToken.findMany({ where: { customerId, revokedAt: null }, orderBy: { createdAt: "desc" }, skip: 9, select: { id: true } });
  if (old.length) await db.customerAppToken.updateMany({ where: { id: { in: old.map((o) => o.id) } }, data: { revokedAt: new Date() } });
  await db.customerAppToken.create({ data: { customerId, tokenHash: hash(p.access), refreshHash: hash(p.refresh), refreshExpiresAt: p.refreshExpires, device: device?.slice(0, 80) || null, expiresAt: p.accessExpires } });
  return answer(p);
}

/** Exchanges a refresh token for a new access + refresh pair. Unknown, expired, replayed or signed-out tokens are all answered the same way. */
export async function refreshAppToken(refreshToken: string) {
  const bad = () => new CustomerError("Please sign in again.", 401);
  if (!refreshToken.startsWith(REFRESH_PREFIX) || refreshToken.length > 100) throw bad();
  const db = getDatabase(), h = hash(refreshToken);
  const row = await db.customerAppToken.findUnique({ where: { refreshHash: h }, select: { id: true, revokedAt: true, refreshExpiresAt: true, customer: { select: { disabledAt: true } } } });
  if (!row) {
    const replayed = await db.customerAppToken.findFirst({ where: { prevRefreshHash: h, revokedAt: null }, select: { id: true } });
    if (replayed) await db.customerAppToken.update({ where: { id: replayed.id }, data: { revokedAt: new Date() } });
    throw bad();
  }
  if (row.revokedAt || !row.refreshExpiresAt || row.refreshExpiresAt <= new Date() || row.customer.disabledAt) throw bad();
  const p = pair();
  // Conditional on the refresh token still being the current one: two simultaneous refreshes cannot both win.
  const done = await db.customerAppToken.updateMany({ where: { id: row.id, refreshHash: h, revokedAt: null }, data: { tokenHash: hash(p.access), expiresAt: p.accessExpires, prevRefreshHash: h, refreshHash: hash(p.refresh), refreshExpiresAt: p.refreshExpires, lastUsedAt: new Date() } });
  if (done.count !== 1) throw bad();
  return answer(p);
}

/** The customer this token belongs to. Unknown, expired or signed-out tokens, and disabled accounts, are all answered the same way. */
export async function customerIdFromAppToken(token: string): Promise<string> {
  const row = token.startsWith(ACCESS_PREFIX) && token.length < 100
    ? await getDatabase().customerAppToken.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, customerId: true, expiresAt: true, revokedAt: true, lastUsedAt: true, customer: { select: { disabledAt: true } } } })
    : null;
  if (!row || row.revokedAt || row.expiresAt <= new Date() || row.customer.disabledAt) throw new CustomerError("Please sign in to continue.", 401);
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 3_600_000) void getDatabase().customerAppToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return row.customerId;
}

export async function revokeAppToken(token: string) {
  await getDatabase().customerAppToken.updateMany({ where: { OR: [{ tokenHash: hash(token) }, { refreshHash: hash(token) }], revokedAt: null }, data: { revokedAt: new Date() } });
}

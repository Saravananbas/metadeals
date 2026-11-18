import "server-only";
import { cookies } from "next/headers";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { createOpaqueToken, hashOpaqueToken } from "./crypto";
import { resolveAccess } from "./access";
import { suspensionBlocks } from "./suspension";
import {
  ABSOLUTE_SESSION_TIMEOUT_MS,
  getSessionExpiry,
  isSessionExpired,
  SESSION_TOUCH_INTERVAL_MS,
} from "./session-policy";
export { ABSOLUTE_SESSION_TIMEOUT_MS, INACTIVITY_TIMEOUT_MS, SESSION_TOUCH_INTERVAL_MS } from "./session-policy";
const SESSION_COOKIE_MAX_AGE_SECONDS = ABSOLUTE_SESSION_TIMEOUT_MS / 1000;

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-metadeals-session" : "metadeals-session";
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName(), token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
}

export function issueSessionToken(): string {
  return createOpaqueToken(32);
}

/** Local development only: AUTH_DISABLED_DEV=true acts as the first active SUPER_ADMIN. Never honoured in production. */
async function getDevBypassContext() {
  if (process.env.NODE_ENV === "production" || process.env.AUTH_DISABLED_DEV !== "true") return null;
  const user = await getDatabase().user.findFirst({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    select: { id: true, email: true, name: true, role: true, status: true, totpEnabledAt: true },
  });
  return user ? { user: { ...user, permissions: null as string[] | null }, session: null } : null;
}

export async function getCurrentAuthContext() {
  const bypass = await getDevBypassContext();
  if (bypass) return bypass;
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (!token || token.length > 128) return null;

  const env = getAuthEnv();
  const now = new Date();
  const db = getDatabase();
  const session = await db.authSession.findUnique({
    where: { tokenHash: hashOpaqueToken(token, env.AUTH_SESSION_SECRET) },
    include: { user: { select: { id: true, email: true, name: true, role: true, status: true, totpEnabledAt: true, suspendedFrom: true, suspendedUntil: true } } },
  });
  if (!session || isSessionExpired(session.expiresAt, session.absoluteExpiresAt, now) ||
      session.user.status !== "ACTIVE" || suspensionBlocks(session.user, now) || !session.user.totpEnabledAt) {
    // Concurrent requests may all discover and clean up the same expired session.
    if (session) await db.authSession.deleteMany({ where: { id: session.id } });
    return null;
  }

  const refreshAfter = new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS);
  if (session.lastActivityAt < refreshAfter) {
    const expiresAt = getSessionExpiry(now, session.absoluteExpiresAt);
    const touched = await db.authSession.updateMany({
      where: {
        id: session.id,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        user: { status: "ACTIVE", totpEnabledAt: { not: null } },
      },
      data: { lastActivityAt: now, expiresAt },
    });
    if (touched.count !== 1) {
      return null;
    }
  }
  // A person whose access was set one by one gets that checklist; everyone else gets their role defaults (null).
  return { user: { ...session.user, permissions: await resolveAccess(session.user.id) }, session };
}

export type AuthContext = NonNullable<Awaited<ReturnType<typeof getCurrentAuthContext>>>;

export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  try {
    if (token) {
      const env = getAuthEnv();
      await getDatabase().authSession.deleteMany({
        where: { tokenHash: hashOpaqueToken(token, env.AUTH_SESSION_SECRET) },
      });
    }
  } finally {
    await clearSessionCookie();
  }
}

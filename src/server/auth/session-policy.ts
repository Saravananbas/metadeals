export const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
export const ABSOLUTE_SESSION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function getSessionExpiry(now: Date, absoluteExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + INACTIVITY_TIMEOUT_MS, absoluteExpiresAt.getTime()));
}

export function isSessionExpired(expiresAt: Date, absoluteExpiresAt: Date, now: Date): boolean {
  return expiresAt <= now || absoluteExpiresAt <= now;
}

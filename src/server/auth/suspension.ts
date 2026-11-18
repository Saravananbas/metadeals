/** Staff suspension window helpers. Pure, so they can be tested without a database. */
type Account = { status: string; suspendedFrom: Date | null; suspendedUntil: Date | null };

/** True while the account is inside its suspension window (start reached, end not yet). */
export function suspensionBlocks(user: Account, now = new Date()): boolean {
  if (!user.suspendedUntil || user.suspendedUntil <= now) return false;
  if (user.suspendedFrom && user.suspendedFrom > now) return false;
  return user.status === "ACTIVE" || user.status === "SUSPENDED";
}

/** A timed suspension whose end has passed: the account may sign in again and the row should go back to ACTIVE. */
export function suspensionEnded(user: Account, now = new Date()): boolean {
  return user.status === "SUSPENDED" && user.suspendedUntil !== null && user.suspendedUntil <= now;
}

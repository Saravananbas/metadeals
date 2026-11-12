import "server-only";
import { CustomerError } from "@/server/customer/service";

/** Master switch: the community is invisible (404) unless COMMUNITY_ENABLED=true. */
export const communityEnabled = () => process.env.COMMUNITY_ENABLED === "true";
/** Kill switch: when COMMUNITY_WRITES_DISABLED=true everything stays readable but nobody can post, comment, vote, save, follow or report. */
export const communityWritesDisabled = () => process.env.COMMUNITY_WRITES_DISABLED === "true";
/** Accounts younger than this need review for posts with links, and cannot put links in comments. */
export const newAccountHours = () => Math.max(0, Number(process.env.COMMUNITY_NEW_ACCOUNT_HOURS ?? 24) || 0);
export const EDIT_WINDOW_HOURS = 24;

export function assertCommunityEnabled() {
  if (!communityEnabled()) throw new CustomerError("Not found.", 404);
}
export function assertWritesEnabled() {
  assertCommunityEnabled();
  if (communityWritesDisabled()) throw new CustomerError("The community is read-only right now. Please try again later.", 503);
}

// shortcut: per-process throttle for anonymous reads; resets on restart, fine for one Node instance.
const hits = new Map<string, { count: number; resetAt: number }>();
export function throttleRead(key: string, maximum = 120) {
  const now = Date.now(), hit = hits.get(key);
  const entry = hit && hit.resetAt > now ? hit : { count: 0, resetAt: now + 60_000 };
  entry.count += 1;
  hits.set(key, entry);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  if (entry.count > maximum) throw new CustomerError("Too many requests. Please slow down.", 429);
}

/** Concurrency conflicts that are safe to retry: unique-index races, deadlocks, and MariaDB snapshot conflicts ("Record has changed since last read", code 1020). */
export function isRetryableConflict(error: unknown) {
  const code = (error as { code?: string })?.code;
  const message = error instanceof Error ? error.message : "";
  return ["P2002", "P2034", "P2025"].includes(code ?? "") || /1020|Record has changed since last read|deadlock|40001|could not serialize/i.test(message);
}

export async function withRetry<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isRetryableConflict(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.floor(Math.random() * 25)));
    }
  }
}

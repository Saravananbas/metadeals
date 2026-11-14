import "server-only";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { logger } from "@/server/logging/logger";

/**
 * Live events for messaging. An event is only ever published AFTER its database write succeeded: the database is the source of truth
 * and a client that reconnects reloads from it. Events reach listeners in this process directly; when Redis is configured they are
 * also relayed to the other server processes.
 */
export type LiveEvent = { to: string; type: "message" | "read" | "delivered" | "typing" | "thread"; data: Record<string, unknown> };
type Listener = (event: LiveEvent) => void;
type State = { origin: string; listeners: Map<string, Set<Listener>>; pub: Redis | null; started: boolean };

const CHANNEL = "md4u:dm";
const g = globalThis as unknown as { __mdDmBus?: State };
const state: State = (g.__mdDmBus ??= { origin: randomUUID(), listeners: new Map(), pub: null, started: false });

function deliver(event: LiveEvent) {
  for (const listener of state.listeners.get(event.to) ?? []) { try { listener(event); } catch { /* one broken connection never stops the others */ } }
}

function startRedis() {
  if (state.started) return;
  state.started = true;
  const url = process.env.REDIS_URL;
  if (!url || process.env.MESSAGES_REDIS_DISABLED === "true") return;
  try {
    const options = { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 3000, retryStrategy: (n: number) => Math.min(n * 500, 10_000) };
    const pub = new Redis(url, options), sub = new Redis(url, { ...options, enableOfflineQueue: true });
    const quiet = () => logger.warn({ dependency: "redis", feature: "messages" }, "live message relay unavailable; events stay in this process");
    pub.on("error", quiet); sub.on("error", quiet);
    sub.on("message", (_channel, raw) => {
      try { const { origin, event } = JSON.parse(raw) as { origin: string; event: LiveEvent }; if (origin !== state.origin) deliver(event); } catch { /* ignore malformed relay */ }
    });
    void sub.subscribe(CHANNEL).catch(() => {});
    state.pub = pub;
  } catch { state.pub = null; }
}

export function publish(to: string, type: LiveEvent["type"], data: Record<string, unknown>) {
  const event: LiveEvent = { to, type, data };
  deliver(event);
  startRedis();
  if (state.pub?.status === "ready") void state.pub.publish(CHANNEL, JSON.stringify({ origin: state.origin, event })).catch(() => {});
}

/** Each member may hold a few live connections (several tabs or devices); more than that are refused. */
export const MAX_CONNECTIONS_PER_MEMBER = 6;
export function subscribe(profileId: string, listener: Listener): (() => void) | null {
  startRedis();
  const set = state.listeners.get(profileId) ?? new Set<Listener>();
  if (set.size >= MAX_CONNECTIONS_PER_MEMBER) return null;
  set.add(listener);
  state.listeners.set(profileId, set);
  return () => { set.delete(listener); if (!set.size) state.listeners.delete(profileId); };
}
export const connectionCount = (profileId: string) => state.listeners.get(profileId)?.size ?? 0;

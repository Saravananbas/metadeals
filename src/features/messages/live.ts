"use client";

/**
 * One shared live connection (Server-Sent Events) per browser tab, used by the inbox, the open chat and the header badge.
 * The browser reconnects on its own; after every (re)connect the server sends "ready" and listeners reload from the API,
 * so anything missed while offline is recovered from the database.
 */
export type LiveType = "ready" | "message" | "read" | "delivered" | "typing" | "thread";
type Handler = (type: LiveType, data: Record<string, unknown>) => void;

const TYPES: LiveType[] = ["ready", "message", "read", "delivered", "typing", "thread"];
const handlers = new Set<Handler>();
let source: EventSource | null = null;
let stopped = false;

const ackDelivered = () => { void fetch("/api/v1/messages/delivered", { method: "POST" }).catch(() => {}); };

function open() {
  if (source || stopped || typeof EventSource === "undefined") return;
  const es = new EventSource("/api/v1/messages/stream");
  source = es;
  for (const type of TYPES) es.addEventListener(type, (event) => {
    let data: Record<string, unknown> = {};
    try { data = JSON.parse((event as MessageEvent).data); } catch { return; }
    // This device has now received the member's messages: tell the server so senders see "delivered".
    if (type === "ready" || (type === "message" && !(data.message as { mine?: boolean } | undefined)?.mine)) ackDelivered();
    for (const handler of handlers) handler(type, data);
  });
  // Too many open tabs for this member: this tab stays usable without live updates.
  es.addEventListener("refused", () => { stopped = true; es.close(); source = null; });
  // A closed state means the server answered with an error (signed out, or messaging is off): do not hammer it.
  es.onerror = () => { if (es.readyState === EventSource.CLOSED) { stopped = true; source = null; } };
}

export function onLive(handler: Handler): () => void {
  handlers.add(handler);
  open();
  return () => { handlers.delete(handler); if (!handlers.size && source) { source.close(); source = null; } };
}
export const liveAvailable = () => !stopped;

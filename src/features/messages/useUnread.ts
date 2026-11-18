"use client";
import { useCallback, useEffect, useState } from "react";
import { onLive } from "./live";

/** Unread private messages for the signed-in member, kept current by the live connection. Null while unknown, signed out or when messaging is off. */
// Anonymous visitors would otherwise get a 401 in the browser console on every page; ask the session once (shared by every caller) before asking for messages.
let signedIn: Promise<boolean> | null = null;
const isSignedIn = () => (signedIn ??= fetch("/api/v1/customer/session", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => Boolean(b?.user)).catch(() => false));

export function useUnreadMessages(): number | null {
  const [unread, setUnread] = useState<number | null>(null);
  const load = useCallback(() => fetch("/api/v1/messages/unread", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => setUnread(b?.data?.enabled ? b.data.unread : null)).catch(() => {}), []);
  useEffect(() => { const first = setTimeout(() => { void isSignedIn().then((ok) => { if (ok) void load(); }); }, 0); return () => clearTimeout(first); }, [load]);
  // The live connection is opened only once messaging is known to be available for this visitor.
  useEffect(() => (unread === null ? undefined : onLive((type) => { if (type !== "typing" && type !== "delivered") void load(); })), [unread === null, load]); // eslint-disable-line react-hooks/exhaustive-deps
  return unread;
}

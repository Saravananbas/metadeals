"use client";

import { useSyncExternalStore } from "react";

const key = "metadeals4u-demo-saved";
const eventName = "metadeals-saved-change";
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(eventName, callback); };
};
const snapshot = () => { try { return localStorage.getItem(key) ?? "[]"; } catch { return "[]"; } };

export function useSavedDeals() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  let ids: string[] = [];
  try { const parsed: unknown = JSON.parse(raw); if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === "string"); } catch { /* Ignore corrupted local data. */ }
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    try {
      localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event(eventName));
      // Signed-in members also keep the bookmark on their account; a visitor's 401 is ignored and the browser copy stays.
      void fetch("/api/v1/customer/saved-deals", { method: ids.includes(id) ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealId: id }) }).catch(() => {});
      return true;
    } catch { return false; }
  };
  return { ids, toggle };
}

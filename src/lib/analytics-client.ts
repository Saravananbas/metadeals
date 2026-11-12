"use client";

export type ConsentState = "accepted" | "declined" | null;
export const CONSENT_KEY = "md_consent";
export const CONSENT_EVENT = "md-consent-change";
const SEEN_KEY = "md_seen";

export function getConsent(): ConsentState {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(value: Exclude<ConsentState, null>) {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
    if (value === "declined") window.localStorage.removeItem(SEEN_KEY);
  } catch {
    // Storage blocked: the choice simply is not remembered.
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** True when this browser has visited before (only remembered after the visitor accepted analytics). */
export function markReturning(): boolean {
  try {
    const seen = window.localStorage.getItem(SEEN_KEY) === "1";
    window.localStorage.setItem(SEEN_KEY, "1");
    return seen;
  } catch {
    return false;
  }
}

type Payload = {
  type: "PAGE_VIEW" | "HEARTBEAT" | "COUPON_COPY" | "SHARE" | "LIKE" | "COMMENT" | "MODAL_OPEN" | "SEARCH";
  path: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  channel?: string;
  eventId?: string;
  seconds?: number;
  returning?: boolean;
  dealSlug?: string;
};

export async function sendCollect(payload: Payload): Promise<string | null> {
  try {
    const response = await fetch("/api/v1/analytics/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, consent: getConsent() === "accepted" }),
      keepalive: true,
    });
    const result = (await response.json()) as { eventId?: string | null };
    return result.eventId ?? null;
  } catch {
    return null;
  }
}

/** Fire-and-forget action event (coupon copy, share, like, comment, modal open). */
export function trackEvent(type: Exclude<Payload["type"], "PAGE_VIEW" | "HEARTBEAT">, dealSlug?: string) {
  if (typeof window === "undefined") return;
  void sendCollect({ type, path: window.location.pathname + window.location.search, dealSlug });
}

"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, getConsent, markReturning, sendCollect } from "@/lib/analytics-client";

const HEARTBEAT_SECONDS = 15;

/** Sends one page view per route change and an active-time heartbeat while the tab is visible and analytics are accepted. */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const eventId = useRef<string | null>(null);
  const firstView = useRef(true);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    let cancelled = false;
    eventId.current = null;
    const params = new URLSearchParams(window.location.search);
    const accepted = getConsent() === "accepted";
    void sendCollect({
      type: "PAGE_VIEW",
      path: pathname,
      referrer: firstView.current ? document.referrer || undefined : undefined,
      utmSource: params.get("utm_source") ?? undefined,
      utmMedium: params.get("utm_medium") ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
      channel: (params.get("c") ?? params.get("channel") ?? undefined)?.slice(0, 30),
      returning: accepted ? markReturning() : undefined,
    }).then((id) => {
      if (!cancelled) eventId.current = id;
    });
    firstView.current = false;
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || getConsent() !== "accepted" || !eventId.current) return;
      void sendCollect({ type: "HEARTBEAT", path: pathname, eventId: eventId.current, seconds: HEARTBEAT_SECONDS });
    }, HEARTBEAT_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  // A choice made after the first page view: register the current page again under the new choice.
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const onChange = () => {
      void sendCollect({ type: "PAGE_VIEW", path: pathname, returning: getConsent() === "accepted" ? markReturning() : undefined }).then((id) => {
        eventId.current = id;
      });
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, [pathname]);

  return null;
}

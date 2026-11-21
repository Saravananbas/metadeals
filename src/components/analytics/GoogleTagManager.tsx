"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, getConsent } from "@/lib/analytics-client";

// Set NEXT_PUBLIC_GTM_ID (empty to switch off) before the build; production builds only, so local work never counts as visits.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-WN8LB3ZM";
const PRIVATE_AREAS = /^\/(admin|moderator|messages)(\/|$)/;

declare global { interface Window { dataLayer?: unknown[] } }

// Google's commands must be pushed as the `arguments` object, not as an array.
function gtag(...args: unknown[]) {
  void args;
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
}

/**
 * Google Tag Manager (Google Analytics runs inside it). It is loaded only after the visitor presses Accept on the cookie banner,
 * and only on public pages. Consent mode says analytics is allowed and advertising is not.
 * shortcut: no <noscript> fallback, because a visitor without scripts cannot give consent; no unloading if the choice changes later (the page just stops sending new events after a reload).
 */
export function GoogleTagManager() {
  const pathname = usePathname();
  useEffect(() => {
    if (!GTM_ID || process.env.NODE_ENV !== "production" || PRIVATE_AREAS.test(pathname)) return;
    const start = () => {
      if (getConsent() !== "accepted" || document.getElementById("gtm-loader")) return;
      gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
      gtag("consent", "update", { analytics_storage: "granted" });
      (window.dataLayer ??= []).push({ "gtm.start": Date.now(), event: "gtm.js" });
      const script = document.createElement("script");
      script.id = "gtm-loader";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(GTM_ID)}`;
      document.head.appendChild(script);
    };
    start();
    window.addEventListener(CONSENT_EVENT, start);
    return () => window.removeEventListener(CONSENT_EVENT, start);
  }, [pathname]);
  return null;
}

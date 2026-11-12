"use client";

import { useEffect } from "react";

export function DealViewTracker({ slug }: { slug: string }) {
  useEffect(() => {
    // Only track once per page session
    const sessionKey = `viewed_deal_${slug}`;
    if (typeof window !== "undefined" && !sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, "1");
      fetch(`/api/v1/deals/${encodeURIComponent(slug)}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => {
        // Non-blocking view ping
      });
    }
  }, [slug]);

  return null;
}


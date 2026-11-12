// Small, dependency-free helpers: device class from the user agent (the raw agent is never stored) and path classification.
export function parseUserAgent(ua: string) {
  const u = ua.toLowerCase();
  const deviceType = /ipad|tablet|(android(?!.*mobile))/.test(u) ? "tablet" : /mobi|iphone|ipod|android/.test(u) ? "mobile" : "desktop";
  const browser = /edg\//.test(u) ? "Edge" : /opr\/|opera/.test(u) ? "Opera" : /chrome|crios/.test(u) ? "Chrome" : /firefox|fxios/.test(u) ? "Firefox" : /safari/.test(u) ? "Safari" : "Other";
  const os = /windows/.test(u) ? "Windows" : /android/.test(u) ? "Android" : /iphone|ipad|ipod|ios/.test(u) ? "iOS" : /mac os/.test(u) ? "macOS" : /linux/.test(u) ? "Linux" : "Other";
  return { deviceType, browser, os };
}

export type PageType = "home" | "deal" | "account" | "privacy" | "other";

export function classifyPath(path: string): { pageType: PageType; slug?: string } {
  if (path === "/" || path === "") return { pageType: "home" };
  const deal = path.match(/^\/deal\/([^/?#]+)/);
  if (deal) return { pageType: "deal", slug: decodeURIComponent(deal[1]) };
  if (path.startsWith("/account")) return { pageType: "account" };
  if (path.startsWith("/privacy")) return { pageType: "privacy" };
  return { pageType: "other" };
}

/** Host of an external referrer, or null for direct/internal visits. */
export function referrerHostOf(referrer: string | undefined, ownHost: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return ownHost && host === ownHost.split(":")[0].replace(/^www\./, "") ? null : host.slice(0, 150);
  } catch {
    return null;
  }
}

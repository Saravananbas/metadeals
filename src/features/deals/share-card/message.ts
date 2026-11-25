import { dealShareUrl } from "../short-link";
import { formatPaise } from "../currency";
import type { ShareDealData } from "./types";

export type ShareLinks = { playStore?: string; appStore?: string; social: { label: string; url: string }[] };

const httpsOnly = (value: string | undefined) => { try { return value && new URL(value).protocol === "https:" ? new URL(value).toString() : undefined; } catch { return undefined; } };

/**
 * Optional links for the end of the message, read from settings: NEXT_PUBLIC_PLAY_STORE_URL, NEXT_PUBLIC_APP_STORE_URL and
 * NEXT_PUBLIC_SOCIAL_LINKS ("Instagram|https://...,Telegram|https://..."). A link that is not set is left out, never invented.
 */
export function configuredShareLinks(): ShareLinks {
  const social = (process.env.NEXT_PUBLIC_SOCIAL_LINKS ?? "").split(",").flatMap((entry) => {
    const [label, url] = entry.split("|").map((s) => s?.trim());
    const safe = httpsOnly(url);
    return label && safe ? [{ label, url: safe }] : [];
  });
  return { playStore: httpsOnly(process.env.NEXT_PUBLIC_PLAY_STORE_URL), appStore: httpsOnly(process.env.NEXT_PUBLIC_APP_STORE_URL), social };
}

/** The link people open: the production address, never localhost (a local or private address falls back to the production site). */
export function publicDealUrl(origin: string, deal: { id: string; slug?: string | null }): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || origin;
  let base = "https://metadeals4u.in";
  try { const u = new URL(configured); if (!/^(localhost|127\.|\[?::1)/i.test(u.hostname)) base = u.origin; } catch { /* keep the production address */ }
  return dealShareUrl(base, deal);
}

/**
 * The text sent with the picture: the deal price, a clickable Buy Now link and a follow line. The coupon and bank offers are
 * already in the picture, so they are not repeated. `includeUrl: false` is for Telegram, which takes the link as a separate field.
 */
export function buildShareMessage(deal: ShareDealData, url: string, options: { includeUrl?: boolean; links?: ShareLinks } = {}): string {
  const links = options.links ?? configuredShareLinks();
  const lines = [`Deal Price: ${formatPaise(deal.priceMinor).replace("\u20B9", "Rs. ")}`];
  if (options.includeUrl !== false) lines.push("Buy Now:", url);
  lines.push("Follow Us for More Deals on MetaDeals4U!");
  for (const s of links.social) lines.push(`${s.label}: ${s.url}`);
  if (links.playStore || links.appStore) {
    const where = links.playStore && links.appStore ? "Play Store & App Store" : links.playStore ? "Play Store" : "App Store";
    lines.push(`Download our App ${links.playStore && links.appStore ? "in" : "on"} ${where}.`);
    if (links.playStore) lines.push(`Play Store: ${links.playStore}`);
    if (links.appStore) lines.push(`App Store: ${links.appStore}`);
  }
  return lines.join("\n");
}

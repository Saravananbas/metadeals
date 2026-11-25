import { offerShareLine } from "../bank-offers";
import { formatPaise } from "../currency";
import { dealShareUrl } from "../short-link";
import { minorSavings } from "../validation";
import type { ShareDealData } from "./types";

/** The link people open: the production address, never localhost (a local or private address falls back to the production site). */
export function publicDealUrl(origin: string, deal: { id: string; slug?: string | null }): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || origin;
  let base = "https://metadeals4u.in";
  try { const u = new URL(configured); if (!/^(localhost|127\.|\[?::1)/i.test(u.hostname)) base = u.origin; } catch { /* keep the production address */ }
  return dealShareUrl(base, deal);
}

/**
 * The plain text that goes with the product photo, in this order: title, selling price, MRP, coupon, bank offers, link.
 * Built only from the deal's own data: a part that does not exist is left out, nothing is invented, no branding is added.
 * `includeUrl: false` is for Telegram, which takes the link as a separate field.
 */
export function buildShareMessage(deal: ShareDealData, url: string, options: { includeUrl?: boolean } = {}): string {
  const { savingsMinor } = minorSavings(deal.mrpMinor, deal.priceMinor);
  const lines: string[] = [deal.title, `Selling Price: ${formatPaise(deal.priceMinor)}`];
  if (savingsMinor > 0) lines.push(`MRP: ${formatPaise(deal.mrpMinor)}`); // an MRP equal to the price is not shown as a discount
  if (deal.couponCode) lines.push(`Coupon: ${deal.couponCode}`);
  if (deal.bankOffers.length) lines.push("Bank Offers:", ...deal.bankOffers.map((o) => `\u2022 ${offerShareLine(o)}`));
  if (options.includeUrl !== false) lines.push("Open Deal:", url);
  return lines.join("\n");
}

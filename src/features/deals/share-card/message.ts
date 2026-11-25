import { offerShareLine } from "../bank-offers";
import { formatPaise } from "../currency";
import { minorSavings } from "../validation";
import type { ShareDealData } from "./types";

/**
 * The text that goes with the shared picture, built only from the deal's own data: an empty part is left out, nothing is invented.
 * `includeUrl: false` is for Telegram, which takes the link as a separate field.
 */
export function buildShareMessage(deal: ShareDealData, url: string, options: { includeUrl?: boolean } = {}): string {
  const { savingsMinor, discountPercent } = minorSavings(deal.mrpMinor, deal.priceMinor);
  const lines: string[] = [`\u{1F525} ${discountPercent > 0 ? `${discountPercent}% OFF \u2013 ` : ""}${deal.title}`];
  if (savingsMinor > 0) lines.push(`\u{1F4B0} MRP: ${formatPaise(deal.mrpMinor)}`);
  lines.push(`\u{1F3F7}\uFE0F Deal Price: ${formatPaise(deal.priceMinor)}`);
  if (savingsMinor > 0) lines.push(`\u{1F49A} You Save: ${formatPaise(savingsMinor)}`);
  if (deal.couponCode) lines.push(`\u{1F39F}\uFE0F Coupon: ${deal.couponCode}`);
  if (deal.bankOffers.length) lines.push("\u{1F3E6} Bank Offers:", ...deal.bankOffers.map((o) => `\u2022 ${offerShareLine(o)}`));
  if (options.includeUrl !== false) lines.push("\u{1F6D2} Grab this deal:", url);
  lines.push("Discover more exciting deals on MetaDeals4U!");
  return lines.join("\n");
}

import { z } from "zod";
import { formatINR } from "@/features/deals/pricing";

export const destinationInputSchema = z.object({
  platform: z.enum(["TELEGRAM", "WHATSAPP"]),
  name: z.string().trim().min(2).max(100),
  destinationId: z.string().trim().min(1).max(120),
  isActive: z.boolean().default(true),
}).strict();

export type DestinationInput = z.infer<typeof destinationInputSchema>;

export const publishDealInputSchema = z.object({
  dealId: z.string().trim().min(1).max(100),
  destinationIds: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
  mockOnly: z.boolean().default(false),
}).strict();

export type PublishDealInput = z.infer<typeof publishDealInputSchema>;

export interface DealDistributionPayload {
  id: string;
  slug: string;
  title: string;
  brand: string;
  priceMinor: number;
  mrpMinor: number;
  merchantName: string;
  siteBaseUrl?: string;
}

export function calculateSavingPercent(priceMinor: number, mrpMinor: number): number {
  if (mrpMinor <= 0 || priceMinor >= mrpMinor) return 0;
  return Math.round(((mrpMinor - priceMinor) / mrpMinor) * 100);
}

export function formatTelegramMessage(deal: DealDistributionPayload): string {
  const saving = calculateSavingPercent(deal.priceMinor, deal.mrpMinor);
  const price = formatINR(Math.round(deal.priceMinor / 100));
  const mrp = formatINR(Math.round(deal.mrpMinor / 100));
  const base = deal.siteBaseUrl || "https://metadeals4u.in";
  const link = `${base}/go/${deal.slug || deal.id}?c=telegram`;

  return [
    `🔥 <b>${deal.title}</b>`,
    deal.brand ? `🏷️ Brand: <b>${deal.brand}</b>` : null,
    `💰 <b>${price}</b> <s>${mrp}</s> ${saving > 0 ? `(<b>${saving}% OFF</b>)` : ""}`,
    `🏪 Store: <b>${deal.merchantName}</b>`,
    "",
    `👉 <a href="${link}">Get This Deal</a>`,
    `ℹ️ <i>Prices and availability subject to change.</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatWhatsAppMessage(deal: DealDistributionPayload): string {
  const saving = calculateSavingPercent(deal.priceMinor, deal.mrpMinor);
  const price = formatINR(Math.round(deal.priceMinor / 100));
  const mrp = formatINR(Math.round(deal.mrpMinor / 100));
  const base = deal.siteBaseUrl || "https://metadeals4u.in";
  const link = `${base}/go/${deal.slug || deal.id}?c=whatsapp`;

  return [
    `🔥 *${deal.title}*`,
    `💰 *${price}* ~${mrp}~ ${saving > 0 ? `(*${saving}% OFF*)` : ""}`,
    `🏪 Store: *${deal.merchantName}*`,
    "",
    `👉 Buy Now: ${link}`,
  ].join("\n");
}

export function createWhatsAppShareUrl(deal: DealDistributionPayload): string {
  const text = formatWhatsAppMessage(deal);
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

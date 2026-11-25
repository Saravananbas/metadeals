import { parseEditorNotes } from "./notes";
import { z } from "zod";

export function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      host.includes(".") && !/^\d+(\.\d+){3}$/.test(host) && !host.includes(":") &&
      !["localhost", "local", "internal", "test", "invalid", "example"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch { return false; }
}
export const publicUrl = z.string().trim().max(2048).refine(isPublicHttpsUrl, "Use a public HTTPS URL without credentials or a custom port.");
export const slugSchema = z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const purchaseOptionSchema = z.object({ merchantId: z.string().min(1).max(100), priceMinor: z.number().int().min(0).max(2_000_000_000), productUrl: publicUrl, affiliateUrl: publicUrl.nullable() }).strict();
const optionalDate = z.iso.datetime({ offset: true }).nullable();
export const BANK_CARD_TYPES = ["CREDIT", "DEBIT", "EMI", "UPI", "WALLET", "ANY"] as const;
/** UPI and wallet offers belong to a payment method, not to one bank. */
export const needsBank = (cardType: string) => cardType !== "UPI" && cardType !== "WALLET";
/** One bank offer on a deal: a flat amount off, or a percentage (with an optional cap). Amounts are in paise. */
export const bankOfferSchema = z.object({
  bankId: z.string().min(1).max(100).nullable(),
  cardType: z.enum(BANK_CARD_TYPES),
  discountType: z.enum(["FLAT", "PERCENT"]),
  flatMinor: z.number().int().min(1).max(2_000_000_000).nullable(),
  percent: z.number().int().min(1).max(100).nullable(),
  capMinor: z.number().int().min(1).max(2_000_000_000).nullable(),
  minOrderMinor: z.number().int().min(1).max(2_000_000_000).nullable(),
  code: z.string().trim().max(40).nullable(),
  terms: z.string().trim().max(300).nullable(),
  validUntil: optionalDate,
}).strict().superRefine((o, ctx) => {
  if (needsBank(o.cardType) && !o.bankId) ctx.addIssue({ code: "custom", path: ["bankId"], message: "Choose a bank." });
  if (o.discountType === "FLAT" && o.flatMinor === null) ctx.addIssue({ code: "custom", path: ["flatMinor"], message: "Enter the discount amount." });
  if (o.discountType === "PERCENT" && o.percent === null) ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter the discount percentage." });
});
export type BankOfferInput = z.infer<typeof bankOfferSchema>;
export const dealInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(3).max(200),
  brand: z.string().trim().max(100),
  description: z.string().trim().min(1).max(2000),
  /** Formatted description (sanitized on save). Omitted = leave as is; it is cleared when the plain description is edited without it. */
  descriptionHtml: z.string().max(20000).nullable().optional(),
  categoryId: z.string().min(1).max(100),
  merchantId: z.string().min(1).max(100),
  mediaId: z.string().min(1).max(100),
  galleryMediaIds: z.array(z.string().min(1).max(100)).max(10).optional(),
  mrpMinor: z.number().int().min(1).max(2_000_000_000),
  priceMinor: z.number().int().min(0).max(2_000_000_000),
  currency: z.literal("INR"),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0).max(2_000_000_000).nullable(),
  ratingSource: z.string().trim().min(1).max(200).nullable(),
  productUrl: publicUrl,
  affiliateUrl: publicUrl.nullable(),
  couponCode: z.string().trim().max(50).nullable().optional(),
  /** Staff points for the deal page, one per line. Omitted = leave as is. */
  editorNotes: z.string().max(3000).nullable().optional(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "EXPIRED"]),
  publishedAt: optionalDate,
  startsAt: optionalDate,
  expiresAt: optionalDate,
  featured: z.boolean(),
  trending: z.boolean(),
  options: z.array(purchaseOptionSchema).max(10).default([]),
  /** Bank offers shown on the card and deal page. Omitted = leave as is. */
  bankOffers: z.array(bankOfferSchema).max(10).optional(),
}).strict().superRefine((value, ctx) => {
  const notes = parseEditorNotes(value.editorNotes);
  if (notes.error) ctx.addIssue({ code: "custom", path: ["editorNotes"], message: notes.error });
  if (value.priceMinor > value.mrpMinor) ctx.addIssue({ code: "custom", path: ["priceMinor"], message: "Deal price cannot exceed MRP." });
  if (new Set(value.options.map((o) => o.merchantId)).size !== value.options.length || value.options.some((o) => o.priceMinor > value.mrpMinor)) ctx.addIssue({ code: "custom", path: ["options"], message: "Options need distinct merchants and prices at or below MRP." });
  if (value.galleryMediaIds && (new Set(value.galleryMediaIds).size !== value.galleryMediaIds.length || value.galleryMediaIds.includes(value.mediaId))) ctx.addIssue({ code: "custom", path: ["galleryMediaIds"], message: "Gallery images must be unique and exclude the primary image." });
  if ((value.rating !== null || value.reviewCount !== null) && !value.ratingSource) ctx.addIssue({ code: "custom", path: ["ratingSource"], message: "Ratings/review counts require a source label." });
  const start = Math.max(value.startsAt ? Date.parse(value.startsAt) : 0, value.publishedAt ? Date.parse(value.publishedAt) : 0);
  if (value.expiresAt && Date.parse(value.expiresAt) <= start) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be later than start/publication." });
});
export type DealInput = z.infer<typeof dealInputSchema>;
export const categoryInputSchema = z.object({ slug: slugSchema, name: z.string().trim().min(2).max(100), parentId: z.string().min(1).max(100).nullable().default(null) }).strict();
export const merchantInputSchema = categoryInputSchema.omit({ parentId: true }).extend({
  websiteUrl: publicUrl,
  // A bare "com" would let every .com address through the redirect allowlist, so entries must be real host names with a dot.
  affiliateHosts: z.array(z.string().trim().toLowerCase().max(253).regex(/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/, "Use a full host name such as example.com")).max(100).default([]),
});
export const listingSchema = z.object({
  q: z.string().trim().max(100).default(""),
  category: z.string().max(100).default(""),
  store: z.string().max(100).default(""),
  view: z.enum(["top", "latest", "featured", "trending"]).default("top"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  cursor: z.string().max(100).optional(),
});
export type ListingInput = z.infer<typeof listingSchema>;

export function minorSavings(mrpMinor: number, priceMinor: number) {
  if (!Number.isSafeInteger(mrpMinor) || !Number.isSafeInteger(priceMinor) || mrpMinor <= 0 || priceMinor < 0 || priceMinor > mrpMinor) return { savingsMinor: 0, discountPercent: 0 };
  return { savingsMinor: mrpMinor - priceMinor, discountPercent: Math.floor(((mrpMinor - priceMinor) * 100) / mrpMinor) };
}

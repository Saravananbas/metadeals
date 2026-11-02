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
export const dealInputSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(3).max(200),
  brand: z.string().trim().max(100),
  description: z.string().trim().min(1).max(2000),
  categoryId: z.string().min(1).max(100),
  merchantId: z.string().min(1).max(100),
  mediaId: z.string().min(1).max(100),
  mrpMinor: z.number().int().min(1).max(2_000_000_000),
  priceMinor: z.number().int().min(0).max(2_000_000_000),
  currency: z.literal("INR"),
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0).max(2_000_000_000).nullable(),
  ratingSource: z.string().trim().min(1).max(200).nullable(),
  productUrl: publicUrl,
  affiliateUrl: publicUrl.nullable(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "EXPIRED"]),
  publishedAt: optionalDate,
  startsAt: optionalDate,
  expiresAt: optionalDate,
  featured: z.boolean(),
  trending: z.boolean(),
  options: z.array(purchaseOptionSchema).max(10).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.priceMinor > value.mrpMinor) ctx.addIssue({ code: "custom", path: ["priceMinor"], message: "Deal price cannot exceed MRP." });
  if (new Set(value.options.map((o) => o.merchantId)).size !== value.options.length || value.options.some((o) => o.priceMinor > value.mrpMinor)) ctx.addIssue({ code: "custom", path: ["options"], message: "Options need distinct merchants and prices at or below MRP." });
  if ((value.rating !== null || value.reviewCount !== null) && !value.ratingSource) ctx.addIssue({ code: "custom", path: ["ratingSource"], message: "Ratings/review counts require a source label." });
  const start = Math.max(value.startsAt ? Date.parse(value.startsAt) : 0, value.publishedAt ? Date.parse(value.publishedAt) : 0);
  if (value.expiresAt && Date.parse(value.expiresAt) <= start) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be later than start/publication." });
});
export type DealInput = z.infer<typeof dealInputSchema>;
export const categoryInputSchema = z.object({ slug: slugSchema, name: z.string().trim().min(2).max(100), parentId: z.string().min(1).max(100).nullable().default(null) }).strict();
export const merchantInputSchema = categoryInputSchema.omit({ parentId: true }).extend({ websiteUrl: publicUrl });
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

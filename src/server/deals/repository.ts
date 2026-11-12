import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingInput } from "@/features/deals/validation";
import { minorSavings } from "@/features/deals/validation";

export type DealDatabase = Prisma.TransactionClient;
export const merchantSelect = { id: true, slug: true, name: true, websiteUrl: true, affiliateHosts: true, createdAt: true, updatedAt: true } as const;
export const dealInclude = {
  category: true,
  merchant: { select: merchantSelect },
  media: true,
  galleryImages: { orderBy: { position: "asc" }, include: { media: true } },
  options: { include: { merchant: { select: merchantSelect } } },
  _count: { select: { videoReviews: { where: { isActive: true } } } },
} as const;
export type DealRecord = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

const SEARCH_SYNONYMS: Record<string, string[]> = {
  mobile: ["mobile", "phone", "iphone", "galaxy", "smartphone"],
  mobiles: ["mobile", "phone", "iphone", "galaxy", "smartphone"],
  phone: ["mobile", "phone", "iphone", "smartphone"],
  phones: ["mobile", "phone", "iphone", "smartphone"],
  laptop: ["laptop", "notebook", "macbook"],
  laptops: ["laptop", "notebook", "macbook"],
  watch: ["watch", "smartwatch"],
  watches: ["watch", "smartwatch"],
  smartwatch: ["watch", "smartwatch"],
  smartwatches: ["watch", "smartwatch"],
  headphone: ["headphone", "earphone", "earbuds", "audio", "buds"],
  headphones: ["headphone", "earphone", "earbuds", "audio", "buds"],
  earphones: ["headphone", "earphone", "earbuds", "audio", "buds"],
  tv: ["tv", "television", "oled", "led"],
  tvs: ["tv", "television", "oled", "led"],
  television: ["tv", "television"],
};

export function buildSearchFilter(query?: string): Prisma.DealWhereInput {
  if (!query || !query.trim()) return {};
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return {};

  return {
    AND: words.map((word) => {
      const singular = word.endsWith("ies")
        ? word.slice(0, -3) + "y"
        : word.endsWith("es")
        ? word.slice(0, -2)
        : word.endsWith("s")
        ? word.slice(0, -1)
        : word;
      const variations = Array.from(
        new Set([word, singular, ...(SEARCH_SYNONYMS[word] || []), ...(SEARCH_SYNONYMS[singular] || [])])
      ).filter((v) => v.length > 1);

      return {
        OR: variations.flatMap((v) => [
          { title: { contains: v, mode: "insensitive" as const } },
          { brand: { contains: v, mode: "insensitive" as const } },
          { description: { contains: v, mode: "insensitive" as const } },
          { category: { name: { contains: v, mode: "insensitive" as const } } },
          { category: { slug: { contains: v, mode: "insensitive" as const } } },
          { merchant: { name: { contains: v, mode: "insensitive" as const } } },
        ]),
      };
    }),
  };
}

export function publicWhere(input: ListingInput, now = new Date()): Prisma.DealWhereInput {
  return {
    status: "PUBLISHED", publishedAt: { lte: now },
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    ...(input.category ? { category: { OR: [{ slug: input.category }, { parent: { slug: input.category } }] } } : {}),
    ...(input.store ? { merchant: { slug: input.store } } : {}),
    ...(input.view === "featured" ? { featured: true } : {}),
    ...(input.view === "trending" ? { trending: true } : {}),
    ...buildSearchFilter(input.q),
  };
}

export function publicDeal(record: DealRecord, merchantLogoUrl: string | null = null) {
  return {
    id: record.id, slug: record.slug, title: record.title, brand: record.brand, description: record.description,
    category: { id: record.category.id, slug: record.category.slug, name: record.category.name },
    merchant: { id: record.merchant.id, slug: record.merchant.slug, name: record.merchant.name, logoUrl: merchantLogoUrl },
    image: { url: `/api/v1/media/${record.mediaId}`, alt: record.media.alt, width: record.media.width, height: record.media.height },
    imageGallery: record.galleryImages.map((image) => ({ url: `/api/v1/media/${image.mediaId}`, alt: image.media.alt, width: image.media.width, height: image.media.height })),
    mrpMinor: record.mrpMinor, priceMinor: record.priceMinor, currency: record.currency,
    ...minorSavings(record.mrpMinor, record.priceMinor),
    rating: record.rating, reviewCount: record.reviewCount, ratingSource: record.ratingSource,
    viewCount: record.viewCount ?? 0,
    shareCount: record.shareCount ?? 0,
    productUrl: record.productUrl, destinationUrl: record.affiliateUrl ?? record.productUrl,
    couponCode: record.couponCode ?? null,
    isAffiliate: Boolean(record.affiliateUrl), featured: record.featured, trending: record.trending,
    publishedAt: record.publishedAt?.toISOString() ?? null, startsAt: record.startsAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    options: record.options.map((o) => ({ id: o.id, merchant: o.merchant.name, priceMinor: o.priceMinor, destinationUrl: o.affiliateUrl ?? o.productUrl, isAffiliate: Boolean(o.affiliateUrl) })),
  };
}
export type PublicDeal = ReturnType<typeof publicDeal>;
function normalizedMerchantDomain(value: string) {
  try { return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}
export async function publicDealsWithMerchantLogos(db: DealDatabase, records: DealRecord[]) {
  const domains = [...new Set(records.map((record) => normalizedMerchantDomain(record.merchant.websiteUrl)).filter(Boolean))];
  if (!domains.length) return records.map((record) => publicDeal(record));
  const directoryMerchants = await db.merchantWebsiteDirectory.findMany({
    where: { domain: { in: domains } },
    select: { domain: true, logoUrl: true },
  });
  const logosByDomain = new Map(directoryMerchants.map((merchant) => [normalizedMerchantDomain(merchant.domain), merchant.logoUrl]));
  return records.map((record) => publicDeal(record, logosByDomain.get(normalizedMerchantDomain(record.merchant.websiteUrl)) ?? null));
}
export async function listPublicDeals(db: DealDatabase, input: ListingInput, now = new Date()) {
  const records = await db.deal.findMany({ where: publicWhere(input, now), include: dealInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }], ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : { skip: (input.page - 1) * input.limit }), take: input.limit + 1 });
  return { data: await publicDealsWithMerchantLogos(db, records.slice(0, input.limit)), page: input.page, limit: input.limit, hasMore: records.length > input.limit, nextCursor: records.length > input.limit ? records[input.limit - 1].id : null };
}

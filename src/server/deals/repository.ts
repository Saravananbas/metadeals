import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { ListingInput } from "@/features/deals/validation";
import { minorSavings } from "@/features/deals/validation";

export type DealDatabase = Prisma.TransactionClient;
export const merchantSelect = { id: true, slug: true, name: true, websiteUrl: true, affiliateHosts: true, createdAt: true, updatedAt: true } as const;
export const dealInclude = { category: true, merchant: { select: merchantSelect }, media: true, options: { include: { merchant: { select: merchantSelect } } } } as const;
export type DealRecord = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

export function publicWhere(input: ListingInput, now = new Date()): Prisma.DealWhereInput {
  return {
    status: "PUBLISHED", publishedAt: { lte: now },
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    ...(input.category ? { category: { OR: [{ slug: input.category }, { parent: { slug: input.category } }] } } : {}),
    ...(input.store ? { merchant: { slug: input.store } } : {}),
    ...(input.view === "featured" ? { featured: true } : {}),
    ...(input.view === "trending" ? { trending: true } : {}),
    ...(input.q ? { OR: ["title", "brand", "description"].map((key) => ({ [key]: { contains: input.q, mode: "insensitive" } })) } : {}),
  };
}

export function publicDeal(record: DealRecord) {
  return {
    id: record.id, slug: record.slug, title: record.title, brand: record.brand, description: record.description,
    category: { id: record.category.id, slug: record.category.slug, name: record.category.name },
    merchant: { id: record.merchant.id, slug: record.merchant.slug, name: record.merchant.name },
    image: { url: `/api/v1/media/${record.mediaId}`, alt: record.media.alt, width: record.media.width, height: record.media.height },
    mrpMinor: record.mrpMinor, priceMinor: record.priceMinor, currency: record.currency,
    ...minorSavings(record.mrpMinor, record.priceMinor),
    rating: record.rating, reviewCount: record.reviewCount, ratingSource: record.ratingSource,
    productUrl: record.productUrl, destinationUrl: record.affiliateUrl ?? record.productUrl,
    isAffiliate: Boolean(record.affiliateUrl), featured: record.featured, trending: record.trending,
    publishedAt: record.publishedAt?.toISOString() ?? null, startsAt: record.startsAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    options: record.options.map((o) => ({ id: o.id, merchant: o.merchant.name, priceMinor: o.priceMinor, destinationUrl: o.affiliateUrl ?? o.productUrl, isAffiliate: Boolean(o.affiliateUrl) })),
  };
}
export type PublicDeal = ReturnType<typeof publicDeal>;
export async function listPublicDeals(db: DealDatabase, input: ListingInput, now = new Date()) {
  const records = await db.deal.findMany({ where: publicWhere(input, now), include: dealInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }], ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : { skip: (input.page - 1) * input.limit }), take: input.limit + 1 });
  return { data: records.slice(0, input.limit).map(publicDeal), page: input.page, limit: input.limit, hasMore: records.length > input.limit, nextCursor: records.length > input.limit ? records[input.limit - 1].id : null };
}

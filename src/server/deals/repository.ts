import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DealKind, ListingInput } from "@/features/deals/validation";
import { minorSavings } from "@/features/deals/validation";
import { indiaToday, PAYMENT_NAME, scheduleActive, scheduleLabel } from "@/features/deals/bank-offers";
import { searchDealIdsMariaDb, usesMariaDb } from "@/server/community/like-search";

export type DealDatabase = Prisma.TransactionClient;
export const merchantSelect = { id: true, slug: true, name: true, websiteUrl: true, affiliateHosts: true, createdAt: true, updatedAt: true } as const;
export const dealInclude = {
  category: true,
  merchant: { select: { ...merchantSelect, bankOffers: { where: { active: true }, include: { bank: { select: { id: true, name: true, logoUrl: true, active: true } } } } } },
  media: true,
  galleryImages: { orderBy: { position: "asc" }, include: { media: true } },
  options: { include: { merchant: { select: merchantSelect } } },
  bankOffers: { orderBy: { position: "asc" }, include: { bank: { select: { id: true, name: true, slug: true, logoUrl: true, active: true } } } },
  _count: { select: { videoReviews: { where: { isActive: true } }, comments: true, votes: { where: { value: 1 } } } },
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

/** One group per typed word: the word, its singular form and synonyms. A deal must match every group. */
export function searchGroups(query?: string): string[][] {
  if (!query || !query.trim()) return [];
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).map((word) => {
      const singular = word.endsWith("ies")
        ? word.slice(0, -3) + "y"
        : word.endsWith("es")
        ? word.slice(0, -2)
        : word.endsWith("s")
        ? word.slice(0, -1)
        : word;
      return Array.from(
        new Set([word, singular, ...(SEARCH_SYNONYMS[word] || []), ...(SEARCH_SYNONYMS[singular] || [])])
      ).filter((v) => v.length > 1);
  }).filter((g) => g.length);
}

export function buildSearchFilter(query?: string): Prisma.DealWhereInput {
  const groups = searchGroups(query);
  if (!groups.length) return {};
  return {
    AND: groups.map((variations) => {
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
    OR: [
      {
        status: "PUBLISHED", publishedAt: { lte: now },
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      // Expired offers remain discoverable for transparency, but the outbound
      // redirect service independently refuses purchases for this status.
      { status: "EXPIRED", publishedAt: { lte: now } },
    ],
    ...(input.category ? { category: { OR: [{ slug: input.category }, { parent: { slug: input.category } }] } } : {}),
    ...(input.store ? { merchant: { slug: input.store } } : {}),
    ...(input.view === "featured" ? { featured: true } : {}),
    ...(input.view === "trending" ? { trending: true } : {}),
    ...buildSearchFilter(input.q),
  };
}

export function publicDeal(record: DealRecord, merchantLogoUrl: string | null = null) {
  return {
    id: record.id, slug: record.slug, path: record.canonicalPath ?? null, title: record.title, brand: record.brand, description: record.description, descriptionHtml: record.descriptionHtml ?? null,
    status: record.status,
    category: { id: record.category.id, slug: record.category.slug, name: record.category.name },
    merchant: { id: record.merchant.id, slug: record.merchant.slug, name: record.merchant.name, logoUrl: merchantLogoUrl },
    image: { url: `/api/v1/media/${record.mediaId}`, alt: record.media.alt, width: record.media.width, height: record.media.height },
    imageGallery: record.galleryImages.map((image) => ({ url: `/api/v1/media/${image.mediaId}`, alt: image.media.alt, width: image.media.width, height: image.media.height })),
    kind: (record.kind ?? "PRODUCT") as DealKind, headline: record.headline ?? null,
    mrpMinor: record.mrpMinor, priceMinor: record.priceMinor, currency: record.currency,
    ...minorSavings(record.mrpMinor, record.priceMinor),
    rating: record.rating, reviewCount: record.reviewCount, ratingSource: record.ratingSource,
    viewCount: record.viewCount ?? 0,
    shareCount: record.shareCount ?? 0,
    commentCount: record._count?.comments ?? 0,
    likeCount: record._count?.votes ?? 0,
    productUrl: record.productUrl, destinationUrl: record.affiliateUrl ?? record.productUrl,
    couponCode: record.couponCode ?? null,
    editorNotes: (record.editorNotes ?? "").split(String.fromCharCode(10)).filter(Boolean), editorNotesBy: record.editorNotesBy ?? null,
    isAffiliate: Boolean(record.affiliateUrl), featured: record.featured, trending: record.trending,
    publishedAt: record.publishedAt?.toISOString() ?? null, startsAt: record.startsAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    options: record.options.map((o) => ({ id: o.id, merchant: o.merchant.name, priceMinor: o.priceMinor, destinationUrl: o.affiliateUrl ?? o.productUrl, isAffiliate: Boolean(o.affiliateUrl) })),
    // Offers set on this deal, then the store-wide ones in force today. An offer past its date, or from a bank switched off, is not shown.
    bankOffers: [
      ...record.bankOffers.filter((o) => (!o.bank || o.bank.active) && (!o.validUntil || o.validUntil > new Date())).map((o) => ({
        id: o.id, bankId: o.bankId, bankName: o.bank?.name ?? PAYMENT_NAME[o.cardType] ?? "Payment offer", bankLogoUrl: o.bank?.logoUrl ?? null, cardType: o.cardType, discountType: o.discountType,
        flatMinor: o.flatMinor, percent: o.percent, capMinor: o.capMinor, minOrderMinor: o.minOrderMinor, code: o.code, terms: o.terms, validUntil: o.validUntil?.toISOString() ?? null, schedule: null as string | null,
      })),
      ...(() => { const today = indiaToday(); return record.merchant.bankOffers.filter((r) => (!r.bank || r.bank.active) && scheduleActive(r, today)).map((r) => ({
        id: `store:${r.id}`, bankId: r.bankId, bankName: r.bank?.name ?? PAYMENT_NAME[r.cardType] ?? "Payment offer", bankLogoUrl: r.bank?.logoUrl ?? null, cardType: r.cardType, discountType: r.discountType,
        flatMinor: r.flatMinor, percent: r.percent, capMinor: r.capMinor, minOrderMinor: r.minOrderMinor, code: r.code, terms: r.terms,
        validUntil: r.endsOn ? new Date(`${r.endsOn}T23:59:59+05:30`).toISOString() : null, schedule: scheduleLabel(r.weekdays),
      })); })(),
    ],
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
  // MariaDB rejects Prisma's generated LIKE (error 1267), so on MariaDB the text match runs as raw SQL and the rest of the filter is unchanged.
  const groups = usesMariaDb() ? searchGroups(input.q) : [];
  const where = groups.length ? { AND: [publicWhere({ ...input, q: "" }, now), { id: { in: await searchDealIdsMariaDb(groups) } }] } : publicWhere(input, now);
  const [records, total] = await Promise.all([db.deal.findMany({ where, include: dealInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }], ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : { skip: (input.page - 1) * input.limit }), take: input.limit + 1 }), db.deal.count({ where })]);
  return { data: await publicDealsWithMerchantLogos(db, records.slice(0, input.limit)), page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)), hasMore: records.length > input.limit, nextCursor: records.length > input.limit ? records[input.limit - 1].id : null };
}

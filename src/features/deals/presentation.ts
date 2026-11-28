import type { PublicDeal } from "@/server/deals/repository";
import type { Deal } from "./types";
export function toCard(deal: PublicDeal): Deal {
  return { id: deal.id, slug: deal.slug, path: deal.path, name: deal.title, brand: deal.brand, description: deal.description,
    category: deal.category.slug, image: deal.image.url, imageGallery: deal.imageGallery.map((image) => image.url), kind: deal.kind, headline: deal.headline, originalPrice: deal.mrpMinor / 100, price: deal.priceMinor / 100,
    rating: deal.rating, reviewCount: deal.reviewCount, ratingSource: deal.ratingSource, store: deal.merchant.slug,
    storeName: deal.merchant.name, storeLogoUrl: deal.merchant.logoUrl, retailerUrl: `/go/${deal.id}`,
    expiry: deal.status === "EXPIRED" ? "expired" : deal.expiresAt ? "active" : "unknown",
    expiresAt: deal.expiresAt, featured: deal.featured, publishedAt: deal.publishedAt ?? "",
    viewCount: deal.viewCount ?? 0, shareCount: deal.shareCount ?? 0, commentCount: deal.commentCount ?? 0, likeCount: deal.likeCount ?? 0, couponCode: deal.couponCode ?? null, bankOffers: deal.bankOffers, source: "database" };
}

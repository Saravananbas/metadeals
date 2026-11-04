import type { PublicDeal } from "@/server/deals/repository";
import type { Deal } from "./types";
export function toCard(deal: PublicDeal): Deal {
  return { id: deal.id, slug: deal.slug, name: deal.title, brand: deal.brand, description: deal.description,
    category: deal.category.slug, image: deal.image.url, originalPrice: deal.mrpMinor / 100, price: deal.priceMinor / 100,
    rating: deal.rating, reviewCount: deal.reviewCount, ratingSource: deal.ratingSource, store: deal.merchant.slug,
    storeName: deal.merchant.name, retailerUrl: `/go/${deal.id}`, expiry: deal.expiresAt ? "active" : "unknown",
    expiresAt: deal.expiresAt, featured: deal.featured, publishedAt: deal.publishedAt ?? "", source: "database" };
}

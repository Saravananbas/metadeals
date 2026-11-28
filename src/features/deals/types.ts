import type { BankOfferView } from "./bank-offers";
export type StoreId = string;
export type Deal = {
  id: string;
  name: string;
  brand: string;
  category: string;
  image: string;
  imageGallery?: string[];
  /** PRODUCT (default) or TRAVEL / SALE_PAGE: those show `headline` instead of a price and MRP. */
  kind?: "PRODUCT" | "TRAVEL" | "SALE_PAGE";
  headline?: string | null;
  originalPrice: number;
  price: number;
  rating: number | null;
  reviewCount: number | null;
  ratingSource?: string | null;
  storeName?: string;
  storeLogoUrl?: string | null;
  slug?: string;
  description?: string;
  expiresAt?: string | null;
  status?: string;
  source?: "database" | "demo";
  store: StoreId;
  retailerUrl: string;
  expiry: "unknown" | "expired" | "active";
  featured: boolean;
  publishedAt: string;
  viewCount?: number;
  shareCount?: number;
  commentCount?: number;
  likeCount?: number;
  couponCode?: string | null;
  bankOffers?: BankOfferView[];
};

export type DealFilters = { query: string; category: string; store: string; view: "top" | "latest" | "featured" };

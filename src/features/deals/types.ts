export type StoreId = string;
export type Deal = {
  id: string;
  name: string;
  brand: string;
  category: string;
  image: string;
  originalPrice: number;
  price: number;
  rating: number | null;
  reviewCount: number | null;
  ratingSource?: string | null;
  storeName?: string;
  slug?: string;
  description?: string;
  expiresAt?: string | null;
  source?: "database" | "demo";
  store: StoreId;
  retailerUrl: string;
  expiry: "unknown" | "expired" | "active";
  featured: boolean;
  publishedAt: string;
};

export type DealFilters = { query: string; category: string; store: string; view: "top" | "latest" | "featured" };

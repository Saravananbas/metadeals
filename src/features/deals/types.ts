export type StoreId = "amazon" | "flipkart" | "myntra";
export type Deal = {
  id: string;
  name: string;
  brand: string;
  category: string;
  image: string;
  originalPrice: number;
  price: number;
  rating: number;
  reviewCount: number;
  store: StoreId;
  retailerUrl: string;
  expiry: "unknown" | "expired";
  featured: boolean;
  publishedAt: string;
};

export type DealFilters = { query: string; category: string; store: string; view: "top" | "latest" | "featured" };

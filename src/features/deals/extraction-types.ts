export interface ClientField<T> {
  value: T | null;
  confidence: string;
  source?: string;
  note?: string;
}

export interface ClientExtractionResult {
  status: "FULL_SUCCESS" | "PARTIAL_SUCCESS" | "SOURCE_RESTRICTED" | "AUTHORIZATION_REQUIRED" | "FAILED";
  retailer: string;
  canonicalUrl: string;
  data: {
    identity: {
      title: ClientField<string>;
      brand: ClientField<string>;
      asin?: ClientField<string>;
      flipkartPid?: ClientField<string>;
      cromaPid?: ClientField<string>;
      sku?: ClientField<string>;
    };
    content: {
      description: ClientField<string>;
      category: ClientField<string>;
    };
    pricing: {
      mrpRupees: ClientField<number>;
      priceRupees: ClientField<number>;
      mrpMinor: ClientField<number>;
      priceMinor: ClientField<number>;
      currency: ClientField<string>;
    };
    merchant: {
      retailerName: string;
      retailerSlug: string;
      canonicalUrl: string;
    };
    media: {
      primaryImageUrl: ClientField<string>;
      importedMediaId: ClientField<string>;
    };
    ratings: {
      rating: ClientField<number>;
      reviewCount: ClientField<number>;
    };
  };
  diagnostics: {
    adapterId: string;
    adapterName: string;
    extractionMethodUsed?: string;
    executionTimeMs?: number;
    warnings: string[];
    errors: string[];
  };
  matchedTaxonomy?: {
    categoryId?: string;
    categoryName?: string;
    merchantId?: string;
    merchantName?: string;
  };
  suggestedFormValues?: {
    title: string;
    slug: string;
    brand: string;
    description: string;
    productUrl: string;
    categoryId: string;
    merchantId: string;
    mrpRupees: string;
    priceRupees: string;
    mediaId: string;
    rating?: number | null;
    reviewCount?: number | null;
    ratingSource?: string | null;
  };
}


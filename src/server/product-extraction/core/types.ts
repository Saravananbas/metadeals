export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "MISSING" | "RESTRICTED";

export type ExtractionSource =
  | "official_api"
  | "authorized_affiliate_feed"
  | "approved_provider"
  | "json_ld"
  | "open_graph"
  | "html_metadata"
  | "retailer_html_selector"
  | "embedded_json"
  | "structured_metadata"
  | "ai_extraction"
  | "url_heuristic"
  | "manual_fallback"
  | "unauthorized_restricted";

export type ExtractionStatus =
  | "FULL_SUCCESS"
  | "PARTIAL_SUCCESS"
  | "SOURCE_RESTRICTED"
  | "AUTHORIZATION_REQUIRED"
  | "FAILED";

export interface FieldProvenance<T> {
  value: T | null;
  source: ExtractionSource;
  confidence: ConfidenceLevel;
  observedAt?: string;
  note?: string;
  evidencePath?: string;
}

export interface ProductIdentity {
  title: FieldProvenance<string>;
  brand: FieldProvenance<string>;
  manufacturer: FieldProvenance<string>;
  modelNumber: FieldProvenance<string>;
  sku: FieldProvenance<string>;
  asin: FieldProvenance<string>;
  flipkartPid: FieldProvenance<string>;
  cromaPid?: FieldProvenance<string>;
  gtin: FieldProvenance<string>;
  variant: FieldProvenance<string>;
  colour: FieldProvenance<string>;
  size: FieldProvenance<string>;
  storageRam: FieldProvenance<string>;
  availability?: FieldProvenance<string>;
}

export interface ProductContent {
  description: FieldProvenance<string>;
  keyFeatures: FieldProvenance<string[]>;
  specifications: FieldProvenance<Record<string, string>>;
  category: FieldProvenance<string>;
  subcategory: FieldProvenance<string>;
  breadcrumb: FieldProvenance<string[]>;
}

export interface ProductPricing {
  mrpMinor: FieldProvenance<number>;
  priceMinor: FieldProvenance<number>;
  mrpRupees: FieldProvenance<number>;
  priceRupees: FieldProvenance<number>;
  displayedDiscount: FieldProvenance<number>;
  discountAmountMinor?: FieldProvenance<number>;
  discountPercent?: FieldProvenance<number>;
  couponDiscount: FieldProvenance<number>;
  bankOffers?: FieldProvenance<string[]>;
  currency: FieldProvenance<string>;
  observedAt: string;
}

export interface ProductMerchant {
  retailerName: string;
  retailerSlug: string;
  sellerName: FieldProvenance<string>;
  sellerId: FieldProvenance<string>;
  originalUrl: string;
  canonicalUrl: string;
}

export interface ProductMedia {
  primaryImageUrl: FieldProvenance<string>;
  additionalImageUrls: FieldProvenance<string[]>;
  imageSource: FieldProvenance<string>;
  dimensions: FieldProvenance<{ width: number; height: number }>;
  importedMediaId: FieldProvenance<string>;
  importedMediaUrl?: string;
}

export interface ProductRatings {
  rating: FieldProvenance<number>;
  reviewCount: FieldProvenance<number>;
  ratingSource: FieldProvenance<string>;
}

export interface NormalizedProductExtraction {
  identity: ProductIdentity;
  content: ProductContent;
  pricing: ProductPricing;
  merchant: ProductMerchant;
  media: ProductMedia;
  ratings: ProductRatings;
}

export interface ExtractionDiagnostics {
  adapterId: string;
  adapterName: string;
  extractionMethodUsed: string;
  executionTimeMs: number;
  warnings: string[];
  errors: string[];
}

export interface MatchedTaxonomy {
  categoryId?: string;
  categoryName?: string;
  merchantId?: string;
  merchantName?: string;
  merchantDirectoryId?: string;
}

export interface SuggestedFormValues {
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
  rating: number | null;
  reviewCount: number | null;
  ratingSource: string | null;
}

export interface ProductExtractionResult {
  status: ExtractionStatus;
  retailer: string;
  canonicalUrl: string;
  data: NormalizedProductExtraction;
  diagnostics: ExtractionDiagnostics;
  matchedTaxonomy?: MatchedTaxonomy;
  suggestedFormValues?: SuggestedFormValues;
}

export interface RetailerAuthorizationInfo {
  authorized: boolean;
  status: "AUTHORIZED" | "RESTRICTED" | "AUTHORIZATION_REQUIRED";
  reason?: string;
  supportedMethods: string[];
  primaryMethod: string;
}

export interface ExtractionContext {
  url: URL;
  rawUrl: string;
  html?: string; // Retrieved page HTML
  htmlFixture?: string; // used for testing & authorized static fixtures
  importImage?: boolean;
  userId?: string;
  directoryMerchant?: { id: string; name: string; domain: string };
}

export interface RetailerAdapter {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  canHandle(url: URL): boolean;
  checkAuthorization(): Promise<RetailerAuthorizationInfo>;
  extract(context: ExtractionContext): Promise<NormalizedProductExtraction>;
}

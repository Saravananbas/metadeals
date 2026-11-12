import "server-only";
import { createField, missingField } from "./confidence";
import type {
  ConfidenceLevel,
  ExtractionSource,
  FieldProvenance,
  NormalizedProductExtraction,
} from "./types";

type PythonFieldProvenance = {
  source_type?: string;
  source_locator?: string;
  source_url?: string;
  observed_at?: string;
  confidence?: number;
  notes?: string | null;
};

export type PythonCanonicalProduct = {
  product_url?: string;
  product_title?: string | null;
  product_images?: string[];
  brand?: string | null;
  description?: string | null;
  category?: string | null;
  subcategory?: string | null;
  merchant?: string | null;
  selected_color?: string | null;
  selected_size?: string | null;
  mrp_inr?: number | null;
  selling_price_inr?: number | null;
  discount_percent?: number | null;
  coupon_code?: string | null;
  rating?: number | null;
  review_count?: number | null;
  extraction_status?: string;
  extraction_method?: string[];
  last_checked?: string;
  notes?: string[];
  metadata?: Record<string, unknown>;
  field_provenance?: Record<string, PythonFieldProvenance[]>;
};

const extractionSource = (raw: string | undefined): ExtractionSource => {
  switch (raw) {
    case "json_ld": return "json_ld";
    case "open_graph": return "open_graph";
    case "html_metadata": return "html_metadata";
    case "embedded_state": return "embedded_json";
    case "site_adapter": return "retailer_html_selector";
    case "html_dom": return "retailer_html_selector";
    case "derived": return "manual_fallback";
    case "user_input": return "manual_fallback";
    default: return "structured_metadata";
  }
};

const confidenceLevel = (value: number | undefined): ConfidenceLevel => {
  if (value === undefined || !Number.isFinite(value)) return "MISSING";
  if (value >= 0.85) return "HIGH";
  if (value >= 0.6) return "MEDIUM";
  return "LOW";
};

function field<T>(product: PythonCanonicalProduct, name: string, value: T | null): FieldProvenance<T> {
  if (value === null || value === undefined) return missingField<T>();
  const source = product.field_provenance?.[name]?.[0];
  const detail = [source?.source_type, source?.source_locator, source?.notes]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" — ");
  return createField(
    value,
    extractionSource(source?.source_type),
    confidenceLevel(source?.confidence),
    detail || "Python universal deterministic extraction engine",
    source?.observed_at || product.last_checked,
    source?.source_locator,
  );
}

export function normalizePythonProduct(
  product: PythonCanonicalProduct,
  context: { originalUrl: string; merchantName: string; merchantSlug: string; canonicalUrl: string },
): NormalizedProductExtraction {
  const images = Array.isArray(product.product_images)
    ? [...new Set(product.product_images.filter((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url)))].slice(0, 11)
    : [];
  const primaryImage = images[0] ?? null;
  const additionalImages = images.slice(1);
  const price = typeof product.selling_price_inr === "number" && Number.isFinite(product.selling_price_inr)
    ? product.selling_price_inr
    : null;
  const mrp = typeof product.mrp_inr === "number" && Number.isFinite(product.mrp_inr)
    ? product.mrp_inr
    : null;
  const priceMinor = price === null ? null : Math.round(price * 100);
  const mrpMinor = mrp === null ? null : Math.round(mrp * 100);
  const calculatedDiscount = mrp && mrp > 0 && price !== null && price <= mrp
    ? Math.round(((mrp - price) / mrp) * 10_000) / 100
    : null;
  const discount = typeof product.discount_percent === "number" && Number.isFinite(product.discount_percent)
    ? product.discount_percent
    : calculatedDiscount;
  const category = product.category ?? null;
  const subcategory = product.subcategory ?? null;
  const breadcrumbs = [category, subcategory].filter((value): value is string => Boolean(value));
  const observedAt = product.last_checked || new Date().toISOString();

  return {
    identity: {
      title: field(product, "product_title", product.product_title ?? null),
      brand: field(product, "brand", product.brand ?? null),
      manufacturer: missingField(),
      modelNumber: missingField(),
      sku: missingField(),
      asin: missingField(),
      flipkartPid: missingField(),
      cromaPid: missingField(),
      gtin: missingField(),
      variant: field(product, "selected_color", product.selected_color ?? product.selected_size ?? null),
      colour: field(product, "selected_color", product.selected_color ?? null),
      size: field(product, "selected_size", product.selected_size ?? null),
      storageRam: missingField(),
    },
    content: {
      description: field(product, "description", product.description ?? null),
      keyFeatures: missingField(),
      specifications: missingField(),
      category: field(product, "category", category),
      subcategory: field(product, "subcategory", subcategory),
      breadcrumb: field(product, "category", breadcrumbs.length ? breadcrumbs : null),
    },
    pricing: {
      mrpMinor: field(product, "mrp_inr", mrpMinor),
      priceMinor: field(product, "selling_price_inr", priceMinor),
      mrpRupees: field(product, "mrp_inr", mrp),
      priceRupees: field(product, "selling_price_inr", price),
      displayedDiscount: field(product, "discount_percent", discount),
      discountAmountMinor: field(product, "mrp_inr", mrpMinor !== null && priceMinor !== null ? Math.max(0, mrpMinor - priceMinor) : null),
      discountPercent: field(product, "discount_percent", discount),
      couponDiscount: missingField(),
      bankOffers: missingField(),
      currency: field(product, "selling_price_inr", price === null ? null : "INR"),
      observedAt,
    },
    merchant: {
      retailerName: context.merchantName,
      retailerSlug: context.merchantSlug,
      sellerName: field(product, "merchant", product.merchant ?? null),
      sellerId: missingField(),
      originalUrl: context.originalUrl,
      canonicalUrl: context.canonicalUrl,
    },
    media: {
      primaryImageUrl: field(product, "product_images", primaryImage),
      additionalImageUrls: field(product, "product_images", additionalImages),
      imageSource: field(product, "product_images", primaryImage ? product.field_provenance?.product_images?.[0]?.source_type ?? "python_extractor" : null),
      dimensions: missingField(),
      importedMediaId: missingField(),
    },
    ratings: {
      rating: field(product, "rating", product.rating ?? null),
      reviewCount: field(product, "review_count", product.review_count ?? null),
      ratingSource: field(product, "rating", product.rating === null || product.rating === undefined ? null : "python_extractor"),
    },
  };
}

export async function fetchPythonProduct(url: string): Promise<PythonCanonicalProduct> {
  const configured = process.env.PYTHON_PRODUCT_EXTRACTOR_URL || "http://127.0.0.1:8765/extract";
  let endpoint: URL;
  try {
    endpoint = new URL(configured);
  } catch {
    throw new Error("Python product extraction endpoint is invalid.");
  }
  const allowedHosts = new Set(["127.0.0.1", "localhost", "product-extractor"]);
  if (endpoint.protocol !== "http:" || !allowedHosts.has(endpoint.hostname) || endpoint.port !== "8765" || endpoint.pathname !== "/extract" || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new Error("Python product extraction endpoint must use the private local extractor on port 8765.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Python extractor returned HTTP ${response.status}.`);
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error("Python extractor response exceeded its size limit.");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Python extractor returned an invalid product result.");
    const product = parsed as PythonCanonicalProduct;
    if (typeof product.product_url !== "string" || !Array.isArray(product.notes) || !Array.isArray(product.product_images)) {
      throw new Error("Python extractor response did not match the canonical product contract.");
    }
    return product;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Python product extraction timed out.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

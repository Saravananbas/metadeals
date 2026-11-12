import {
  cleanDescription,
  convertRupeesToIntegerPaise,
  parseEmbeddedJson,
  parseHtmlMetadata,
  parseJsonLd,
  parseOpenGraph,
} from "../adapters/base";
import { createField } from "./confidence";
import type {
  ExtractionSource,
  FieldProvenance,
  NormalizedProductExtraction,
} from "./types";

type Candidate<T> = {
  value: T | null | undefined;
  source: ExtractionSource;
  confidence: "HIGH" | "MEDIUM";
  evidencePath: string;
};

function isPresent<T>(value: T | null | undefined): value is T {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function isMissing<T>(field: FieldProvenance<T> | undefined): boolean {
  if (!field || field.confidence === "RESTRICTED") return false;
  if (field.confidence === "LOW" && field.source === "url_heuristic") return true;
  if (field.value === null || field.value === undefined) return true;
  if (typeof field.value === "string") return field.value.trim().length === 0;
  if (Array.isArray(field.value)) return field.value.length === 0;
  return false;
}

function firstCandidate<T>(candidates: Candidate<T>[]): Candidate<T> | undefined {
  return candidates.find((candidate) => isPresent(candidate.value));
}

function updateMissingField<T>(
  field: FieldProvenance<T> | undefined,
  candidates: Candidate<T>[],
  observedAt: string,
): FieldProvenance<T> | undefined {
  if (!isMissing(field)) return field;
  const candidate = firstCandidate(candidates);
  if (!candidate || candidate.value === null || candidate.value === undefined) return field;
  return createField(candidate.value, candidate.source, candidate.confidence, undefined, observedAt, candidate.evidencePath);
}

function httpsImage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Fills only missing normalized fields using deterministic page parsers.
 * Existing adapter/API values always win; restricted fields are never replaced.
 */
export function applyDeterministicFieldFallback(
  extraction: NormalizedProductExtraction,
  html: string,
  baseUrl: string,
): NormalizedProductExtraction {
  if (!html.trim()) return extraction;

  const jsonLd = parseJsonLd(html, baseUrl);
  const embedded = parseEmbeddedJson(html, baseUrl);
  const openGraph = parseOpenGraph(html, baseUrl);
  const metadata = parseHtmlMetadata(html, baseUrl);
  const observedAt = extraction.pricing.observedAt || new Date().toISOString();

  const stringCandidates = (
    key: "name" | "brand" | "description" | "category" | "sku" | "mpn" | "gtin" | "availability",
    paths: { jsonLd: string; embedded: string; openGraph: string; metadata: string },
  ): Candidate<string>[] => [
    { value: jsonLd[key] as string | undefined, source: "json_ld", confidence: "HIGH", evidencePath: paths.jsonLd },
    { value: embedded[key as keyof typeof embedded] as string | undefined, source: "embedded_json", confidence: "HIGH", evidencePath: paths.embedded },
    { value: (openGraph as Record<string, unknown>)[key] as string | undefined, source: "open_graph", confidence: "MEDIUM", evidencePath: paths.openGraph },
    { value: (metadata as Record<string, unknown>)[key] as string | undefined, source: "html_metadata", confidence: "MEDIUM", evidencePath: paths.metadata },
  ];
  const numericCandidates = (
    key: "price" | "mrp" | "ratingValue" | "reviewCount",
    paths: { jsonLd: string; embedded: string; openGraph: string; metadata: string },
  ): Candidate<number>[] => [
    { value: jsonLd[key], source: "json_ld", confidence: "HIGH", evidencePath: paths.jsonLd },
    { value: embedded[key], source: "embedded_json", confidence: "HIGH", evidencePath: paths.embedded },
    { value: (openGraph as Record<string, unknown>)[key] as number | undefined, source: "open_graph", confidence: "MEDIUM", evidencePath: paths.openGraph },
    { value: (metadata as Record<string, unknown>)[key] as number | undefined, source: "html_metadata", confidence: "MEDIUM", evidencePath: paths.metadata },
  ];

  const identity = {
    ...extraction.identity,
    title: updateMissingField(extraction.identity.title, stringCandidates("name", {
      jsonLd: "jsonld.Product.name", embedded: "embedded.product.name", openGraph: 'meta[property="og:title"]', metadata: "html.title",
    }), observedAt)!,
    brand: updateMissingField(extraction.identity.brand, stringCandidates("brand", {
      jsonLd: "jsonld.Product.brand.name", embedded: "embedded.product.brand", openGraph: 'meta[property="product:brand"]', metadata: 'itemprop="brand"',
    }), observedAt)!,
    modelNumber: updateMissingField(extraction.identity.modelNumber, stringCandidates("mpn", {
      jsonLd: "jsonld.Product.mpn", embedded: "embedded.product.mpn", openGraph: "", metadata: "",
    }), observedAt)!,
    sku: updateMissingField(extraction.identity.sku, stringCandidates("sku", {
      jsonLd: "jsonld.Product.sku", embedded: "embedded.product.sku", openGraph: 'meta[property="product:retailer_item_id"]', metadata: 'itemprop="sku"',
    }), observedAt)!,
    gtin: updateMissingField(extraction.identity.gtin, stringCandidates("gtin", {
      jsonLd: "jsonld.Product.gtin", embedded: "embedded.product.gtin", openGraph: "", metadata: "",
    }), observedAt)!,
    availability: updateMissingField(extraction.identity.availability, stringCandidates("availability", {
      jsonLd: "jsonld.Product.offers.availability", embedded: "embedded.product.availability", openGraph: 'meta[property="product:availability"]', metadata: 'itemprop="availability"',
    }), observedAt),
  };

  const content = {
    ...extraction.content,
    description: updateMissingField(extraction.content.description, stringCandidates("description", {
      jsonLd: "jsonld.Product.description", embedded: "embedded.product.description", openGraph: 'meta[property="og:description"]', metadata: 'meta[name="description"]',
    }).map((candidate) => ({ ...candidate, value: cleanDescription(candidate.value ?? undefined) ?? undefined })), observedAt)!,
    category: updateMissingField(extraction.content.category, stringCandidates("category", {
      jsonLd: "jsonld.Product.category", embedded: "", openGraph: "", metadata: "",
    }), observedAt)!,
  };

  const price = firstCandidate(numericCandidates("price", {
    jsonLd: "jsonld.Product.offers.price", embedded: "embedded.product.price", openGraph: 'meta[property="product:price:amount"]', metadata: 'itemprop="price"',
  }).map((candidate) => ({
    ...candidate,
    value: typeof candidate.value === "number" && Number.isFinite(candidate.value) && candidate.value > 0 ? candidate.value : undefined,
  })));
  const mrp = firstCandidate(numericCandidates("mrp", {
    jsonLd: "jsonld.Product.offers.highPrice", embedded: "embedded.product.price.mrp", openGraph: 'meta[property="product:original_price:amount"]', metadata: "",
  }).map((candidate) => ({
    ...candidate,
    value: typeof candidate.value === "number" && Number.isFinite(candidate.value) && candidate.value > 0 ? candidate.value : undefined,
  })));
  const priceRupees = price && typeof price.value === "number" && price.value > 0 ? price.value : null;
  const mrpRupees = mrp && typeof mrp.value === "number" && mrp.value > 0 ? mrp.value : null;
  const pricing = {
    ...extraction.pricing,
    priceMinor: updateMissingField(extraction.pricing.priceMinor, priceRupees === null ? [] : [{ ...price!, value: convertRupeesToIntegerPaise(priceRupees)! }], observedAt)!,
    priceRupees: updateMissingField(extraction.pricing.priceRupees, priceRupees === null ? [] : [{ ...price!, value: priceRupees }], observedAt)!,
    mrpMinor: updateMissingField(extraction.pricing.mrpMinor, mrpRupees === null ? [] : [{ ...mrp!, value: convertRupeesToIntegerPaise(mrpRupees)! }], observedAt)!,
    mrpRupees: updateMissingField(extraction.pricing.mrpRupees, mrpRupees === null ? [] : [{ ...mrp!, value: mrpRupees }], observedAt)!,
  };

  const rating = firstCandidate(numericCandidates("ratingValue", {
    jsonLd: "jsonld.Product.aggregateRating.ratingValue", embedded: "embedded.product.rating", openGraph: "", metadata: 'itemprop="ratingValue"',
  }).map((candidate) => ({
    ...candidate,
    value: typeof candidate.value === "number" && candidate.value >= 0 && candidate.value <= 5 ? candidate.value : undefined,
  })));
  const reviews = firstCandidate(numericCandidates("reviewCount", {
    jsonLd: "jsonld.Product.aggregateRating.reviewCount", embedded: "embedded.product.reviewCount", openGraph: "", metadata: 'itemprop="reviewCount"',
  }).map((candidate) => ({
    ...candidate,
    value: typeof candidate.value === "number" && Number.isInteger(candidate.value) && candidate.value >= 0 ? candidate.value : undefined,
  })));
  const ratings = {
    ...extraction.ratings,
    rating: updateMissingField(extraction.ratings.rating, rating ? [rating] : [], observedAt)!,
    reviewCount: updateMissingField(extraction.ratings.reviewCount, reviews ? [reviews] : [], observedAt)!,
  };

  const rawImages = [
    ...([jsonLd.image, ...(jsonLd.additionalImages ?? [])].filter((value): value is string => Boolean(value)).map((value) => ({ value, source: "json_ld" as const, path: "jsonld.Product.image[]" }))),
    ...([embedded.image, ...(embedded.additionalImages ?? [])].filter((value): value is string => Boolean(value)).map((value) => ({ value, source: "embedded_json" as const, path: "embedded.product.images[]" }))),
    ...([openGraph.image, ...(openGraph.additionalImages ?? [])].filter((value): value is string => Boolean(value)).map((value) => ({ value, source: "open_graph" as const, path: 'meta[property="og:image"]' }))),
    ...(metadata.image ? [{ value: metadata.image, source: "html_metadata" as const, path: 'itemprop="image"' }] : []),
  ];
  const primaryImage = httpsImage(jsonLd.image) || httpsImage(embedded.image) || httpsImage(openGraph.image) || httpsImage(metadata.image);
  const existingPrimary = extraction.media.primaryImageUrl.value;
  const media = {
    ...extraction.media,
    primaryImageUrl: updateMissingField(extraction.media.primaryImageUrl, [
      { value: httpsImage(jsonLd.image), source: "json_ld", confidence: "HIGH", evidencePath: "jsonld.Product.image" },
      { value: httpsImage(embedded.image), source: "embedded_json", confidence: "HIGH", evidencePath: "embedded.product.images[0]" },
      { value: httpsImage(openGraph.image), source: "open_graph", confidence: "MEDIUM", evidencePath: 'meta[property="og:image"]' },
      { value: httpsImage(metadata.image), source: "html_metadata", confidence: "MEDIUM", evidencePath: 'meta[itemprop="image"]' },
    ], observedAt)!,
    additionalImageUrls: isMissing(extraction.media.additionalImageUrls)
      ? createField(
        Array.from(new Set(rawImages.map((image) => httpsImage(image.value)).filter((value): value is string => Boolean(value))))
          .filter((image) => image !== existingPrimary && image !== primaryImage),
        rawImages[0]?.source ?? "manual_fallback",
        rawImages.length ? "MEDIUM" : "MISSING",
        undefined,
        observedAt,
        rawImages[0]?.path,
      )
      : extraction.media.additionalImageUrls,
  };

  return { ...extraction, identity, content, pricing, ratings, media };
}

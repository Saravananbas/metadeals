import type {
  RetailerAdapter,
  RetailerAuthorizationInfo,
  ExtractionContext,
  NormalizedProductExtraction,
} from "../core/types";
import { createField, missingField } from "../core/confidence";
import { parseJsonLd, parseOpenGraph, parseTitleToBrand, convertRupeesToIntegerPaise, cleanDescription } from "./base";
import { cleanProductUrl } from "../security/url-validator";
import { findAllowedDomain } from "../security/domain-allowlist";

export class GenericStructuredDataAdapter implements RetailerAdapter {
  id = "generic-structured-data";
  name = "Structured Data Merchant";
  slug = "generic";
  domains: string[] = [];

  canHandle(url: URL): boolean {
    const domainInfo = findAllowedDomain(url.hostname);
    return !!domainInfo && domainInfo.adapterId === "generic-structured-data";
  }

  async checkAuthorization(): Promise<RetailerAuthorizationInfo> {
    return {
      authorized: true,
      status: "AUTHORIZED",
      reason: "Permitted public schema.org and Open Graph structured metadata.",
      supportedMethods: ["structured_metadata", "manual_fallback"],
      primaryMethod: "structured_metadata",
    };
  }

  async extract(context: ExtractionContext): Promise<NormalizedProductExtraction> {
    const domainInfo = findAllowedDomain(context.url.hostname);
    const retailerName = context.directoryMerchant?.name ?? domainInfo?.retailerName ?? "Partner Store";
    const retailerSlug = context.directoryMerchant?.domain ?? domainInfo?.retailerSlug ?? "generic";
    const canonicalUrl = cleanProductUrl(context.rawUrl);
    const observedAt = new Date().toISOString();

    const html = context.html || context.htmlFixture;
    if (html) {
      const jsonLd = parseJsonLd(html, context.url.origin);
      const og = parseOpenGraph(html, context.url.origin);

      const title = jsonLd.name || og.title || null;
      const brand = jsonLd.brand || og.brand || parseTitleToBrand(title || "");
      const brandSource = jsonLd.brand ? "json_ld" : og.brand ? "open_graph" : brand ? "url_heuristic" : "manual_fallback";
      const priceRupees = jsonLd.price || og.price;
      const mrpRupees = jsonLd.mrp || null;
      const priceMinor = convertRupeesToIntegerPaise(priceRupees);
      const mrpMinor = convertRupeesToIntegerPaise(mrpRupees);
      const rawDesc = jsonLd.description || og.description || null;
      const description = cleanDescription(rawDesc);

      return {
        identity: {
          title: createField(title, jsonLd.name ? "json_ld" : og.title ? "open_graph" : "manual_fallback", title ? (jsonLd.name ? "HIGH" : "MEDIUM") : "MISSING"),
          brand: createField(brand ?? null, brandSource, jsonLd.brand ? "HIGH" : brand ? "MEDIUM" : "MISSING"),
          manufacturer: missingField(),
          modelNumber: createField(jsonLd.mpn ?? null, "structured_metadata", jsonLd.mpn ? "HIGH" : "MISSING"),
          sku: createField(jsonLd.sku ?? null, "structured_metadata", jsonLd.sku ? "HIGH" : "MISSING"),
          asin: missingField(),
          flipkartPid: missingField(),
          cromaPid: missingField(),
          gtin: createField(jsonLd.gtin ?? null, "structured_metadata", jsonLd.gtin ? "HIGH" : "MISSING"),
          variant: missingField(),
          colour: missingField(),
          size: missingField(),
          storageRam: missingField(),
        },
        content: {
          description: createField(description, "structured_metadata", description ? "HIGH" : "MISSING"),
          keyFeatures: createField([], "manual_fallback", "MISSING"),
          specifications: createField({}, "manual_fallback", "MISSING"),
          category: createField(jsonLd.category ?? null, "structured_metadata", jsonLd.category ? "MEDIUM" : "MISSING"),
          subcategory: missingField(),
          breadcrumb: createField([], "manual_fallback", "MISSING"),
        },
        pricing: {
          mrpMinor: createField(mrpMinor, "structured_metadata", mrpMinor ? "MEDIUM" : "MISSING", undefined, observedAt),
          priceMinor: createField(priceMinor, "structured_metadata", priceMinor ? "HIGH" : "MISSING", undefined, observedAt),
          mrpRupees: createField(mrpRupees ? Number(mrpRupees.toFixed(2)) : null, "structured_metadata", mrpRupees ? "MEDIUM" : "MISSING"),
          priceRupees: createField(priceRupees ? Number(priceRupees.toFixed(2)) : null, "structured_metadata", priceRupees ? "HIGH" : "MISSING"),
          displayedDiscount: missingField(),
          couponDiscount: missingField(),
          currency: createField("INR", "structured_metadata", "HIGH"),
          observedAt,
        },
        merchant: {
          retailerName,
          retailerSlug,
          sellerName: missingField(),
          sellerId: missingField(),
          originalUrl: context.rawUrl,
          canonicalUrl,
        },
        media: {
          primaryImageUrl: createField(jsonLd.image || og.image || null, "structured_metadata", (jsonLd.image || og.image) ? "HIGH" : "MISSING"),
          additionalImageUrls: createField([], "manual_fallback", "MISSING"),
          imageSource: createField(`${retailerName} Metadata`, "structured_metadata", "HIGH"),
          dimensions: missingField(),
          importedMediaId: missingField(),
        },
        ratings: {
          rating: createField(jsonLd.ratingValue ?? null, "structured_metadata", jsonLd.ratingValue ? "HIGH" : "MISSING"),
          reviewCount: createField(jsonLd.reviewCount ?? null, "structured_metadata", jsonLd.reviewCount ? "HIGH" : "MISSING"),
          ratingSource: createField(`${retailerName} Reviews`, "structured_metadata", "HIGH"),
        },
      };
    }

    return {
      identity: {
        title: missingField("Product title was not present in an extracted source."),
        brand: missingField(),
        manufacturer: missingField(),
        modelNumber: missingField(),
        sku: missingField(),
        asin: missingField(),
        flipkartPid: missingField(),
        gtin: missingField(),
        variant: missingField(),
        colour: missingField(),
        size: missingField(),
        storageRam: missingField(),
      },
      content: {
        description: missingField(),
        keyFeatures: createField([], "manual_fallback", "MISSING"),
        specifications: createField({}, "manual_fallback", "MISSING"),
        category: missingField(),
        subcategory: missingField(),
        breadcrumb: createField([], "manual_fallback", "MISSING"),
      },
      pricing: {
        mrpMinor: missingField("Please enter MRP manually."),
        priceMinor: missingField("Please enter deal price manually."),
        mrpRupees: missingField(),
        priceRupees: missingField(),
        displayedDiscount: missingField(),
        couponDiscount: missingField(),
        currency: createField("INR", "url_heuristic", "HIGH"),
        observedAt,
      },
      merchant: {
        retailerName,
        retailerSlug,
        sellerName: missingField(),
        sellerId: missingField(),
        originalUrl: context.rawUrl,
        canonicalUrl,
      },
      media: {
        primaryImageUrl: missingField(),
        additionalImageUrls: createField([], "manual_fallback", "MISSING"),
        imageSource: missingField(),
        dimensions: missingField(),
        importedMediaId: missingField(),
      },
      ratings: {
        rating: missingField(),
        reviewCount: missingField(),
        ratingSource: missingField(),
      },
    };
  }
}

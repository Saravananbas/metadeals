import type {
  RetailerAdapter,
  RetailerAuthorizationInfo,
  ExtractionContext,
  NormalizedProductExtraction,
} from "../core/types";
import { createField, missingField } from "../core/confidence";
import {
  parseJsonLd,
  parseOpenGraph,
  parseHtmlMetadata,
  parseEmbeddedJson,
  parseTitleToBrand,
  convertRupeesToIntegerPaise,
  cleanDescription,
  parsePrice,
} from "./base";
import { cleanProductUrl } from "../security/url-validator";
import { sanitizeExtractedText } from "../security/fetch-policy";

export class CromaAdapter implements RetailerAdapter {
  id = "croma";
  name = "Croma";
  slug = "croma";
  domains = ["croma.com", "www.croma.com"];

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.domains.some((d) => host === d || host.endsWith(`.${d}`));
  }

  async checkAuthorization(): Promise<RetailerAuthorizationInfo> {
    return {
      authorized: true,
      status: "AUTHORIZED",
      supportedMethods: ["structured_metadata", "json_ld", "open_graph", "embedded_json"],
      primaryMethod: "json_ld",
    };
  }

  extractProductId(url: URL): string | undefined {
    // /p/324687 or /apple-iphone-16-128gb/p/324687
    const match = url.pathname.match(/\/p\/([0-9]+)/i);
    if (match?.[1]) {
      return match[1];
    }
    const pid = url.searchParams.get("pid") || url.searchParams.get("productId");
    if (pid && /^[0-9]+$/.test(pid)) {
      return pid;
    }
    return undefined;
  }

  async extract(context: ExtractionContext): Promise<NormalizedProductExtraction> {
    const productId = this.extractProductId(context.url);
    const canonicalUrl = productId
      ? `https://www.croma.com/p/${productId}`
      : cleanProductUrl(context.rawUrl);
    const observedAt = new Date().toISOString();
    const html = context.html || context.htmlFixture;

    if (html) {
      const jsonLd = parseJsonLd(html, context.url.origin);
      const og = parseOpenGraph(html, context.url.origin);
      const meta = parseHtmlMetadata(html, context.url.origin);
      const embedded = parseEmbeddedJson(html, context.url.origin);

      // Priority 4: Croma-specific DOM selectors
      let selectorTitle: string | undefined;
      const titleMatch = html.match(/<h1\b[^>]*class=["'][^"']*(?:pd-title|product-title)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
                         html.match(/<h1\b[^>]*data-testid=["']product-title["'][^>]*>([\s\S]*?)<\/h1>/i);
      if (titleMatch?.[1]) {
        selectorTitle = sanitizeExtractedText(titleMatch[1]).trim();
      }

      let selectorBrand: string | undefined;
      const brandMatch = html.match(/<[^>]*class=["'][^"']*(?:cp-brand|brand-name)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/i);
      if (brandMatch?.[1]) {
        selectorBrand = sanitizeExtractedText(brandMatch[1]).trim();
      }

      let selectorPrice: number | null = null;
      const priceMatch = html.match(/<span\b[^>]*class=["'][^"']*(?:amount|new-price|pdp-cp-price)[^"']*["'][^>]*>([^<]+)<\/span>/i);
      if (priceMatch?.[1]) {
        selectorPrice = parsePrice(priceMatch[1]);
      }

      let selectorMrp: number | null = null;
      const mrpMatch = html.match(/<span\b[^>]*class=["'][^"']*(?:old-price|mrp|pdp-mrp)[^"']*["'][^>]*>([^<]+)<\/span>/i);
      if (mrpMatch?.[1]) {
        selectorMrp = parsePrice(mrpMatch[1]);
      }

      let selectorImage: string | undefined;
      const imgMatch = html.match(/<img\b[^>]*class=["'][^"']*(?:pdp-main-image|product-image)[^"']*["'][^>]*src=["']([^"']*)["']/i) ||
                         html.match(/<img\b[^>]*data-testid=["']main-image["'][^>]*src=["']([^"']*)["']/i);
      if (imgMatch?.[1]) {
        selectorImage = imgMatch[1];
      }

      let selectorRating: number | null = null;
      const ratingMatch = html.match(/<span\b[^>]*class=["'][^"']*(?:rating-text|pdp-rating)[^"']*["'][^>]*>([0-9.]+)<\/span>/i);
      if (ratingMatch?.[1]) {
        const val = parseFloat(ratingMatch[1]);
        if (!isNaN(val)) selectorRating = val;
      }

      // Title resolution
      const resolvedTitle = jsonLd.name || selectorTitle || og.title || embedded.title || meta.title || (productId ? `Croma Product (${productId})` : "Croma Product");
      let titleSource: "json_ld" | "retailer_html_selector" | "open_graph" | "embedded_json" | "html_metadata" | "url_heuristic" = "json_ld";
      if (!jsonLd.name) {
        if (selectorTitle) titleSource = "retailer_html_selector";
        else if (og.title) titleSource = "open_graph";
        else if (embedded.title) titleSource = "embedded_json";
        else if (meta.title) titleSource = "html_metadata";
        else titleSource = "url_heuristic";
      }

      // Brand resolution
      const resolvedBrand = jsonLd.brand || selectorBrand || og.brand || embedded.brand || parseTitleToBrand(resolvedTitle);
      const brandSource = jsonLd.brand ? "json_ld" : selectorBrand ? "retailer_html_selector" : og.brand ? "open_graph" : "url_heuristic";

      // Description resolution
      const rawDesc = jsonLd.description || og.description || embedded.description || meta.description || null;
      const resolvedDesc = cleanDescription(rawDesc);
      const descSource = jsonLd.description ? "json_ld" : og.description ? "open_graph" : "html_metadata";

      // Price resolution
      const priceRupees = jsonLd.price ?? selectorPrice ?? og.price ?? embedded.price ?? meta.price ?? null;
      let mrpRupees = jsonLd.mrp ?? selectorMrp ?? og.mrp ?? embedded.mrp ?? meta.mrp ?? null;
      if (priceRupees && !mrpRupees) {
        mrpRupees = Number((priceRupees * 1.15).toFixed(2));
      }
      const priceMinor = convertRupeesToIntegerPaise(priceRupees);
      const mrpMinor = convertRupeesToIntegerPaise(mrpRupees);
      const priceSource = jsonLd.price ? "json_ld" : selectorPrice ? "retailer_html_selector" : og.price ? "open_graph" : "html_metadata";

      // Image resolution
      const primaryImg = jsonLd.image || selectorImage || og.image || embedded.image || meta.image || null;
      const additionalImages = [
        ...(jsonLd.additionalImages || []),
        ...(og.additionalImages || []),
        ...(embedded.additionalImages || []),
      ].filter((img, i, arr) => img !== primaryImg && arr.indexOf(img) === i);

      // Ratings resolution
      const ratingVal = jsonLd.ratingValue ?? selectorRating ?? embedded.ratingValue ?? meta.ratingValue ?? null;
      const reviewCnt = jsonLd.reviewCount ?? embedded.reviewCount ?? meta.reviewCount ?? null;

      return {
        identity: {
          title: createField(resolvedTitle, titleSource, "HIGH"),
          brand: createField(resolvedBrand ?? null, brandSource, resolvedBrand ? "HIGH" : "MISSING"),
          manufacturer: missingField(),
          modelNumber: createField(jsonLd.mpn ?? null, "json_ld", jsonLd.mpn ? "HIGH" : "MISSING"),
          sku: createField(productId ?? jsonLd.sku ?? null, "json_ld", productId ? "HIGH" : "MISSING"),
          asin: missingField(),
          flipkartPid: missingField(),
          cromaPid: createField(productId ?? null, "url_heuristic", productId ? "HIGH" : "MISSING"),
          gtin: createField(jsonLd.gtin ?? null, "json_ld", jsonLd.gtin ? "HIGH" : "MISSING"),
          variant: missingField(),
          colour: missingField(),
          size: missingField(),
          storageRam: missingField(),
          availability: createField(jsonLd.availability ?? og.availability ?? null, "json_ld", "MEDIUM"),
        },
        content: {
          description: createField(resolvedDesc, descSource, resolvedDesc ? "HIGH" : "MISSING"),
          keyFeatures: createField([], "manual_fallback", "MISSING"),
          specifications: createField({}, "manual_fallback", "MISSING"),
          category: createField(jsonLd.category ?? "Electronics", "json_ld", "MEDIUM"),
          subcategory: missingField(),
          breadcrumb: createField([], "manual_fallback", "MISSING"),
        },
        pricing: {
          mrpMinor: createField(mrpMinor, priceSource, mrpMinor ? "MEDIUM" : "MISSING", undefined, observedAt),
          priceMinor: createField(priceMinor, priceSource, priceMinor ? "HIGH" : "MISSING", undefined, observedAt),
          mrpRupees: createField(mrpRupees ? Number(mrpRupees.toFixed(2)) : null, priceSource, mrpRupees ? "MEDIUM" : "MISSING"),
          priceRupees: createField(priceRupees ? Number(priceRupees.toFixed(2)) : null, priceSource, priceRupees ? "HIGH" : "MISSING"),
          displayedDiscount: missingField(),
          couponDiscount: missingField(),
          currency: createField("INR", "html_metadata", "HIGH"),
          observedAt,
        },
        merchant: {
          retailerName: this.name,
          retailerSlug: this.slug,
          sellerName: createField(jsonLd.sellerName ?? "Croma Official", "json_ld", "HIGH"),
          sellerId: missingField(),
          originalUrl: context.rawUrl,
          canonicalUrl,
        },
        media: {
          primaryImageUrl: createField(primaryImg, primaryImg ? (jsonLd.image ? "json_ld" : "open_graph") : "manual_fallback", primaryImg ? "HIGH" : "MISSING"),
          additionalImageUrls: createField(additionalImages, "open_graph", additionalImages.length > 0 ? "HIGH" : "MISSING"),
          imageSource: createField("Croma Media", "open_graph", "HIGH"),
          dimensions: missingField(),
          importedMediaId: missingField(),
        },
        ratings: {
          rating: createField(ratingVal, "json_ld", ratingVal ? "HIGH" : "MISSING"),
          reviewCount: createField(reviewCnt, "json_ld", reviewCnt ? "HIGH" : "MISSING"),
          ratingSource: createField("Croma Customer Ratings", "json_ld", "HIGH"),
        },
      };
    }

    // Default URL-derived metadata when no HTML could be fetched
    const pathSlug = context.url.pathname.split("/")[1];
    let inferredTitle: string | null = null;
    let inferredBrand: string | null = null;

    if (pathSlug && pathSlug !== "p") {
      inferredTitle = pathSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      inferredBrand = parseTitleToBrand(inferredTitle) ?? null;
    }

    const titleValue = inferredTitle || (productId ? `Croma Item (${productId})` : "Croma Product");

    return {
      identity: {
        title: createField(titleValue, "url_heuristic", inferredTitle ? "MEDIUM" : "LOW"),
        brand: createField(inferredBrand, "url_heuristic", inferredBrand ? "MEDIUM" : "MISSING"),
        manufacturer: missingField(),
        modelNumber: missingField(),
        sku: createField(productId ?? null, "url_heuristic", productId ? "HIGH" : "MISSING"),
        asin: missingField(),
        flipkartPid: missingField(),
        cromaPid: createField(productId ?? null, "url_heuristic", productId ? "HIGH" : "MISSING"),
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
        category: createField("Electronics", "url_heuristic", "LOW"),
        subcategory: missingField(),
        breadcrumb: createField([], "manual_fallback", "MISSING"),
      },
      pricing: {
        mrpMinor: missingField(),
        priceMinor: missingField(),
        mrpRupees: missingField(),
        priceRupees: missingField(),
        displayedDiscount: missingField(),
        couponDiscount: missingField(),
        currency: createField("INR", "official_api", "HIGH"),
        observedAt,
      },
      merchant: {
        retailerName: this.name,
        retailerSlug: this.slug,
        sellerName: createField("Croma Official", "url_heuristic", "MEDIUM"),
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


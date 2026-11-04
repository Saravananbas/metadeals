import type {
  RetailerAdapter,
  RetailerAuthorizationInfo,
  ExtractionContext,
  NormalizedProductExtraction,
} from "../core/types";
import { createField, missingField, restrictedField } from "../core/confidence";
import {
  parseJsonLd,
  parseOpenGraph,
  parseHtmlMetadata,
  parseTitleToBrand,
  convertRupeesToIntegerPaise,
  cleanDescription,
  parsePrice,
} from "./base";
import { cleanProductUrl } from "../security/url-validator";
import { sanitizeExtractedText } from "../security/fetch-policy";

export class AmazonIndiaAdapter implements RetailerAdapter {
  id = "amazon-india";
  name = "Amazon India";
  slug = "amazon";
  domains = ["amazon.in", "www.amazon.in", "amzn.to", "amzn.in"];

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.domains.some((d) => host === d || host.endsWith(`.${d}`));
  }

  async checkAuthorization(): Promise<RetailerAuthorizationInfo> {
    const hasPaApi = !!(
      process.env.AMAZON_PAAPI_KEY &&
      process.env.AMAZON_PAAPI_SECRET &&
      process.env.AMAZON_ASSOCIATE_TAG
    );

    if (hasPaApi) {
      return {
        authorized: true,
        status: "AUTHORIZED",
        supportedMethods: ["official_api", "authorized_affiliate_feed"],
        primaryMethod: "official_api",
      };
    }

    return {
      authorized: false,
      status: "AUTHORIZATION_REQUIRED",
      reason:
        "Amazon India Conditions of Use and robots policy prohibit automated page scraping. Access via Amazon Product Advertising API (PA-API v5) or authorized data feed is required for live price extraction.",
      supportedMethods: ["official_api", "authorized_affiliate_feed", "manual_fallback"],
      primaryMethod: "manual_fallback",
    };
  }

  extractAsin(url: URL): string | undefined {
    const path = url.pathname;
    const match = path.match(/\/(?:dp|gp\/product|product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
    const asinParam = url.searchParams.get("asin") || url.searchParams.get("ASIN");
    if (asinParam && /^[A-Z0-9]{10}$/i.test(asinParam)) {
      return asinParam.toUpperCase();
    }
    return undefined;
  }

  async extract(context: ExtractionContext): Promise<NormalizedProductExtraction> {
    const asin = this.extractAsin(context.url);
    const canonicalUrl = asin ? `https://www.amazon.in/dp/${asin}` : cleanProductUrl(context.rawUrl);
    const observedAt = new Date().toISOString();
    const html = context.html || context.htmlFixture;

    // Layered HTML Extraction when HTML is present
    if (html) {
      const jsonLd = parseJsonLd(html, context.url.origin);
      const og = parseOpenGraph(html, context.url.origin);
      const meta = parseHtmlMetadata(html, context.url.origin);

      // Priority 4: Amazon-specific HTML Selectors
      let selectorTitle: string | undefined;
      const titleMatch = html.match(/<span\s+[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i);
      if (titleMatch?.[1]) {
        selectorTitle = sanitizeExtractedText(titleMatch[1]).trim();
      }

      let selectorBrand: string | undefined;
      const brandMatch = html.match(/<a\s+[^>]*id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
      if (brandMatch?.[1]) {
        selectorBrand = sanitizeExtractedText(brandMatch[1]).replace(/^(?:visit\s+the|brand:?)\s*/i, "").trim();
      }

      let selectorPrice: number | null = null;
      const priceOffscreenMatch = html.match(/<span\s+class=["'][^"']*a-price[^"']*["'][^>]*>\s*<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i);
      if (priceOffscreenMatch?.[1]) {
        selectorPrice = parsePrice(priceOffscreenMatch[1]);
      }

      let selectorMrp: number | null = null;
      const mrpMatch = html.match(/<span\s+class=["'][^"']*a-text-price[^"']*["'][^>]*>\s*<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i);
      if (mrpMatch?.[1]) {
        selectorMrp = parsePrice(mrpMatch[1]);
      }

      let selectorImage: string | undefined;
      const imgMatch = html.match(/<img\s+[^>]*id=["']landingImage["'][^>]*data-old-hires=["']([^"']*)["']/i) ||
                         html.match(/<img\s+[^>]*id=["']landingImage["'][^>]*src=["']([^"']*)["']/i);
      if (imgMatch?.[1]) {
        selectorImage = imgMatch[1];
      }

      let selectorRating: number | null = null;
      const ratingMatch = html.match(/<span\s+class=["']a-icon-alt["']>([0-9.]+)\s+out of 5/i);
      if (ratingMatch?.[1]) {
        const val = parseFloat(ratingMatch[1]);
        if (!isNaN(val)) selectorRating = val;
      }

      let selectorReviews: number | null = null;
      const reviewsMatch = html.match(/<span\s+id=["']acrCustomerReviewText["'][^>]*>([0-9,]+)\s+ratings?/i);
      if (reviewsMatch?.[1]) {
        selectorReviews = parseInt(reviewsMatch[1].replace(/,/g, ""), 10);
      }

      // Title resolution (Priority: JSON-LD > Selectors > OpenGraph > HTML title > URL)
      let resolvedTitle = jsonLd.name || selectorTitle || og.title || meta.title || null;
      let titleSource: "json_ld" | "retailer_html_selector" | "open_graph" | "html_metadata" | "url_heuristic" = "json_ld";
      if (!jsonLd.name) {
        if (selectorTitle) titleSource = "retailer_html_selector";
        else if (og.title) titleSource = "open_graph";
        else if (meta.title) titleSource = "html_metadata";
        else titleSource = "url_heuristic";
      }

      if (!resolvedTitle && asin) {
        resolvedTitle = `Amazon Product (${asin})`;
        titleSource = "url_heuristic";
      }

      // Brand resolution
      const resolvedBrand = jsonLd.brand || selectorBrand || og.brand || (resolvedTitle ? parseTitleToBrand(resolvedTitle) : null);
      let brandSource: "json_ld" | "retailer_html_selector" | "open_graph" | "html_metadata" | "url_heuristic" = "json_ld";
      if (!jsonLd.brand) {
        if (selectorBrand) brandSource = "retailer_html_selector";
        else if (og.brand) brandSource = "open_graph";
        else brandSource = "url_heuristic";
      }

      // Description resolution (Strictly no generic placeholder text!)
      const rawDesc = jsonLd.description || og.description || meta.description || null;
      const resolvedDesc = cleanDescription(rawDesc);
      const descSource = jsonLd.description ? "json_ld" : og.description ? "open_graph" : "html_metadata";

      // Pricing resolution
      const priceRupees = jsonLd.price ?? selectorPrice ?? og.price ?? meta.price ?? null;
      let mrpRupees = jsonLd.mrp ?? selectorMrp ?? og.mrp ?? meta.mrp ?? null;
      if (priceRupees && !mrpRupees) {
        mrpRupees = Number((priceRupees * 1.2).toFixed(2));
      }
      const priceMinor = convertRupeesToIntegerPaise(priceRupees);
      const mrpMinor = convertRupeesToIntegerPaise(mrpRupees);
      const priceSource = jsonLd.price ? "json_ld" : selectorPrice ? "retailer_html_selector" : og.price ? "open_graph" : "html_metadata";

      // Image resolution
      const primaryImg = jsonLd.image || selectorImage || og.image || meta.image || null;
      const additionalImages = [
        ...(jsonLd.additionalImages || []),
        ...(og.additionalImages || []),
      ].filter((img, i, arr) => img !== primaryImg && arr.indexOf(img) === i);

      // Ratings resolution
      const ratingVal = jsonLd.ratingValue ?? selectorRating ?? meta.ratingValue ?? null;
      const reviewCnt = jsonLd.reviewCount ?? selectorReviews ?? meta.reviewCount ?? null;

      return {
        identity: {
          title: createField(resolvedTitle, titleSource, resolvedTitle ? "HIGH" : "MISSING"),
          brand: createField(resolvedBrand ?? null, brandSource, resolvedBrand ? "HIGH" : "MISSING"),
          manufacturer: missingField(),
          modelNumber: createField(jsonLd.mpn ?? null, "json_ld", jsonLd.mpn ? "HIGH" : "MISSING"),
          sku: createField(jsonLd.sku ?? asin ?? null, "json_ld", asin ? "HIGH" : "MISSING"),
          asin: createField(asin ?? null, "url_heuristic", asin ? "HIGH" : "MISSING"),
          flipkartPid: missingField(),
          cromaPid: missingField(),
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
          category: createField(jsonLd.category ?? null, "json_ld", jsonLd.category ? "MEDIUM" : "MISSING"),
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
          sellerName: createField(jsonLd.sellerName ?? null, "json_ld", jsonLd.sellerName ? "HIGH" : "MISSING"),
          sellerId: missingField(),
          originalUrl: context.rawUrl,
          canonicalUrl,
        },
        media: {
          primaryImageUrl: createField(primaryImg, primaryImg ? (jsonLd.image ? "json_ld" : "open_graph") : "manual_fallback", primaryImg ? "HIGH" : "MISSING"),
          additionalImageUrls: createField(additionalImages, "open_graph", additionalImages.length > 0 ? "HIGH" : "MISSING"),
          imageSource: createField("Amazon Structured Media", "open_graph", "HIGH"),
          dimensions: missingField(),
          importedMediaId: missingField(),
        },
        ratings: {
          rating: createField(ratingVal, "json_ld", ratingVal ? "HIGH" : "MISSING"),
          reviewCount: createField(reviewCnt, "json_ld", reviewCnt ? "HIGH" : "MISSING"),
          ratingSource: createField("Amazon India Customer Reviews", "json_ld", "HIGH"),
        },
      };
    }

    // Default URL-derived metadata when no HTML could be fetched
    const pathSlug = context.url.pathname.split("/")[1];
    let inferredTitle: string | null = null;
    let inferredBrand: string | null = null;

    if (pathSlug && !["gp", "dp", "product"].includes(pathSlug.toLowerCase())) {
      inferredTitle = pathSlug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      inferredBrand = parseTitleToBrand(inferredTitle) ?? null;
    }

    const titleValue = inferredTitle || (asin ? `Amazon Item (${asin})` : "Amazon Product");

    return {
      identity: {
        title: createField(titleValue, "url_heuristic", inferredTitle ? "MEDIUM" : "LOW"),
        brand: createField(inferredBrand, "url_heuristic", inferredBrand ? "MEDIUM" : "MISSING"),
        manufacturer: missingField(),
        modelNumber: missingField(),
        sku: createField(asin ?? null, "url_heuristic", asin ? "HIGH" : "MISSING"),
        asin: createField(asin ?? null, "url_heuristic", asin ? "HIGH" : "MISSING"),
        flipkartPid: missingField(),
        cromaPid: missingField(),
        gtin: missingField(),
        variant: missingField(),
        colour: missingField(),
        size: missingField(),
        storageRam: missingField(),
      },
      content: {
        // Section 9: Never populate generic placeholder descriptions!
        description: missingField(),
        keyFeatures: createField([], "manual_fallback", "MISSING"),
        specifications: createField({}, "manual_fallback", "MISSING"),
        category: missingField(),
        subcategory: missingField(),
        breadcrumb: createField([], "manual_fallback", "MISSING"),
      },
      pricing: {
        mrpMinor: restrictedField("Amazon page scraping is restricted. Please enter MRP manually or configure PA-API."),
        priceMinor: restrictedField("Amazon page scraping is restricted. Please enter deal price manually or configure PA-API."),
        mrpRupees: restrictedField(),
        priceRupees: restrictedField(),
        displayedDiscount: missingField(),
        couponDiscount: missingField(),
        currency: createField("INR", "official_api", "HIGH"),
        observedAt,
      },
      merchant: {
        retailerName: this.name,
        retailerSlug: this.slug,
        sellerName: missingField(),
        sellerId: missingField(),
        originalUrl: context.rawUrl,
        canonicalUrl,
      },
      media: {
        primaryImageUrl: missingField("Image not available via URL extraction. Please upload deal image manually."),
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

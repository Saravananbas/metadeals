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
      if (!selectorTitle) {
        const metaTitleMatch = html.match(/<meta\s+name=["']title["']\s+content=["']([^"']*)["']/i) ||
                               html.match(/<title>([\s\S]*?)<\/title>/i);
        if (metaTitleMatch?.[1]) {
          selectorTitle = sanitizeExtractedText(metaTitleMatch[1])
            .replace(/\s*:\s*Amazon\.in(?::.*)?$/i, "")
            .trim();
        }
      }

      let selectorBrand: string | undefined;
      const brandMatch = html.match(/<a\s+[^>]*id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
      if (brandMatch?.[1]) {
        selectorBrand = sanitizeExtractedText(brandMatch[1])
          .replace(/^(?:visit\s+the|brand:?)\s*/i, "")
          .replace(/\s+store$/i, "")
          .trim();
      }
      if (!selectorBrand) {
        const trBrandMatch = html.match(/<tr[^>]*class=["'][^"']*po-brand[^"']*["'][^>]*>[\s\S]*?<td[^>]*class=["'][^"']*a-span9[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
        if (trBrandMatch?.[1]) {
          selectorBrand = sanitizeExtractedText(trBrandMatch[1]).trim();
        }
      }

      let selectorPrice: number | null = null;
      // 1. Customer visible price hidden input (most accurate)
      const custPriceMatch = html.match(/name=["'](?:items\[0\.base\]\[customerVisiblePrice\]\[amount\]|customerVisiblePrice)\]?["']\s*value=["']([\d.]+)["']/i) ||
                             html.match(/customerVisiblePrice\]\[amount\]["']\s*value=["']([\d.]+)["']/i);
      if (custPriceMatch?.[1]) {
        const parsed = parseFloat(custPriceMatch[1]);
        if (!isNaN(parsed) && parsed > 0) selectorPrice = parsed;
      }

      // 2. data-pricetopay-label or aok-offscreen with price
      if (!selectorPrice) {
        const pToPayMatch = html.match(/data-pricetopay-label=["']\{priceToPay\}["'][^>]*>[\s\S]*?₹?\s*([0-9,.]+)/i);
        if (pToPayMatch?.[1]) {
          selectorPrice = parsePrice(pToPayMatch[1]);
        }
      }

      // 3. priceToPay span with a-offscreen
      if (!selectorPrice) {
        const priceOffscreenMatch = html.match(/<span\s+class=["'][^"']*priceToPay[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i) ||
                                    html.match(/<span\s+class=["'][^"']*apexPriceToPay[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i);
        if (priceOffscreenMatch?.[1]) {
          selectorPrice = parsePrice(priceOffscreenMatch[1]);
        }
      }

      // 4. corePriceDisplay desktop whole
      if (!selectorPrice) {
        const coreMatch = html.match(/id=["']corePriceDisplay_desktop_feature_div["'][\s\S]*?<span\s+class=["']a-price-whole["']>([0-9,]+)/i);
        if (coreMatch?.[1]) {
          selectorPrice = parsePrice(coreMatch[1]);
        }
      }

      let selectorMrp: number | null = null;
      // 1. basisPrice
      const basisMatch = html.match(/<span\s+class=["'][^"']*basisPrice[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i);
      if (basisMatch?.[1]) {
        selectorMrp = parsePrice(basisMatch[1]);
      }

      // 2. a-text-price
      if (!selectorMrp) {
        const mrpMatch = html.match(/<span\s+class=["'][^"']*a-text-price[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-offscreen["']>([^<]+)<\/span>/i);
        if (mrpMatch?.[1]) {
          selectorMrp = parsePrice(mrpMatch[1]);
        }
      }

      // 3. listPrice
      if (!selectorMrp) {
        const listPriceMatch = html.match(/<span\s+id=["']listPrice["'][^>]*>([^<]+)<\/span>/i);
        if (listPriceMatch?.[1]) {
          selectorMrp = parsePrice(listPriceMatch[1]);
        }
      }

      let selectorImage: string | undefined;
      const additionalImages: string[] = [];

      // Extract landing image
      const landingImgMatch = html.match(/<img\b[^>]*\bid=["']landingImage["'][^>]*>/i) ||
                              html.match(/<img\b[^>]*\bid=["']imgBlkFront["'][^>]*>/i);
      if (landingImgMatch?.[0]) {
        const tag = landingImgMatch[0];
        const hiResMatch = tag.match(/data-old-hires=["']([^"']+)["']/i);
        const srcMatch = tag.match(/src=["']([^"']+)["']/i);
        const dynImgMatch = tag.match(/data-a-dynamic-image=["']([^"']+)["']/i);

        if (hiResMatch?.[1] && hiResMatch[1].startsWith("http")) {
          selectorImage = hiResMatch[1];
        }

        if (dynImgMatch?.[1]) {
          try {
            const rawJson = dynImgMatch[1].replace(/&quot;/g, '"');
            const parsed = JSON.parse(rawJson);
            const urls = Object.keys(parsed);
            if (urls.length > 0) {
              let bestUrl = urls[0];
              let maxArea = 0;
              for (const [u, dims] of Object.entries(parsed)) {
                if (Array.isArray(dims) && dims.length >= 2) {
                  const area = (dims[0] || 0) * (dims[1] || 0);
                  if (area > maxArea) {
                    maxArea = area;
                    bestUrl = u;
                  }
                }
                if (!additionalImages.includes(u)) {
                  additionalImages.push(u);
                }
              }
              if (!selectorImage && bestUrl) {
                selectorImage = bestUrl;
              }
            }
          } catch {
            // Ignore dynamic JSON parse failure
          }
        }

        if (!selectorImage && srcMatch?.[1] && srcMatch[1].startsWith("http")) {
          selectorImage = srcMatch[1];
        }
      }

      // Extract gallery images from colorImages script
      const colorImagesMatch = html.match(/'colorImages':\s*\{\s*'initial':\s*(\[[^\]]+\])/i);
      if (colorImagesMatch?.[1]) {
        try {
          const arr = JSON.parse(colorImagesMatch[1]);
          if (Array.isArray(arr)) {
            for (const item of arr) {
              const u = item.hiRes || item.large;
              if (u && typeof u === "string" && u.startsWith("http") && !additionalImages.includes(u)) {
                additionalImages.push(u);
              }
            }
          }
        } catch {
          // Ignore parse failure
        }
      }

      let selectorRating: number | null = null;
      const ratingMatch = html.match(/<span\s+class=["']a-icon-alt["']>([0-9.]+)\s+out of 5/i) ||
                          html.match(/<i\s+class=["'][^"']*a-icon-star[^"']*["'][^>]*>[\s\S]*?<span\s+class=["']a-icon-alt["']>([0-9.]+)/i);
      if (ratingMatch?.[1]) {
        const val = parseFloat(ratingMatch[1]);
        if (!isNaN(val)) selectorRating = val;
      }

      let selectorReviews: number | null = null;
      const reviewsMatch = html.match(/id=["']acrCustomerReviewText["'][^>]*>([\s\S]*?)<\/span>/i) ||
                           html.match(/aria-label=["']([0-9,]+)\s+Reviews?["']/i) ||
                           html.match(/id=["']acrCustomerReviewLink["'][^>]*>[\s\S]*?([0-9,]+)\s*(?:ratings?|reviews?)/i);
      if (reviewsMatch?.[1]) {
        const cleanDigits = reviewsMatch[1].replace(/[(),\s]/g, "");
        const parsed = parseInt(cleanDigits, 10);
        if (!isNaN(parsed) && parsed > 0) selectorReviews = parsed;
      }

      // Breadcrumbs
      const breadcrumbs: string[] = [];
      const bcMatch = html.match(/id=["']wayfinding-breadcrumbs_feature_div["'][^>]*>([\s\S]*?)<\/div>/i);
      if (bcMatch?.[1]) {
        const bcLinks = [...bcMatch[1].matchAll(/<a\s+[^>]*class=["'][^"']*a-color-tertiary[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
        for (const m of bcLinks) {
          const cleaned = sanitizeExtractedText(m[1]).trim();
          if (cleaned && !breadcrumbs.includes(cleaned)) {
            breadcrumbs.push(cleaned);
          }
        }
      }

      // Feature bullets
      const keyFeatures: string[] = [];
      const bulletsMatch = html.match(/id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i);
      if (bulletsMatch?.[1]) {
        const bulletItems = [...bulletsMatch[1].matchAll(/<span\s+class=["']a-list-item["']>([\s\S]*?)<\/span>/gi)];
        for (const m of bulletItems) {
          const cleaned = sanitizeExtractedText(m[1]).trim();
          if (cleaned.length > 5 && !keyFeatures.includes(cleaned)) {
            keyFeatures.push(cleaned);
          }
        }
      }

      // Title resolution (Priority: Selectors > JSON-LD > OpenGraph > HTML title > URL)
      let resolvedTitle = selectorTitle || jsonLd.name || og.title || meta.title || null;
      let titleSource: "json_ld" | "retailer_html_selector" | "open_graph" | "html_metadata" | "url_heuristic" = "retailer_html_selector";
      if (!selectorTitle) {
        if (jsonLd.name) titleSource = "json_ld";
        else if (og.title) titleSource = "open_graph";
        else if (meta.title) titleSource = "html_metadata";
        else titleSource = "url_heuristic";
      }

      if (!resolvedTitle && asin) {
        resolvedTitle = `Amazon Product (${asin})`;
        titleSource = "url_heuristic";
      }

      // Brand resolution
      const resolvedBrand = selectorBrand || jsonLd.brand || og.brand || (resolvedTitle ? parseTitleToBrand(resolvedTitle) : null);
      let brandSource: "json_ld" | "retailer_html_selector" | "open_graph" | "html_metadata" | "url_heuristic" = "retailer_html_selector";
      if (!selectorBrand) {
        if (jsonLd.brand) brandSource = "json_ld";
        else if (og.brand) brandSource = "open_graph";
        else brandSource = "url_heuristic";
      }

      // Description resolution
      let rawDesc = jsonLd.description || og.description || meta.description || null;
      if (keyFeatures.length > 0 && (!rawDesc || (resolvedTitle && resolvedTitle.startsWith(rawDesc.slice(0, 30))))) {
        rawDesc = keyFeatures.join(". ");
      }
      const resolvedDesc = cleanDescription(rawDesc);
      const descSource = jsonLd.description ? "json_ld" : og.description ? "open_graph" : keyFeatures.length > 0 ? "retailer_html_selector" : "html_metadata";

      // Pricing resolution
      const priceRupees = selectorPrice ?? jsonLd.price ?? og.price ?? meta.price ?? null;
      // Never infer MRP from the selling price; only retain a value observed
      // in an explicit retailer/structured-data field.
      const mrpRupees = selectorMrp ?? jsonLd.mrp ?? og.mrp ?? meta.mrp ?? null;
      const priceMinor = convertRupeesToIntegerPaise(priceRupees);
      const mrpMinor = convertRupeesToIntegerPaise(mrpRupees);
      const priceSource = selectorPrice ? "retailer_html_selector" : jsonLd.price ? "json_ld" : og.price ? "open_graph" : "html_metadata";

      // Image resolution
      const primaryImg = selectorImage || jsonLd.image || og.image || meta.image || null;
      const allAdditionalImages = [
        ...additionalImages,
        ...(jsonLd.additionalImages || []),
        ...(og.additionalImages || []),
      ].filter((img, i, arr) => img !== primaryImg && arr.indexOf(img) === i);

      // Ratings resolution
      const ratingVal = selectorRating ?? jsonLd.ratingValue ?? meta.ratingValue ?? null;
      const reviewCnt = selectorReviews ?? jsonLd.reviewCount ?? meta.reviewCount ?? null;

      // Category derivation
      const categoryVal = (breadcrumbs.length > 0 ? (breadcrumbs[breadcrumbs.length - 1] || breadcrumbs[0]) : null) || jsonLd.category || null;

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
          keyFeatures: createField(keyFeatures, keyFeatures.length > 0 ? "retailer_html_selector" : "manual_fallback", keyFeatures.length > 0 ? "HIGH" : "MISSING"),
          specifications: createField({}, "manual_fallback", "MISSING"),
          category: createField(categoryVal, categoryVal ? (breadcrumbs.length > 0 ? "retailer_html_selector" : "json_ld") : "manual_fallback", categoryVal ? "MEDIUM" : "MISSING"),
          subcategory: missingField(),
          breadcrumb: createField(breadcrumbs, breadcrumbs.length > 0 ? "retailer_html_selector" : "manual_fallback", breadcrumbs.length > 0 ? "HIGH" : "MISSING"),
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
          primaryImageUrl: createField(primaryImg, primaryImg ? (selectorImage ? "retailer_html_selector" : jsonLd.image ? "json_ld" : "open_graph") : "manual_fallback", primaryImg ? "HIGH" : "MISSING"),
          additionalImageUrls: createField(allAdditionalImages, allAdditionalImages.length > 0 ? "retailer_html_selector" : "open_graph", allAdditionalImages.length > 0 ? "HIGH" : "MISSING"),
          imageSource: createField("Amazon Structured Media", "retailer_html_selector", "HIGH"),
          dimensions: missingField(),
          importedMediaId: missingField(),
        },
        ratings: {
          rating: createField(ratingVal, selectorRating ? "retailer_html_selector" : "json_ld", ratingVal ? "HIGH" : "MISSING"),
          reviewCount: createField(reviewCnt, selectorReviews ? "retailer_html_selector" : "json_ld", reviewCnt ? "HIGH" : "MISSING"),
          ratingSource: createField("Amazon India Customer Reviews", "retailer_html_selector", "HIGH"),
        },
      };
    }

    // Default URL-derived metadata when no HTML could be fetched
    // The service may canonicalize Amazon links to /dp/{ASIN}; keep identity
    // extraction based on the original product URL slug when one was supplied.
    let sourcePath = context.url.pathname;
    try {
      sourcePath = new URL(context.rawUrl).pathname;
    } catch {
      // Fall back to the validated URL path when rawUrl is unavailable.
    }
    const pathSegments = sourcePath.split("/").filter(Boolean);
    const dpSegment = pathSegments.findIndex((segment) => /^(?:dp|product)$/i.test(segment));
    const pathSlug = dpSegment > 0
      ? pathSegments[dpSegment - 1]
      : pathSegments[0];
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

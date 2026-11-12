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
  parseEmbeddedJson,
  parseTitleToBrand,
  convertRupeesToIntegerPaise,
  cleanDescription,
  parsePrice,
} from "./base";
import { cleanProductUrl } from "../security/url-validator";
import { sanitizeExtractedText } from "../security/fetch-policy";

export class FlipkartAdapter implements RetailerAdapter {
  id = "flipkart";
  name = "Flipkart";
  slug = "flipkart";
  domains = ["flipkart.com", "www.flipkart.com", "dl.flipkart.com", "fkrt.it"];

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.domains.some((d) => host === d || host.endsWith(`.${d}`));
  }

  async checkAuthorization(): Promise<RetailerAuthorizationInfo> {
    const hasAffiliate = !!(
      process.env.FLIPKART_AFFILIATE_ID && process.env.FLIPKART_AFFILIATE_TOKEN
    );

    if (hasAffiliate) {
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
        "Flipkart uses client-side rendering and bot protection for dynamic DOM elements. Product identity is extracted from URL parameters; live prices should be confirmed or integrated via Flipkart Affiliate API.",
      supportedMethods: ["authorized_affiliate_feed", "structured_metadata", "manual_fallback"],
      primaryMethod: "structured_metadata",
    };
  }

  extractPid(url: URL): string | undefined {
    const pid = url.searchParams.get("pid") || url.searchParams.get("PID");
    if (pid && /^[A-Z0-9]{16}$/i.test(pid)) {
      return pid.toUpperCase();
    }
    const match = url.pathname.match(/\/p\/itm([a-z0-9]+)/i);
    if (match?.[1]) {
      return `ITM${match[1].toUpperCase()}`;
    }
    return undefined;
  }

  extractProductInfoFromPath(path: string): {
    title: string;
    brand?: string;
    colour?: string;
    storage?: string;
  } {
    const parts = path.split("/").filter(Boolean);
    const slug = parts[0] || "";

    if (!slug || slug === "p") {
      return { title: "Flipkart Product" };
    }

    const words = slug.split("-");
    const formatted = words.map((w) => {
      if (/^\d+gb$/i.test(w)) return w.toUpperCase();
      if (/^5g$/i.test(w) || /^4g$/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const fullTitle = formatted.join(" ");
    const brand = parseTitleToBrand(fullTitle);

    let storage: string | undefined;
    const storageMatch = slug.match(/(\d+)\s*-?\s*(gb|tb)/i);
    if (storageMatch) storage = `${storageMatch[1]} ${storageMatch[2].toUpperCase()}`;

    let colour: string | undefined;
    const knownColours = ["black", "jetblack", "white", "blue", "green", "gold", "silver", "grey", "gray", "red", "purple"];
    for (const c of knownColours) {
      if (words.some((w) => w.toLowerCase() === c)) {
        colour = c.charAt(0).toUpperCase() + c.slice(1);
        break;
      }
    }

    return { title: fullTitle, brand, colour, storage };
  }

  async extract(context: ExtractionContext): Promise<NormalizedProductExtraction> {
    const pid = this.extractPid(context.url);
    let canonicalUrl: string;
    if (context.url.pathname && context.url.pathname !== "/" && context.url.pathname !== "/p/p") {
      canonicalUrl = `https://www.flipkart.com${context.url.pathname}${pid ? `?pid=${pid}` : ""}`;
    } else if (pid) {
      canonicalUrl = `https://www.flipkart.com/product/p/itme?pid=${pid}`;
    } else {
      canonicalUrl = cleanProductUrl(context.rawUrl);
    }
    const observedAt = new Date().toISOString();
    const urlInfo = this.extractProductInfoFromPath(context.url.pathname);
    const html = context.html || context.htmlFixture;

    // Layered HTML Extraction when HTML is present
    if (html) {
      const jsonLd = parseJsonLd(html, context.url.origin);
      const og = parseOpenGraph(html, context.url.origin);
      const meta = parseHtmlMetadata(html, context.url.origin);
      const embedded = parseEmbeddedJson(html, context.url.origin);

      // Priority 4: Flipkart-specific HTML Selectors
      let selectorTitle: string | undefined;
      const titleMatch = html.match(/<(?:h1|span)\s+class=["'][^"']*(?:_6EBuvT|B_NuCI|_35KyD6)[^"']*["'][^>]*>([\s\S]*?)<\/(?:h1|span)>/i);
      if (titleMatch?.[1]) {
        selectorTitle = sanitizeExtractedText(titleMatch[1]).trim();
      }

      let selectorPrice: number | null = null;
      const priceMatch = html.match(/<div\s+class=["'][^"']*_30jeq3[^"']*["'][^>]*>([^<]+)<\/div>/i);
      if (priceMatch?.[1]) {
        selectorPrice = parsePrice(priceMatch[1]);
      }

      let selectorMrp: number | null = null;
      const mrpMatch = html.match(/<div\s+class=["'][^"']*_3I9_wc[^"']*["'][^>]*>([^<]+)<\/div>/i);
      if (mrpMatch?.[1]) {
        selectorMrp = parsePrice(mrpMatch[1]);
      }

      let selectorImage: string | undefined;
      const imgMatch = html.match(/<img\s+[^>]*class=["'][^"']*(?:_396cs4|_2r_T1I|q6DClP)[^"']*["'][^>]*src=["']([^"']*)["']/i);
      if (imgMatch?.[1]) {
        selectorImage = imgMatch[1];
      }

      let selectorRating: number | null = null;
      const ratingMatch = html.match(/<div\s+class=["'][^"']*_3LWZlK[^"']*["'][^>]*>([0-9.]+)<\/div>/i);
      if (ratingMatch?.[1]) {
        const val = parseFloat(ratingMatch[1]);
        if (!isNaN(val)) selectorRating = val;
      }

      let selectorReviews: number | null = null;
      const reviewsMatch = html.match(/<span\s+class=["'][^"']*_2_R_DZ[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      if (reviewsMatch?.[1]) {
        const numMatch = reviewsMatch[1].match(/([0-9,]+)\s+reviews?/i);
        if (numMatch?.[1]) selectorReviews = parseInt(numMatch[1].replace(/,/g, ""), 10);
      }

      // Title resolution
      const resolvedTitle = jsonLd.name || selectorTitle || og.title || embedded.title || meta.title || urlInfo.title;
      let titleSource: "json_ld" | "retailer_html_selector" | "open_graph" | "embedded_json" | "html_metadata" | "url_heuristic" = "json_ld";
      if (!jsonLd.name) {
        if (selectorTitle) titleSource = "retailer_html_selector";
        else if (og.title) titleSource = "open_graph";
        else if (embedded.title) titleSource = "embedded_json";
        else if (meta.title) titleSource = "html_metadata";
        else titleSource = "url_heuristic";
      }

      // Brand resolution
      const resolvedBrand = jsonLd.brand || og.brand || embedded.brand || urlInfo.brand || parseTitleToBrand(resolvedTitle);
      const brandSource = jsonLd.brand ? "json_ld" : og.brand ? "open_graph" : embedded.brand ? "embedded_json" : "url_heuristic";

      // Description resolution (Strictly no generic placeholder text!)
      const rawDesc = jsonLd.description || og.description || embedded.description || meta.description || null;
      const resolvedDesc = cleanDescription(rawDesc);
      const descSource = jsonLd.description ? "json_ld" : og.description ? "open_graph" : "html_metadata";

      // Pricing resolution
      const priceRupees = jsonLd.price ?? selectorPrice ?? og.price ?? embedded.price ?? meta.price ?? null;
      // Do not synthesize MRP from the offer price. Missing list price stays
      // missing so discount figures cannot be fabricated.
      const mrpRupees = jsonLd.mrp ?? selectorMrp ?? og.mrp ?? embedded.mrp ?? meta.mrp ?? null;
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
      const reviewCnt = jsonLd.reviewCount ?? selectorReviews ?? embedded.reviewCount ?? meta.reviewCount ?? null;

      return {
        identity: {
          title: createField(resolvedTitle, titleSource, "HIGH"),
          brand: createField(resolvedBrand ?? null, brandSource, resolvedBrand ? "HIGH" : "MISSING"),
          manufacturer: missingField(),
          modelNumber: createField(jsonLd.mpn ?? null, "json_ld", jsonLd.mpn ? "HIGH" : "MISSING"),
          sku: createField(pid ?? jsonLd.sku ?? null, "json_ld", pid ? "HIGH" : "MISSING"),
          asin: missingField(),
          flipkartPid: createField(pid ?? null, "url_heuristic", pid ? "HIGH" : "MISSING"),
          cromaPid: missingField(),
          gtin: createField(jsonLd.gtin ?? null, "json_ld", jsonLd.gtin ? "HIGH" : "MISSING"),
          variant: createField(urlInfo.storage ?? null, "url_heuristic", urlInfo.storage ? "MEDIUM" : "MISSING"),
          colour: createField(urlInfo.colour ?? null, "url_heuristic", urlInfo.colour ? "MEDIUM" : "MISSING"),
          size: missingField(),
          storageRam: createField(urlInfo.storage ?? null, "url_heuristic", urlInfo.storage ? "MEDIUM" : "MISSING"),
          availability: createField(jsonLd.availability ?? og.availability ?? null, "json_ld", "MEDIUM"),
        },
        content: {
          description: createField(resolvedDesc, descSource, resolvedDesc ? "HIGH" : "MISSING"),
          keyFeatures: createField([], "manual_fallback", "MISSING"),
          specifications: createField({}, "manual_fallback", "MISSING"),
          category: jsonLd.category
            ? createField(jsonLd.category, "json_ld", "MEDIUM")
            : missingField(),
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
          imageSource: createField("Flipkart Media Catalog", "open_graph", "HIGH"),
          dimensions: missingField(),
          importedMediaId: missingField(),
        },
        ratings: {
          rating: createField(ratingVal, "json_ld", ratingVal ? "HIGH" : "MISSING"),
          reviewCount: createField(reviewCnt, "json_ld", reviewCnt ? "HIGH" : "MISSING"),
          ratingSource: createField("Flipkart Customer Reviews", "json_ld", "HIGH"),
        },
      };
    }

    // Default URL-derived metadata when no HTML could be fetched
    return {
      identity: {
        title: createField(urlInfo.title, "url_heuristic", "MEDIUM"),
        brand: createField(urlInfo.brand ?? null, "url_heuristic", urlInfo.brand ? "MEDIUM" : "MISSING"),
        manufacturer: missingField(),
        modelNumber: missingField(),
        sku: createField(pid ?? null, "url_heuristic", pid ? "HIGH" : "MISSING"),
        asin: missingField(),
        flipkartPid: createField(pid ?? null, "url_heuristic", pid ? "HIGH" : "MISSING"),
        cromaPid: missingField(),
        gtin: missingField(),
        variant: createField(urlInfo.storage ?? null, "url_heuristic", urlInfo.storage ? "MEDIUM" : "MISSING"),
        colour: createField(urlInfo.colour ?? null, "url_heuristic", urlInfo.colour ? "MEDIUM" : "MISSING"),
        size: missingField(),
        storageRam: createField(urlInfo.storage ?? null, "url_heuristic", urlInfo.storage ? "MEDIUM" : "MISSING"),
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
        mrpMinor: restrictedField("Flipkart dynamic pricing requires manual verification or authorized Affiliate API."),
        priceMinor: restrictedField("Flipkart dynamic pricing requires manual verification or authorized Affiliate API."),
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
        primaryImageUrl: missingField("Product image requires manual upload or API extraction."),
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

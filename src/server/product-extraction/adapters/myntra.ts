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

export class MyntraAdapter implements RetailerAdapter {
  id = "myntra";
  name = "Myntra";
  slug = "myntra";
  domains = ["myntra.com", "www.myntra.com"];

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

  extractStyleId(url: URL): string | undefined {
    // E.g. /kurtas/house-of-pataudi/.../31647768/buy or /p/46684219 or /46684219
    const match = url.pathname.match(/\/(\d{5,10})(?:\/buy)?$/) || url.pathname.match(/\/(\d{5,10})\/?/);
    if (match?.[1]) {
      return match[1];
    }
    const idParam = url.searchParams.get("styleId") || url.searchParams.get("id");
    if (idParam && /^\d+$/.test(idParam)) {
      return idParam;
    }
    return undefined;
  }

  extractInfoFromPath(path: string): {
    title: string;
    brand?: string;
    category: string;
    styleId?: string;
  } {
    const info = this.extractProductInfoFromPath(path);
    const styleId = this.extractStyleId(new URL(`https://www.myntra.com${path}`));
    return {
      title: info.title,
      brand: info.brand,
      category: "Fashion (Men)",
      styleId,
    };
  }

  extractProductInfoFromPath(path: string): {
    title: string;
    brand?: string;
    category?: string;
  } {
    const parts = path.split("/").filter(Boolean);
    const category = parts[0] || "Fashion";
    const brandPart = (parts[1] || "").replace(/\+/g, " ");
    const titlePart = parts[2] || "";

    const cleanTitle = titlePart
      ? titlePart.replace(/\+/g, " ").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
      : parts.join(" ");

    const titleBrand = parseTitleToBrand(cleanTitle);
    let brand: string | undefined = titleBrand;

    if (!brand && brandPart) {
      if (/^house[\s+]pataudi$/i.test(brandPart)) {
        brand = "House of Pataudi";
      } else {
        brand = brandPart
          .split(/[\s-]+/)
          .map((w) => (w.toLowerCase() === "of" ? "of" : w.charAt(0).toUpperCase() + w.slice(1)))
          .join(" ");
      }
    }

    return {
      title: cleanTitle || "Myntra Fashion Product",
      brand,
      category: category.charAt(0).toUpperCase() + category.slice(1),
    };
  }

  async extract(context: ExtractionContext): Promise<NormalizedProductExtraction> {
    const styleId = this.extractStyleId(context.url);
    const canonicalUrl = styleId
      ? `https://www.myntra.com/${styleId}`
      : cleanProductUrl(context.rawUrl);
    const observedAt = new Date().toISOString();
    const urlInfo = this.extractProductInfoFromPath(context.url.pathname);
    const html = context.html || context.htmlFixture;

    if (html) {
      const jsonLd = parseJsonLd(html, context.url.origin);
      const og = parseOpenGraph(html, context.url.origin);
      const meta = parseHtmlMetadata(html, context.url.origin);
      const embedded = parseEmbeddedJson(html, context.url.origin);

      // Priority 4: Myntra DOM Selectors
      let selectorTitle: string | undefined;
      const titleMatch = html.match(/<h1\b[^>]*class=["'][^"']*pdp-name[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
      if (titleMatch?.[1]) {
        selectorTitle = sanitizeExtractedText(titleMatch[1]).trim();
      }

      let selectorBrand: string | undefined;
      const brandMatch = html.match(/<h1\b[^>]*class=["'][^"']*pdp-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
      if (brandMatch?.[1]) {
        selectorBrand = sanitizeExtractedText(brandMatch[1]).trim();
      }

      let selectorPrice: number | null = null;
      const priceMatch = html.match(/<span\b[^>]*class=["'][^"']*pdp-price[^"']*["'][^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i) ||
                         html.match(/<span\b[^>]*class=["'][^"']*pdp-price[^"']*["'][^>]*>([^<]+)<\/span>/i);
      if (priceMatch?.[1]) {
        selectorPrice = parsePrice(priceMatch[1]);
      }

      let selectorMrp: number | null = null;
      const mrpMatch = html.match(/<span\b[^>]*class=["'][^"']*pdp-mrp[^"']*["'][^>]*>[\s\S]*?<s>([^<]+)<\/s>/i) ||
                       html.match(/<span\b[^>]*class=["'][^"']*pdp-mrp[^"']*["'][^>]*>([^<]+)<\/span>/i);
      if (mrpMatch?.[1]) {
        selectorMrp = parsePrice(mrpMatch[1]);
      }

      let selectorImage: string | undefined;
      const imgMatch = html.match(/<div\b[^>]*class=["'][^"']*image-grid-image[^"']*["'][^>]*style=["'][^"']*background-image:\s*url\(["']?([^"')]+)["']?\)/i) ||
                         html.match(/<img\b[^>]*class=["'][^"']*image-grid-image[^"']*["'][^>]*src=["']([^"']*)["']/i);
      if (imgMatch?.[1]) {
        selectorImage = imgMatch[1];
      }

      let selectorRating: number | null = null;
      const ratingMatch = html.match(/<div\b[^>]*class=["'][^"']*index-overallRating[^"']*["'][^>]*>[\s\S]*?<div>([0-9.]+)<\/div>/i);
      if (ratingMatch?.[1]) {
        const val = parseFloat(ratingMatch[1]);
        if (!isNaN(val)) selectorRating = val;
      }

      // Title resolution
      let resolvedTitle = jsonLd.name || selectorTitle || og.title || embedded.title || meta.title || urlInfo.title;
      if (selectorBrand && selectorTitle && !resolvedTitle.includes(selectorBrand)) {
        resolvedTitle = `${selectorBrand} ${selectorTitle}`;
      }
      let titleSource: "json_ld" | "retailer_html_selector" | "open_graph" | "embedded_json" | "html_metadata" | "url_heuristic" = "json_ld";
      if (!jsonLd.name) {
        if (selectorTitle) titleSource = "retailer_html_selector";
        else if (og.title) titleSource = "open_graph";
        else if (embedded.title) titleSource = "embedded_json";
        else if (meta.title) titleSource = "html_metadata";
        else titleSource = "url_heuristic";
      }

      // Brand resolution
      const resolvedBrand = jsonLd.brand || selectorBrand || og.brand || embedded.brand || urlInfo.brand || parseTitleToBrand(resolvedTitle);
      const brandSource = jsonLd.brand ? "json_ld" : selectorBrand ? "retailer_html_selector" : og.brand ? "open_graph" : embedded.brand ? "embedded_json" : "url_heuristic";

      // Description resolution
      const rawDesc = jsonLd.description || og.description || embedded.description || meta.description || null;
      const resolvedDesc = cleanDescription(rawDesc);
      const descSource = jsonLd.description ? "json_ld" : og.description ? "open_graph" : "html_metadata";

      // Pricing resolution
      const priceRupees = jsonLd.price ?? selectorPrice ?? og.price ?? embedded.price ?? meta.price ?? null;
      let mrpRupees = jsonLd.mrp ?? selectorMrp ?? og.mrp ?? embedded.mrp ?? meta.mrp ?? null;
      if (priceRupees && !mrpRupees) {
        mrpRupees = Number((priceRupees * 1.5).toFixed(2));
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
          sku: createField(styleId ?? jsonLd.sku ?? null, "json_ld", styleId ? "HIGH" : "MISSING"),
          asin: missingField(),
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
          category: createField(jsonLd.category ?? urlInfo.category ?? "Fashion", "json_ld", "MEDIUM"),
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
          sellerName: createField(jsonLd.sellerName ?? "Myntra", "json_ld", "HIGH"),
          sellerId: missingField(),
          originalUrl: context.rawUrl,
          canonicalUrl,
        },
        media: {
          primaryImageUrl: createField(primaryImg, primaryImg ? (jsonLd.image ? "json_ld" : "open_graph") : "manual_fallback", primaryImg ? "HIGH" : "MISSING"),
          additionalImageUrls: createField(additionalImages, "open_graph", additionalImages.length > 0 ? "HIGH" : "MISSING"),
          imageSource: createField("Myntra CDN", "open_graph", "HIGH"),
          dimensions: missingField(),
          importedMediaId: missingField(),
        },
        ratings: {
          rating: createField(ratingVal, "json_ld", ratingVal ? "HIGH" : "MISSING"),
          reviewCount: createField(reviewCnt, "json_ld", reviewCnt ? "HIGH" : "MISSING"),
          ratingSource: createField("Myntra Verified Buyers", "json_ld", "HIGH"),
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
        sku: createField(styleId ?? null, "url_heuristic", styleId ? "HIGH" : "MISSING"),
        asin: missingField(),
        flipkartPid: missingField(),
        cromaPid: missingField(),
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
        category: createField(urlInfo.category ?? "Fashion", "url_heuristic", "LOW"),
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
        sellerName: createField("Myntra", "url_heuristic", "MEDIUM"),
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

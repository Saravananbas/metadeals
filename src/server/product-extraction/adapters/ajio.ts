import type {
  ExtractionContext,
  NormalizedProductExtraction,
  RetailerAdapter,
  RetailerAuthorizationInfo,
} from "../core/types";
import { createField } from "../core/confidence";
import { findAllowedDomain } from "../security/domain-allowlist";
import { sanitizeExtractedText } from "../security/fetch-policy";
import { GenericStructuredDataAdapter } from "./generic-structured-data";
import { convertRupeesToIntegerPaise, parsePrice } from "./base";

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? sanitizeExtractedText(match[1]) : "";
    if (value) return value;
  }
  return undefined;
}

function pageText(html: string): string {
  return sanitizeExtractedText(html).replace(/\s+/g, " ").trim();
}

function safeAjioImage(value: string | undefined, pageUrl: URL): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value, pageUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
      !(host === "ajio.com" || host.endsWith(".ajio.com"))) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function extractAjioImageUrls(html: string, pageUrl: URL, title: string): string[] {
  const titleWords = title.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const images = new Set<string>();
  const imageTag = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = imageTag.exec(html)) !== null && images.size < 12) {
    const attrs = match[1];
    const alt = (attrs.match(/\balt=["']([^"']*)["']/i)?.[1] ?? "").toLowerCase();
    const className = (attrs.match(/\bclass=["']([^"']*)["']/i)?.[1] ?? "").toLowerCase();
    const src = attrs.match(/\b(?:src|data-src|data-original)=["']([^"']+)["']/i)?.[1];
    const candidate = safeAjioImage(src, pageUrl);
    if (!candidate || /logo|sprite|icon|placeholder|payment|store/i.test(`${alt} ${className} ${candidate}`)) continue;
    const productLike = /\/medias\/|\/sys_master\/|demandware\.static/i.test(candidate) ||
      className.includes("product") || titleWords.some((word) => alt.includes(word));
    if (productLike) images.add(candidate);
  }
  // AJIO often keeps its full product gallery in ProductGroup/hasVariant JSON-LD
  // and serialized page state rather than rendered <img> elements. Restrict
  // matches to this product's numeric code and AJIO's image CDN.
  const productId = pageUrl.pathname.match(/\/p\/(\d+)(?:_[^/?#]+)?/i)?.[1];
  if (productId) {
    const imageUrlPattern = /https:\/\/assets\.ajio\.com\/[^\s"'<>\\]+/gi;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = imageUrlPattern.exec(html)) !== null && images.size < 48) {
      const raw = urlMatch[0].replace(/&amp;/g, "&").replace(/[),.;]+$/, "");
      if (!raw.includes("-" + productId + "-") || /-SWATCH\./i.test(raw)) continue;
      const candidate = safeAjioImage(raw, pageUrl);
      if (candidate && /\/medias\/sys_master\//i.test(candidate)) images.add(candidate);
    }
  }

  // Prefer image renditions large enough for a deal card, then retain a small
  // bounded gallery.
  const imageArea = (value: string) => {
    const size = value.match(/-(\d+)Wx(\d+)H-/i);
    return size ? Number(size[1]) * Number(size[2]) : 0;
  };
  return [...images].sort((left, right) => imageArea(right) - imageArea(left)).slice(0, 11);
}

function productGroupHighPrices(html: string, productId: string): number[] {
  const values: number[] = [];
  const scripts = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let script: RegExpExecArray | null;
  let inspected = 0;
  while ((script = scripts.exec(html)) !== null && inspected < 20) {
    inspected += 1;
    const source = script[1].trim();
    if (!source || source.length > 500_000) continue;
    try {
      const parsed: unknown = JSON.parse(source);
      const items: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["@graph"])
          ? (parsed as Record<string, unknown>)["@graph"] as unknown[]
          : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const group = item as Record<string, unknown>;
        const groupId = String(group.productGroupID ?? group.sku ?? "");
        if (!String(group["@type"] ?? "").toLowerCase().includes("productgroup") || !groupId.includes(productId)) continue;
        const variants = Array.isArray(group.hasVariant) ? group.hasVariant : [];
        for (const variant of variants) {
          if (!variant || typeof variant !== "object") continue;
          const offers = (variant as Record<string, unknown>).offers;
          const offerList = Array.isArray(offers) ? offers : [offers];
          for (const offer of offerList) {
            if (!offer || typeof offer !== "object") continue;
            const highPrice = parsePrice(String((offer as Record<string, unknown>).highPrice ?? ""));
            if (highPrice !== null && highPrice > 0) values.push(highPrice);
          }
        }
      }
    } catch {
      // Ignore malformed or non-product structured data without executing it.
    }
  }
  return [...new Set(values)];
}

/** Deterministic AJIO page rules layered over the shared structured-data adapter. */
export class AjioAdapter implements RetailerAdapter {
  id = "ajio";
  name = "AJIO";
  slug = "ajio";
  domains = ["ajio.com", "www.ajio.com"];
  private structured = new GenericStructuredDataAdapter();

  canHandle(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return this.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)) &&
      findAllowedDomain(host)?.adapterId === this.id;
  }

  async checkAuthorization(): Promise<RetailerAuthorizationInfo> {
    return {
      authorized: true,
      status: "AUTHORIZED",
      supportedMethods: ["json_ld", "open_graph", "embedded_json", "ajio_product_page_rules"],
      primaryMethod: "ajio_product_page_rules",
    };
  }

  async extract(context: ExtractionContext): Promise<NormalizedProductExtraction> {
    const extraction = await this.structured.extract(context);
    const html = context.html || context.htmlFixture || "";
    if (!html) {
      return {
        ...extraction,
        merchant: { ...extraction.merchant, retailerName: context.directoryMerchant?.name ?? "AJIO", retailerSlug: "ajio" },
      };
    }

    const text = pageText(html);
    const productId = context.url.pathname.match(/\/p\/(\d+)(?:_[^/?#]+)?/i)?.[1];
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    const title = sanitizeExtractedText(h1 ?? "") || firstMatch(text, [
      /(?:^|\s)Buy\s+(.+?)\s+Online(?:\s+in\s+India)?\s+at\s+Rs\.?\s*[\d,]+(?:\.\d{1,2})?/i,
    ]);
    const pageTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const brand = firstMatch(sanitizeExtractedText(pageTitle), [
      /\bby\s+(.+?)\s+Online(?:\s+in\s+India)?(?:\s*\||$)/i,
    ]);
    const salePriceText = firstMatch(text, [
      /\bOnline(?:\s+in\s+India)?\s+at\s+Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ]);
    const mrpText = firstMatch(text, [
      /\bMRP\s*:?\s*Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ]);
    const variantHighPrices = productId ? productGroupHighPrices(html, productId) : [];
    const code = firstMatch(text, [
      /\bProduct\s+Code\s*:?\s*([A-Z0-9_-]{5,40})/i,
    ]);
    const commodity = firstMatch(text, [
      /\bCommodity\s*:?\s*(.{2,100}?)(?=\s+(?:MRP|Net Qty|Customer Care Address)\b|$)/i,
    ]);
    const images = extractAjioImageUrls(html, context.url, title || "");
    const observedAt = extraction.pricing.observedAt || new Date().toISOString();

    const titleField = !extraction.identity.title.value && title
      ? createField(title, "retailer_html_selector", "HIGH", undefined, undefined, "AJIO product h1 / product summary")
      : extraction.identity.title;
    const brandField = !extraction.identity.brand.value && brand
      ? createField(brand, "retailer_html_selector", "HIGH", undefined, undefined, "AJIO SEO title: by … Online")
      : extraction.identity.brand;
    const priceRupees = !extraction.pricing.priceRupees.value ? parsePrice(salePriceText) : null;
    const mrpRupees = !extraction.pricing.mrpRupees.value
      ? (parsePrice(mrpText) ?? (variantHighPrices.length === 1 ? variantHighPrices[0] : null))
      : null;
    const priceField = priceRupees !== null
      ? createField(priceRupees, "retailer_html_selector", "HIGH", undefined, observedAt, "AJIO product summary: Online in India at Rs")
      : extraction.pricing.priceRupees;
    const mrpFromVariantPrice = !extraction.pricing.mrpRupees.value &&
      parsePrice(mrpText) === null && variantHighPrices.length === 1;
    const mrpField = mrpRupees !== null
      ? createField(
        mrpRupees,
        mrpFromVariantPrice ? "json_ld" : "retailer_html_selector",
        mrpFromVariantPrice ? "MEDIUM" : "HIGH",
        undefined,
        observedAt,
        mrpFromVariantPrice ? "AJIO ProductGroup.hasVariant[].offers.highPrice" : "AJIO labelled MRP",
      )
      : extraction.pricing.mrpRupees;
    const primaryImage = images[0] || extraction.media.primaryImageUrl.value || null;
    const imageVariantKey = (value: string) => {
      try {
        return new URL(value).pathname.replace(/-\d+Wx\d+H-/i, "-").toLowerCase();
      } catch {
        return value.toLowerCase();
      }
    };
    const seenImageVariants = new Set(primaryImage ? [imageVariantKey(primaryImage)] : []);
    const additionalImages = [
      ...(extraction.media.additionalImageUrls.value ?? []),
      ...images.filter((image) => image !== primaryImage),
    ].filter((image): image is string => {
      if (!image) return false;
      const key = imageVariantKey(image);
      if (seenImageVariants.has(key)) return false;
      seenImageVariants.add(key);
      return true;
    }).slice(0, 11);

    return {
      ...extraction,
      identity: {
        ...extraction.identity,
        title: titleField,
        brand: brandField,
        sku: !extraction.identity.sku.value && code
          ? createField(code, "retailer_html_selector", "HIGH", undefined, undefined, "AJIO labelled Product Code")
          : extraction.identity.sku,
      },
      content: {
        ...extraction.content,
        category: !extraction.content.category.value && commodity
          ? createField(commodity, "retailer_html_selector", "HIGH", undefined, undefined, "AJIO labelled Commodity")
          : extraction.content.category,
      },
      pricing: {
        ...extraction.pricing,
        priceRupees: priceField,
        priceMinor: !extraction.pricing.priceMinor.value && priceRupees !== null
          ? createField(convertRupeesToIntegerPaise(priceRupees), "retailer_html_selector", "HIGH", undefined, observedAt, "AJIO product summary price")
          : extraction.pricing.priceMinor,
        mrpRupees: mrpField,
        mrpMinor: !extraction.pricing.mrpMinor.value && mrpRupees !== null
          ? createField(convertRupeesToIntegerPaise(mrpRupees), "retailer_html_selector", "HIGH", undefined, observedAt, "AJIO labelled MRP")
          : extraction.pricing.mrpMinor,
      },
      media: {
        ...extraction.media,
        primaryImageUrl: primaryImage
          ? createField(primaryImage, images.length ? "retailer_html_selector" : extraction.media.primaryImageUrl.source, images.length ? "HIGH" : extraction.media.primaryImageUrl.confidence, undefined, undefined, images.length ? "AJIO product page image URLs" : extraction.media.primaryImageUrl.evidencePath)
          : extraction.media.primaryImageUrl,
        additionalImageUrls: createField(additionalImages, images.length ? "retailer_html_selector" : extraction.media.additionalImageUrls.source, images.length ? "HIGH" : extraction.media.additionalImageUrls.confidence, undefined, undefined, images.length ? "AJIO product image markup" : extraction.media.additionalImageUrls.evidencePath),
        imageSource: images.length && !extraction.media.primaryImageUrl.value
          ? createField("AJIO product image markup", "retailer_html_selector", "HIGH")
          : extraction.media.imageSource,
      },
      merchant: {
        ...extraction.merchant,
        retailerName: context.directoryMerchant?.name ?? "AJIO",
        retailerSlug: "ajio",
      },
    };
  }
}

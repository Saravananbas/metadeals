import { sanitizeExtractedText } from "../security/fetch-policy";
import { rupeesToPaise } from "@/features/deals/currency";

export interface ParsedJsonLdProduct {
  name?: string;
  description?: string;
  brand?: string;
  image?: string;
  additionalImages?: string[];
  sku?: string;
  mpn?: string;
  gtin?: string;
  category?: string;
  price?: number; // In rupees
  mrp?: number;   // In rupees
  currency?: string;
  availability?: string;
  sellerName?: string;
  ratingValue?: number;
  reviewCount?: number;
}

export interface ParsedOpenGraph {
  title?: string;
  description?: string;
  image?: string;
  additionalImages?: string[];
  price?: number; // In rupees
  mrp?: number;   // In rupees
  currency?: string;
  brand?: string;
  availability?: string;
  sku?: string;
  siteName?: string;
}

export interface ParsedHtmlMetadata {
  title?: string;
  description?: string;
  image?: string;
  canonicalUrl?: string;
  brand?: string;
  price?: number;
  mrp?: number;
  currency?: string;
  availability?: string;
  sku?: string;
  ratingValue?: number;
  reviewCount?: number;
}

export interface ParsedEmbeddedState {
  title?: string;
  brand?: string;
  description?: string;
  price?: number;
  mrp?: number;
  currency?: string;
  image?: string;
  additionalImages?: string[];
  ratingValue?: number;
  reviewCount?: number;
  sku?: string;
  inStock?: boolean;
}

/**
 * Resolves a potentially relative URL against an optional base URL.
 */
export function resolveUrl(urlStr: string | undefined | null, baseUrl?: string): string | undefined {
  if (!urlStr) return undefined;
  const trimmed = urlStr.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (baseUrl) {
    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Parses numeric price string into a positive float in rupees.
 */
export function parsePrice(text: unknown): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return text > 0 ? text : null;
  const cleaned = String(text).replace(/,/g, "").replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * Strips placeholder and generic boilerplate descriptions.
 * Returns null if the description is generic or empty.
 */
export function cleanDescription(desc: string | null | undefined): string | null {
  if (!desc) return null;
  const sanitized = sanitizeExtractedText(desc).trim();
  if (sanitized.length < 5) return null;

  const placeholderPatterns = [
    /(?:product|item)\s+identified\s+from/i,
    /product identified from .* url/i,
    /item identified from .* url/i,
    /product identified from .* listing/i,
    /croma product/i,
    /amazon product/i,
    /flipkart product/i,
    /myntra product/i,
    /verify details before publishing/i,
    /extracted via .*/i,
  ];

  for (const pattern of placeholderPatterns) {
    if (pattern.test(sanitized)) {
      return null;
    }
  }

  return sanitized;
}

/**
 * Priority 1: JSON-LD Structured Data Parser
 * Supports Product, Offer, AggregateOffer, AggregateRating, Brand, ImageObject, arrays, and @graph.
 */
export function parseJsonLd(html: string, baseUrl?: string): ParsedJsonLdProduct {
  const result: ParsedJsonLdProduct = {};
  const additionalImagesSet = new Set<string>();
  const scriptRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const rawJson = match[1].trim();
      const parsed = JSON.parse(rawJson);

      const inspectItem = (item: Record<string, unknown>) => {
        const type = String(item["@type"] || "");
        if (type.toLowerCase().includes("product")) {
          if (item.name && !result.name) result.name = sanitizeExtractedText(String(item.name));
          if (item.description && !result.description) {
            const cleaned = cleanDescription(String(item.description));
            if (cleaned) result.description = cleaned;
          }
          if (item.sku && !result.sku) result.sku = String(item.sku).trim();
          if (item.mpn && !result.mpn) result.mpn = String(item.mpn).trim();
          if ((item.gtin || item.gtin13 || item.gtin14) && !result.gtin) {
            result.gtin = String(item.gtin || item.gtin13 || item.gtin14).trim();
          }
          if (item.category && !result.category) result.category = sanitizeExtractedText(String(item.category));

          // Brand
          if (!result.brand) {
            if (typeof item.brand === "string") {
              result.brand = sanitizeExtractedText(item.brand);
            } else if (item.brand && typeof item.brand === "object" && "name" in item.brand) {
              result.brand = sanitizeExtractedText(String((item.brand as { name: unknown }).name));
            }
          }

          // Images
          const addImage = (img: unknown) => {
            if (typeof img === "string") {
              const res = resolveUrl(img, baseUrl);
              if (res) additionalImagesSet.add(res);
            } else if (img && typeof img === "object") {
              const url = (img as { contentUrl?: string; url?: string }).contentUrl || (img as { contentUrl?: string; url?: string }).url;
              if (url) {
                const res = resolveUrl(url, baseUrl);
                if (res) additionalImagesSet.add(res);
              }
            }
          };

          if (Array.isArray(item.image)) {
            item.image.forEach(addImage);
          } else if (item.image) {
            addImage(item.image);
          }

          // Offers & AggregateOffer
          const offers = item.offers;
          if (offers && typeof offers === "object") {
            const offerList = Array.isArray(offers) ? offers : [offers];
            for (const offer of offerList) {
              if (!offer || typeof offer !== "object") continue;
              const o = offer as Record<string, unknown>;

              // Price
              if (result.price === undefined) {
                const p = parsePrice(o.price ?? o.lowPrice);
                if (p) result.price = p;
              }

              // MRP (highPrice)
              if (result.mrp === undefined) {
                const highP = parsePrice(o.highPrice);
                if (highP) result.mrp = highP;
              }

              if (o.priceCurrency && !result.currency) {
                result.currency = String(o.priceCurrency).trim().toUpperCase();
              }

              if (o.availability && !result.availability) {
                result.availability = String(o.availability).trim();
              }

              if (o.seller && !result.sellerName) {
                if (typeof o.seller === "string") {
                  result.sellerName = sanitizeExtractedText(o.seller);
                } else if (typeof o.seller === "object" && "name" in o.seller) {
                  result.sellerName = sanitizeExtractedText(String((o.seller as { name: unknown }).name));
                }
              }
            }
          }

          // AggregateRating
          const rating = item.aggregateRating;
          if (rating && typeof rating === "object") {
            const r = rating as Record<string, unknown>;
            if (r.ratingValue !== undefined && result.ratingValue === undefined) {
              const val = parseFloat(String(r.ratingValue));
              if (!isNaN(val) && val >= 0 && val <= 5) result.ratingValue = val;
            }
            if ((r.reviewCount !== undefined || r.ratingCount !== undefined) && result.reviewCount === undefined) {
              const count = parseInt(String(r.reviewCount ?? r.ratingCount), 10);
              if (!isNaN(count) && count >= 0) result.reviewCount = count;
            }
          }
        }
      };

      if (Array.isArray(parsed)) {
        parsed.forEach((p) => p && typeof p === "object" && inspectItem(p as Record<string, unknown>));
      } else if (parsed && typeof parsed === "object") {
        if ("@graph" in parsed && Array.isArray((parsed as Record<string, unknown>)["@graph"])) {
          ((parsed as Record<string, unknown>)["@graph"] as unknown[]).forEach(
            (p) => p && typeof p === "object" && inspectItem(p as Record<string, unknown>)
          );
        } else {
          inspectItem(parsed as Record<string, unknown>);
        }
      }
    } catch {
      // Continue parsing next script tag
    }
  }

  const allImages = Array.from(additionalImagesSet);
  if (allImages.length > 0) {
    result.image = allImages[0];
    result.additionalImages = allImages.slice(1);
  }

  return result;
}

/**
 * Priority 2: Open Graph & Twitter Cards Parser
 */
export function parseOpenGraph(html: string, baseUrl?: string): ParsedOpenGraph {
  const result: ParsedOpenGraph = {};
  const additionalImagesSet = new Set<string>();

  const getMeta = (property: string): string | undefined => {
    const regex = new RegExp(`<meta\\s+[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
    const match = html.match(regex);
    if (match?.[1]) return sanitizeExtractedText(match[1]);

    const nameRegex = new RegExp(`<meta\\s+[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
    const nameMatch = html.match(nameRegex);
    return nameMatch?.[1] ? sanitizeExtractedText(nameMatch[1]) : undefined;
  };

  result.title = getMeta("og:title") || getMeta("twitter:title");
  const rawDesc = getMeta("og:description") || getMeta("twitter:description");
  result.description = cleanDescription(rawDesc) ?? undefined;

  const mainImage = resolveUrl(getMeta("og:image") || getMeta("og:image:secure_url") || getMeta("twitter:image"), baseUrl);
  if (mainImage) result.image = mainImage;

  result.siteName = getMeta("og:site_name");
  result.brand = getMeta("product:brand") || getMeta("og:brand");
  result.availability = getMeta("product:availability") || getMeta("og:availability");
  result.sku = getMeta("product:retailer_item_id") || getMeta("product:mfr_part_no");

  const priceStr = getMeta("product:price:amount") || getMeta("og:price:amount") || getMeta("product:sale_price:amount");
  result.price = parsePrice(priceStr) ?? undefined;

  const mrpStr = getMeta("product:original_price:amount");
  result.mrp = parsePrice(mrpStr) ?? undefined;

  result.currency = (getMeta("product:price:currency") || getMeta("og:price:currency") || "INR").toUpperCase();

  // Find all other og:image tags
  const ogImgRegex = /<meta\s+[^>]*property=["']og:image(?::[^"']*)?["'][^>]*content=["']([^"']*)["']/gi;
  let imgMatch;
  while ((imgMatch = ogImgRegex.exec(html)) !== null) {
    const imgUrl = resolveUrl(imgMatch[1], baseUrl);
    if (imgUrl && imgUrl !== mainImage) {
      additionalImagesSet.add(imgUrl);
    }
  }
  if (additionalImagesSet.size > 0) {
    result.additionalImages = Array.from(additionalImagesSet);
  }

  return result;
}

/**
 * Priority 3: Standard HTML Metadata & Microdata Parser
 */
export function parseHtmlMetadata(html: string, baseUrl?: string): ParsedHtmlMetadata {
  const result: ParsedHtmlMetadata = {};

  // 1. <title> tag
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    let rawTitle = sanitizeExtractedText(titleMatch[1]).trim();
    // Clean common store suffixes
    rawTitle = rawTitle
      .replace(/\s*[|–-]\s*(Amazon\.in|Amazon|Flipkart\.com|Flipkart|Croma|Myntra|Online Shopping).*$/i, "")
      .replace(/^Buy\s+/i, "")
      .replace(/\s+Online at Best Price.*$/i, "")
      .replace(/\s+Online at Lowest Price.*$/i, "")
      .trim();
    if (rawTitle) result.title = rawTitle;
  }

  // 2. <meta name="description">
  const metaDescMatch = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
  if (metaDescMatch?.[1]) {
    const cleaned = cleanDescription(metaDescMatch[1]);
    if (cleaned) result.description = cleaned;
  }

  // 3. <link rel="canonical">
  const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  if (canonicalMatch?.[1]) {
    result.canonicalUrl = resolveUrl(canonicalMatch[1], baseUrl);
  }

  // 4. Microdata itemprops
  const getItemprop = (prop: string): string | undefined => {
    // Look for content="..." attribute
    const contentRegex = new RegExp(`<[^>]*itemprop=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
    const cMatch = html.match(contentRegex);
    if (cMatch?.[1]) return sanitizeExtractedText(cMatch[1]);

    // Look for text content within tag: <span itemprop="price">1,499</span>
    const textRegex = new RegExp(`<[^>]*itemprop=["']${prop}["'][^>]*>([^<]+)<\/`, "i");
    const tMatch = html.match(textRegex);
    if (tMatch?.[1]) return sanitizeExtractedText(tMatch[1]);

    // Look for src="..." if image
    const srcRegex = new RegExp(`<img[^>]*itemprop=["']${prop}["'][^>]*src=["']([^"']*)["']`, "i");
    const sMatch = html.match(srcRegex);
    if (sMatch?.[1]) return sMatch[1];

    return undefined;
  };

  const mpPrice = getItemprop("price");
  if (mpPrice) result.price = parsePrice(mpPrice) ?? undefined;

  const mpCurrency = getItemprop("priceCurrency");
  if (mpCurrency) result.currency = mpCurrency.toUpperCase();

  const mpBrand = getItemprop("brand");
  if (mpBrand) result.brand = mpBrand;

  const mpSku = getItemprop("sku");
  if (mpSku) result.sku = mpSku;

  const mpAvail = getItemprop("availability");
  if (mpAvail) result.availability = mpAvail;

  const mpRating = getItemprop("ratingValue");
  if (mpRating) {
    const val = parseFloat(mpRating);
    if (!isNaN(val) && val >= 0 && val <= 5) result.ratingValue = val;
  }

  const mpReviewCount = getItemprop("reviewCount") || getItemprop("ratingCount");
  if (mpReviewCount) {
    const count = parseInt(mpReviewCount, 10);
    if (!isNaN(count) && count >= 0) result.reviewCount = count;
  }

  return result;
}

/**
 * Priority 5: Embedded JSON Application State Parser
 * Extracts state from __NEXT_DATA__, window.__myx, window.__INITIAL_STATE__ safely.
 */
export function parseEmbeddedJson(html: string, baseUrl?: string): ParsedEmbeddedState {
  const result: ParsedEmbeddedState = {};

  // 1. Next.js __NEXT_DATA__
  const nextDataMatch = html.match(/<script\s+[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    try {
      const parsed = JSON.parse(nextDataMatch[1].trim());
      const pageProps = parsed?.props?.pageProps;
      const product = pageProps?.product || pageProps?.initialData?.product || pageProps?.pdpData;

      if (product && typeof product === "object") {
        if (product.name || product.title) result.title = sanitizeExtractedText(String(product.name || product.title));
        if (product.brand?.name || product.brand) result.brand = sanitizeExtractedText(String(product.brand?.name || product.brand));
        if (product.description) {
          const cleaned = cleanDescription(String(product.description));
          if (cleaned) result.description = cleaned;
        }

        const price = parsePrice(product.price?.discounted || product.sellingPrice || product.price?.value);
        if (price) result.price = price;

        const mrp = parsePrice(product.price?.mrp || product.mrp || product.originalPrice);
        if (mrp) result.mrp = mrp;

        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          const first = typeof product.images[0] === "string" ? product.images[0] : product.images[0]?.url;
          result.image = resolveUrl(first, baseUrl);
        }
      }
    } catch {
      // Continue
    }
  }

  // 2. Myntra window.__myx / pdpData
  const myntraDataMatch = html.match(/<script\b[^>]*>\s*window\.__myx\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i);
  if (myntraDataMatch?.[1]) {
    try {
      const myx = JSON.parse(myntraDataMatch[1].trim());
      const pdpData = myx?.pdpData;
      if (pdpData) {
        if (pdpData.name) result.title = sanitizeExtractedText(pdpData.name);
        if (pdpData.brand?.name) result.brand = sanitizeExtractedText(pdpData.brand.name);
        if (pdpData.price?.discounted) result.price = parsePrice(pdpData.price.discounted) ?? undefined;
        if (pdpData.price?.mrp) result.mrp = parsePrice(pdpData.price.mrp) ?? undefined;
        if (pdpData.ratings?.averageRating) result.ratingValue = pdpData.ratings.averageRating;
        if (pdpData.ratings?.totalCount) result.reviewCount = pdpData.ratings.totalCount;

        const images = pdpData.media?.albums?.[0]?.images;
        if (Array.isArray(images) && images.length > 0) {
          const firstImg = images[0]?.imageURL || images[0]?.src;
          result.image = resolveUrl(firstImg, baseUrl);
        }
      }
    } catch {
      // Continue
    }
  }

  return result;
}

/**
 * Common brand recognition dictionary for Indian e-commerce.
 */
export function parseTitleToBrand(title: string): string | undefined {
  if (!title) return undefined;
  const commonBrands = [
    "Samsung", "Apple", "OnePlus", "Xiaomi", "Redmi", "Realme", "Google", "Motorola", "Oppo", "Vivo",
    "Sony", "boAt", "Noise", "Boult", "Fire-Boltt", "JBL", "Bose", "Sennheiser",
    "HP", "Dell", "Lenovo", "Asus", "Acer", "LG", "Voltas", "Daikin", "Whirlpool", "Godrej",
    "Puma", "Nike", "Adidas", "Levi's", "House of Pataudi", "Wrogn", "Allen Solly", "Van Heusen", "Peter England",
    "Philips", "Havells", "Bajaj", "Prestige", "Pigeon", "Usha", "Crompton", "IFB", "Haier"
  ];
  for (const brand of commonBrands) {
    if (new RegExp(`^${brand}\\b`, "i").test(title) || new RegExp(`\\b${brand}\\b`, "i").test(title)) {
      return brand;
    }
  }
  return undefined;
}

/**
 * Safely converts decimal rupees to integer paise without floating point issues.
 */
export function convertRupeesToIntegerPaise(rupees: number | null | undefined): number | null {
  if (rupees === null || rupees === undefined || isNaN(rupees) || rupees < 0) return null;
  try {
    return rupeesToPaise(rupees.toFixed(2));
  } catch {
    return null;
  }
}

import type { PrismaClient } from "@/generated/prisma/client";
import type {
  NormalizedProductExtraction,
  MatchedTaxonomy,
  SuggestedFormValues,
} from "./types";
import { paiseToRupeeInputString } from "@/features/deals/currency";
import { cleanDescription } from "../adapters/base";

export function generateStableSlug(title: string, brand?: string, externalId?: string): string {
  const base = `${brand ? brand + " " : ""}${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  let slug = base.slice(0, 80);
  if (externalId) {
    const cleanId = externalId.toLowerCase().replace(/[^a-z0-9]/g, "");
    slug = `${slug.slice(0, 70)}-${cleanId}`;
  }

  // Ensure meets slugSchema: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  slug = slug.replace(/^-|-$/g, "");
  if (!slug || slug.length < 3) {
    slug = `deal-${Date.now().toString(36)}`;
  }

  return slug.slice(0, 100);
}

export async function matchCategoryAndMerchant(
  db: PrismaClient,
  extraction: NormalizedProductExtraction
): Promise<MatchedTaxonomy> {
  const result: MatchedTaxonomy = {};

  const [categories, merchants, directoryMerchants] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, slug: true, parentId: true } }),
    db.merchant.findMany({ select: { id: true, name: true, slug: true, websiteUrl: true } }),
    db.merchantWebsiteDirectory.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, domain: true, websiteUrl: true },
    }),
  ]);

  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const domainOf = (value: string) => {
    try {
      return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  };
  const retailerSlug = normalize(extraction.merchant.retailerSlug);
  const retailerName = normalize(extraction.merchant.retailerName);
  const urlDomains = [extraction.merchant.canonicalUrl, extraction.merchant.originalUrl]
    .map(domainOf)
    .filter(Boolean);
  const domainMatches = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

  // Prefer a domain match from the merchant directory. For short-link/redirect
  // URLs, fall back only to an exact normalized retailer identity supplied by
  // the extraction adapter, never an arbitrary substring match.
  const matchedDirectoryMerchant = directoryMerchants.find((merchant) => {
    const domain = domainOf(merchant.domain || merchant.websiteUrl);
    if (domain && urlDomains.some((host) => domainMatches(host, domain))) return true;
    const name = normalize(merchant.name);
    return Boolean(name && ((retailerName && name === retailerName) || (retailerSlug && name === retailerSlug)));
  });
  if (matchedDirectoryMerchant) {
    result.merchantDirectoryId = matchedDirectoryMerchant.id;
    result.merchantName = matchedDirectoryMerchant.name;
  }

  // Keep the operational merchant ID for the existing deal schema/workflow.
  const matchedMerchant = merchants.find((merchant) => {
    const domain = domainOf(merchant.websiteUrl || merchant.slug);
    if (domain && urlDomains.some((host) => domainMatches(host, domain))) return true;
    const name = normalize(merchant.name);
    const slug = normalize(merchant.slug);
    return Boolean((retailerName && (name === retailerName || slug === retailerName)) || (retailerSlug && (name === retailerSlug || slug === retailerSlug)));
  });

  if (matchedMerchant) {
    result.merchantId = matchedMerchant.id;
    result.merchantName ||= matchedMerchant.name;
  }

  // Prefer an extracted leaf/subcategory or the most specific matching
  // breadcrumb. Use conservative title keywords only when they identify a
  // clear leaf; ambiguous products remain available for manual review.
  const extractedCategory = normalize(extraction.content.category.value || "");
  const extractedSubcategory = normalize(extraction.content.subcategory.value || "");
  const breadcrumbs = (extraction.content.breadcrumb.value || []).map(normalize).filter(Boolean);
  let productPath = "";
  try {
    productPath = decodeURIComponent(new URL(extraction.merchant.canonicalUrl || extraction.merchant.originalUrl).pathname)
      .replace(/\.[a-z0-9]{2,5}$/i, "");
  } catch {
    // A malformed/missing URL does not prevent matching from extracted fields.
  }
  const titleContext = normalize(`${extraction.identity.title.value || ""} ${extraction.identity.brand.value || ""} ${productPath}`);
  const taxonomyContext = normalize([extractedCategory, extractedSubcategory, ...breadcrumbs].join(" "));
  const combinedContext = normalize(`${taxonomyContext} ${titleContext}`);
  const keywordGroups: Array<{ terms: string[]; categoryTerms: string[] }> = [
    { terms: ["shoe", "shoes", "footwear", "sneaker", "sneakers", "running shoe", "walking shoe", "sandal", "slipper", "flip flop", "mule", "boot"], categoryTerms: ["shoe", "footwear", "sandal", "slipper", "mule", "boot"] },
    { terms: ["mobile", "phone", "smartphone", "iphone", "galaxy", "5g"], categoryTerms: ["mobile", "phone", "smartphone"] },
    { terms: ["laptop", "notebook", "macbook", "thinkpad"], categoryTerms: ["laptop", "notebook"] },
    { terms: ["headphone", "headphones", "earphone", "earphones", "earbuds", "smartwatch"], categoryTerms: ["audio", "headphone", "earphone", "wearable"] },
    { terms: ["refrigerator", "washing machine", "microwave", "air fryer", "air conditioner", "split ac", "window ac"], categoryTerms: ["appliance", "refrigerator", "washing machine", "microwave", "air conditioner", "air conditioners", " ac "] },
    { terms: ["kurta", "shirt", "ethnic wear", "dress", "saree", "jeans", "trouser", "cargo pants", "t shirt", "top", "jacket"], categoryTerms: ["fashion", "apparel", "clothing", "kurta", "shirt", "dress", "saree", "jeans", "trouser", "pants", "tops", "jackets"] },
    { terms: ["sofa", "bed", "dining table", "chair", "wardrobe", "mattress", "showpiece", "home decor"], categoryTerms: ["home", "kitchen", "furniture", "decor", "bed", "sofa", "chair"] },
    { terms: ["face wash", "moisturizer", "shampoo", "serum", "sunscreen", "lipstick", "perfume"], categoryTerms: ["beauty", "personal care", "skin", "hair", "fragrance", "makeup"] },
    { terms: ["camera", "speaker", "smart tv", "television", "monitor", "router", "power bank", "charger"], categoryTerms: ["electronics", "gadgets", "audio", "camera", "television", "tv", "computer"] },
  ];
  const childrenByParent = new Map<string, number>();
  for (const category of categories) if (category.parentId) childrenByParent.set(category.parentId, (childrenByParent.get(category.parentId) || 0) + 1);
  const scored = categories.map((category) => {
    const name = normalize(category.name);
    const slug = normalize(category.slug);
    const target = `${name} ${slug}`;
    let score = 0;
    if (extractedSubcategory && (name === extractedSubcategory || slug === extractedSubcategory)) score = Math.max(score, 500);
    if (extractedCategory && (name === extractedCategory || slug === extractedCategory)) score = Math.max(score, category.parentId ? 320 : 180);
    for (let index = 0; index < breadcrumbs.length; index += 1) {
      const crumb = breadcrumbs[index];
      const specificity = category.parentId ? 350 : 170;
      if (name === crumb || slug === crumb) score = Math.max(score, specificity + index);
      else if (crumb.length > 3 && (crumb.includes(name) || crumb.includes(slug))) score = Math.max(score, specificity - 25 + index);
    }
    if (combinedContext) {
      for (const group of keywordGroups) {
        if (!group.terms.some((term) => combinedContext.includes(normalize(term)))) continue;
        if (group.categoryTerms.some((term) => target.includes(normalize(term)))) {
          score = Math.max(score, category.parentId ? 160 : 90);
        }
      }
      const categoryWords = new Set((name || slug).split(" ").filter((word) => word.length > 3));
      const contextWords = new Set(combinedContext.split(" "));
      const overlaps = [...categoryWords].filter((word) => contextWords.has(word)).length;
      if (overlaps) score = Math.max(score, 35 + overlaps * (category.parentId ? 14 : 7));
    }
    if (!category.parentId && childrenByParent.has(category.id) && score > 0) score -= 45;
    return { category, score };
  }).filter((item) => item.score >= 80).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && (!scored[1] || best.score > scored[1].score)) {
    result.categoryId = best.category.id;
    result.categoryName = best.category.name;
  }

  return result;
}

export function buildSuggestedFormValues(
  extraction: NormalizedProductExtraction,
  matchedTaxonomy: MatchedTaxonomy
): SuggestedFormValues {
  const title = extraction.identity.title.value || "";
  const brand = extraction.identity.brand.value || "";
  const externalId =
    extraction.identity.asin.value ||
    extraction.identity.flipkartPid.value ||
    extraction.identity.sku.value ||
    undefined;

  const slug = generateStableSlug(title, brand, externalId);
  const description = cleanDescription(extraction.content.description.value) || "";

  const mrpMinor = extraction.pricing.mrpMinor.value;
  const priceMinor = extraction.pricing.priceMinor.value;

  const mrpRupees = mrpMinor !== null && mrpMinor !== undefined
    ? paiseToRupeeInputString(mrpMinor)
    : "";
  const priceRupees = priceMinor !== null && priceMinor !== undefined
    ? paiseToRupeeInputString(priceMinor)
    : "";

  return {
    title,
    slug,
    brand,
    description,
    productUrl: extraction.merchant.canonicalUrl || extraction.merchant.originalUrl,
    categoryId: matchedTaxonomy.categoryId || "",
    merchantId: matchedTaxonomy.merchantId || "",
    mrpRupees,
    priceRupees,
    mediaId: extraction.media.importedMediaId.value || "",
    rating: extraction.ratings.rating.value,
    reviewCount: extraction.ratings.reviewCount.value,
    ratingSource: extraction.ratings.ratingSource.value,
  };
}

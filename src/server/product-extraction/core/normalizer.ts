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

  const [categories, merchants] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true, slug: true } }),
    db.merchant.findMany({ select: { id: true, name: true, slug: true } }),
  ]);

  // 1. Match merchant
  const retailerSlug = extraction.merchant.retailerSlug.toLowerCase();
  const retailerName = extraction.merchant.retailerName.toLowerCase();

  const matchedMerchant = merchants.find(
    (m) =>
      m.slug.toLowerCase() === retailerSlug ||
      m.name.toLowerCase().includes(retailerName) ||
      retailerName.includes(m.name.toLowerCase())
  );

  if (matchedMerchant) {
    result.merchantId = matchedMerchant.id;
    result.merchantName = matchedMerchant.name;
  }

  // 2. Match category
  const extractedCat = extraction.content.category.value?.toLowerCase() || "";
  const title = extraction.identity.title.value?.toLowerCase() || "";
  const subcat = extraction.content.subcategory.value?.toLowerCase() || "";

  // Category keyword heuristics
  const matchCat = categories.find((c) => {
    const cName = c.name.toLowerCase();
    const cSlug = c.slug.toLowerCase();

    if (extractedCat && (cName.includes(extractedCat) || extractedCat.includes(cName) || cSlug === extractedCat)) {
      return true;
    }

    if (cSlug === "mobiles" && (title.includes("smartphone") || title.includes("galaxy") || title.includes("iphone") || title.includes("5g") || title.includes("phone"))) {
      return true;
    }
    if (cSlug === "laptops" && (title.includes("laptop") || title.includes("macbook") || title.includes("notebook") || title.includes("thinkpad"))) {
      return true;
    }
    if ((cSlug === "men" || cSlug === "women") && (subcat.includes("kurta") || title.includes("kurta") || title.includes("shirt") || title.includes("ethnic"))) {
      return cSlug === "men";
    }
    if (cSlug === "electronics" && (title.includes("headphones") || title.includes("earbuds") || title.includes("smartwatch") || title.includes("audio"))) {
      return true;
    }
    if (cSlug === "appliances" && (title.includes("refrigerator") || title.includes("washing machine") || title.includes("microwave"))) {
      return true;
    }
    return false;
  });

  if (matchCat) {
    result.categoryId = matchCat.id;
    result.categoryName = matchCat.name;
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

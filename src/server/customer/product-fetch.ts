import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { productExtractionService } from "@/server/product-extraction/core/service";
import { fetchPublicImageBytes } from "@/server/product-extraction/security/safe-image-fetch";
import { MAX_IMAGE_BYTES } from "@/server/storage/media";
import { CustomerError, limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";

// Stores all serve https, so a pasted http:// link is upgraded instead of refused.
const fetchSchema = z.object({ url: z.string().trim().max(2048).transform((u) => u.replace(/^http:\/\//i, "https://")).pipe(z.string().url()) }).strict();

/** Same extractor the admin "Fetch" button uses, but for a signed-in customer: rate limited, and only a small allow-listed summary comes back. */
export async function fetchProductDetails(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  const { url } = fetchSchema.parse(raw);
  await limitCustomerRequests(`product-fetch:${customer.id}`, 10, 3600);
  await limitCustomerRequests(`product-fetch-day:${customer.id}`, 40, 86_400);
  const result = await productExtractionService.extractProduct({ url, importImage: false });
  const d = result.data;
  const images = [d.media.primaryImageUrl.value, ...(d.media.additionalImageUrls?.value ?? [])].filter((u): u is string => Boolean(u)).map((u) => u.replace(/^http:/i, "https:")).slice(0, 8);
  const domain = (() => { try { return new URL(result.canonicalUrl || url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } })();
  const directoryMerchant = domain ? await getDatabase().merchantWebsiteDirectory.findFirst({
    where: { domain: { in: [domain, `www.${domain}`] }, status: "ACTIVE" },
    select: { name: true, logoMediaId: true, logoUrl: true },
  }) : null;
  return {
    logoUrl: directoryMerchant?.logoMediaId ? `/api/v1/media/${directoryMerchant.logoMediaId}` : directoryMerchant?.logoUrl ?? null,
    status: result.status,
    store: directoryMerchant?.name ?? result.matchedTaxonomy?.merchantName ?? result.retailer,
    productUrl: result.canonicalUrl || url,
    title: result.suggestedFormValues?.title || d.identity.title.value || "",
    brand: result.suggestedFormValues?.brand || d.identity.brand.value || "",
    description: (result.suggestedFormValues?.description || d.content.description.value || "").slice(0, 2000),
    priceRupees: result.suggestedFormValues?.priceRupees || "",
    mrpRupees: result.suggestedFormValues?.mrpRupees || "",
    category: result.matchedTaxonomy?.categoryName ?? "",
    images,
    notes: result.diagnostics.warnings.slice(0, 6),
  };
}

/** Downloads a chosen product image on the server with the same public-address, redirect and size checks as the admin import. */
export async function downloadImageFromUrl(raw: string): Promise<Buffer> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new CustomerError("That image link is not valid."); }
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") throw new CustomerError("The image link must be https.");
  try {
    return (await fetchPublicImageBytes(url.href, MAX_IMAGE_BYTES)).bytes;
  } catch {
    throw new CustomerError("We could not download that image. Please upload one instead.");
  }
}

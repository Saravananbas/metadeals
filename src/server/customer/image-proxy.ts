import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { fetchPublicImageBytes } from "@/server/product-extraction/security/safe-image-fetch";
import { CustomerError, limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";

const srcSchema = z.string().trim().max(2048).transform((u) => u.replace(/^http:\/\//i, "https://")).pipe(z.string().url());

/**
 * A small WebP copy of a picture found on a product page, so the picker can show it even when the store blocks hotlinking and the member's
 * browser never contacts the store. Same checks as the final download (public address only, redirects and size limited); the bytes are decoded and
 * re-encoded, so nothing the store sent is passed on as it was.
 */
export async function proxyImage(customerId: string, rawSrc: string): Promise<Buffer> {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`image-proxy:${customer.id}`, 300, 3600);
  const parsed = srcSchema.safeParse(rawSrc);
  if (!parsed.success || new URL(parsed.data).protocol !== "https:") throw new CustomerError("That image link is not valid.");
  let bytes: Buffer;
  try { bytes = (await fetchPublicImageBytes(parsed.data, 5 * 1024 * 1024)).bytes; } catch { throw new CustomerError("That picture could not be loaded.", 404); }
  try {
    return await sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" }).rotate().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp({ quality: 70 }).toBuffer();
  } catch { throw new CustomerError("That file is not a usable picture.", 404); }
}

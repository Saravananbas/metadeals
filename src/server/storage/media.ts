import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getStorage } from "./client";
import { DealError } from "@/server/deals/service";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function boundedBody(request: Request, limit = MAX_IMAGE_BYTES) {
  if (Number(request.headers.get("content-length") ?? 0) > limit || !request.body) throw new DealError("Upload is empty or too large.", 413);
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) { await reader.cancel(); throw new DealError("Upload too large.", 413); } chunks.push(part.value); }
  return Buffer.concat(chunks);
}
export async function normalizeImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new DealError("Image must be between 1 byte and 5 MB.");
  try {
    const image = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning", animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp", "gif", "svg", "tiff", "avif"].includes(meta.format ?? "") || !meta.width || !meta.height || meta.width > 6000 || meta.height > 6000) throw new Error("Unsupported image");
    const { data, info } = await image.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height, mimeType: "image/webp" };
  } catch (cause) { console.warn("Image rejected:", cause instanceof Error ? cause.message : "unknown", "magic:", bytes.subarray(0, 4).toString("hex"), "bytes:", bytes.length); throw new DealError("Use a valid image (JPEG, PNG, GIF, SVG, TIFF, WebP, or AVIF), at most 6000×6000 and 25 megapixels."); }
}
/** Local disk storage: always in dev; in production only when MEDIA_STORAGE=local is set explicitly. MEDIA_DIR should sit outside the deployed app folder so redeploys keep images. */
const localAllowed = () => process.env.NODE_ENV !== "production" || process.env.MEDIA_STORAGE === "local";
const mediaDir = () => process.env.MEDIA_DIR?.trim() || join(process.cwd(), ".local", "media");
export async function storeImage(bytes: Buffer) {
  const key = `${randomUUID()}.webp`;
  const provider = process.env.MEDIA_STORAGE ?? (process.env.NODE_ENV === "production" ? "s3" : "local");
  if (provider === "local" && localAllowed()) {
    const directory = mediaDir(); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, key), bytes, { flag: "wx" }); return { storageKey: key, provider };
  }
  if (provider !== "s3") throw new DealError("Local image storage is disabled; set MEDIA_STORAGE=local to enable it in production.", 503);
  const { client, bucket } = getStorage(); await client.send(new PutObjectCommand({ Bucket: bucket, Key: `media/${key}`, Body: bytes, ContentType: "image/webp" }));
  return { storageKey: key, provider };
}
export async function readImage(provider: string, key: string) {
  provider = provider.toLowerCase(); // older rows were stored as "LOCAL"
  if (key === "placeholders/product-placeholder.svg" || key === "placeholder.svg") {
    return readFile(join(process.cwd(), "public", "images", "placeholder.svg"));
  }
  if (!/^[a-f0-9-]{36}\.webp$/.test(key)) throw new DealError("Invalid storage key.", 404);
  if (provider === "local" && localAllowed()) {
    // seed-media/ holds the images shipped with the deploy; MEDIA_DIR holds later uploads and wins.
    return readFile(join(mediaDir(), key)).catch(() => readFile(join(process.cwd(), "seed-media", key)));
  }
  if (provider !== "s3") throw new DealError("Media unavailable in this environment.", 404);
  const { client, bucket } = getStorage(); const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `media/${key}` }));
  if (!response.Body || (response.ContentLength ?? 0) > MAX_IMAGE_BYTES) throw new DealError("Media unavailable.", 404);
  return Buffer.from(await response.Body.transformToByteArray());
}
export async function removeStoredImage(provider: string, key: string) {
  // Only invoked for this request's newly generated key when the DB insert fails.
  if (!/^[a-f0-9-]{36}\.webp$/.test(key)) return;
  if (provider === "s3") { const { client, bucket } = getStorage(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: `media/${key}` })); }
  // Keep unreferenced local files for operator recovery rather than deleting files automatically.
}

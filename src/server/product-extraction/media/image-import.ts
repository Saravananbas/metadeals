import "server-only";
import { getDatabase } from "@/server/db/client";
import { normalizeImage, storeImage, removeStoredImage, MAX_IMAGE_BYTES } from "@/server/storage/media";
import { isPrivateOrLoopbackHost } from "../security/url-validator";

export interface ImportedMediaResult {
  mediaId: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

export async function importProductImageFromUrl(
  imageUrl: string,
  altText: string,
  actorId?: string
): Promise<ImportedMediaResult | null> {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  try {
    const parsed = new URL(imageUrl);
    const isTest = process.env.NODE_ENV === "test";

    if (parsed.protocol !== "https:" && !(isTest && parsed.protocol === "http:")) {
      return null;
    }

    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let imageBuffer: Buffer;
    try {
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/webp,image/avif,image/jpeg,image/png,*/*;q=0.8",
        },
      });

      if (!response.ok || !response.body) {
        return null;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_IMAGE_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }

      imageBuffer = Buffer.concat(chunks);
    } finally {
      clearTimeout(timeout);
    }

    // Process and normalize with Sharp to WebP <= 1600x1600
    const normalized = await normalizeImage(imageBuffer);
    const storage = await storeImage(normalized.bytes);

    const db = getDatabase();
    let finalActorId = actorId;
    if (!finalActorId) {
      const admin = await db.user.findFirst({ select: { id: true } });
      finalActorId = admin?.id;
    }
    if (!finalActorId) {
      return null;
    }

    try {
      const media = await db.media.create({
        data: {
          storageKey: storage.storageKey,
          provider: storage.provider,
          width: normalized.width,
          height: normalized.height,
          mimeType: normalized.mimeType,
          byteSize: normalized.bytes.length,
          alt: altText.slice(0, 240),
          uploadedById: finalActorId,
        },
      });

      return {
        mediaId: media.id,
        url: `/api/v1/media/${media.id}`,
        alt: media.alt,
        width: media.width,
        height: media.height,
      };
    } catch (err) {
      await removeStoredImage(storage.provider, storage.storageKey);
      throw err;
    }
  } catch (error) {
    // If remote image download fails or image is malformed, fail safely
    console.warn("Failed to import remote product image:", error);
    return null;
  }
}

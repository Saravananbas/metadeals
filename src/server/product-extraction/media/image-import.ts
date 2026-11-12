import { getDatabase } from "@/server/db/client";
import { normalizeImage, storeImage, removeStoredImage, MAX_IMAGE_BYTES } from "@/server/storage/media";
import { fetchPublicImageBytes } from "../security/safe-image-fetch";

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
    const parsedImageUrl = new URL(imageUrl.trim());
    // Some retailer pages still publish HTTP image links. Upgrade those links
    // to HTTPS before fetching; never retry the insecure URL. The fetcher still
    // enforces public-IP, redirect, content-type, and size checks.
    if (parsedImageUrl.protocol === "http:") parsedImageUrl.protocol = "https:";
    if (parsedImageUrl.protocol !== "https:") return null;
    const { bytes: imageBuffer } = await fetchPublicImageBytes(parsedImageUrl.href, MAX_IMAGE_BYTES);

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

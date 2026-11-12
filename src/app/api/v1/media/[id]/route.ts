import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { join } from "node:path";
import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { readImage } from "@/server/storage/media";
import { api, json } from "@/server/http";

const thumbCache = new Map<string, Buffer>();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params;
    const db = getDatabase();
    const media = await db.media.findUnique({
      where: { id },
      include: {
        deals: {
          where: publicWhere(listingSchema.parse({})),
          select: { id: true },
          take: 1,
        },
        galleryImages: { where: { deal: publicWhere(listingSchema.parse({})) }, select: { id: true }, take: 1 },
      },
    });
    if (!media) return json({ error: { code: "NOT_FOUND", message: "Image unavailable." } }, 404);
    const isPublic = media.deals.length > 0 || media.galleryImages.length > 0
      || Boolean(await db.merchantWebsiteDirectory.findFirst({ where: { logoMediaId: id, status: "ACTIVE" }, select: { id: true } }));
    if (!isPublic && !await getCurrentAuthContext()) return json({ error: { code: "NOT_FOUND", message: "Image unavailable." } }, 404);
    const width = Number(new URL(request.url).searchParams.get("w"));
    const thumbWidth = width === 320 || width === 640 ? width : 0;
    // Image ids are unique and stored bytes never change, so public images can be cached for a year.
    const cacheControl = isPublic ? "public, max-age=31536000, immutable" : "private, no-store";
    const etag = `"${media.id}${thumbWidth ? `-w${thumbWidth}` : ""}"`;
    if (isPublic && request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
    }
    try {
      let buffer: Buffer = await readImage(media.provider, media.storageKey);
      let mimeType = media.mimeType;
      if (thumbWidth && isPublic && mimeType !== "image/svg+xml") {
        const key = `${media.id}:${thumbWidth}`;
        let thumb = thumbCache.get(key);
        if (!thumb) {
          try {
            thumb = await sharp(buffer, { limitInputPixels: 50_000_000 }).rotate().resize({ width: thumbWidth, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
            // shortcut: in-memory cache of the newest 300 thumbnails, per server process; move to stored files if memory gets tight.
            if (thumbCache.size >= 300) thumbCache.delete(thumbCache.keys().next().value as string);
            thumbCache.set(key, thumb);
          } catch { /* serve the original if it cannot be resized */ }
        }
        if (thumb) { buffer = thumb; mimeType = "image/webp"; }
      }
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": mimeType,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": cacheControl,
          ...(isPublic ? { ETag: etag } : {}),
        },
      });
    } catch {
      // Graceful fallback placeholder so broken or missing images never disrupt layout
      const fallbackBytes = await readFile(join(process.cwd(), "public", "images", "placeholder.svg"));
      return new Response(new Uint8Array(fallbackBytes), {
        headers: {
          "Content-Type": "image/svg+xml",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }
  });
}

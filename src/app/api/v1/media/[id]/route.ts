import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { readImage } from "@/server/storage/media";
import { api, json } from "@/server/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
      },
    });
    if (!media) return json({ error: { code: "NOT_FOUND", message: "Image unavailable." } }, 404);
    const isPublic = media.deals.length > 0;
    if (!isPublic && !await getCurrentAuthContext()) return json({ error: { code: "NOT_FOUND", message: "Image unavailable." } }, 404);
    try {
      const buffer = await readImage(media.provider, media.storageKey);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": media.mimeType,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": isPublic ? "public, max-age=300" : "private, no-store",
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

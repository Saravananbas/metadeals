import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { readImage } from "@/server/storage/media";
import { api, json } from "@/server/http";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const { id } = await params; const db = getDatabase(); const media = await db.media.findUnique({ where: { id } });
    if (!media) return json({ error: { code: "NOT_FOUND", message: "Image unavailable." } }, 404);
    const visible = await db.deal.findFirst({ where: { mediaId: id, ...publicWhere(listingSchema.parse({})) }, select: { id: true } });
    if (!visible && !await getCurrentAuthContext()) return json({ error: { code: "NOT_FOUND", message: "Image unavailable." } }, 404);
    return new Response(new Uint8Array(await readImage(media.provider, media.storageKey)), { headers: { "Content-Type": media.mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  });
}

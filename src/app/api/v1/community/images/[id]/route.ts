import { getServerSession } from "next-auth";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { communityWrite, json } from "@/server/community/http";
import { readPostImage, removeStagedImage } from "@/server/community/composer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await removeStagedImage(customerId, (await params).id) }));

/** Published pictures are public. A member's own unpublished pictures are visible only to them. Always the re-encoded WebP. */
export async function GET(_request: Request, { params }: Context) {
  try {
    let customerId: string | null = null;
    try { customerId = (await getServerSession(getCustomerAuthOptions()))?.user?.id ?? null; } catch { customerId = null; }
    const { bytes, isPublic } = await readPostImage((await params).id, customerId);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": isPublic ? "public, max-age=300" : "private, no-store" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

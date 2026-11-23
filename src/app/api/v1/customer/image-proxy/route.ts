import { customerApi } from "@/server/customer/http";
import { proxyImage } from "@/server/customer/image-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Thumbnail of a picture from a product page, for the Post a Deal picker. Signed in members only. */
export const GET = (request: Request) => customerApi(request, async (customerId) => {
  const bytes = await proxyImage(customerId, new URL(request.url).searchParams.get("src") ?? "");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
});

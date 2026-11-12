import { readAvatar } from "@/server/customer/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public profile picture for a user name (only ever the small re-encoded square the member uploaded). */
export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  try {
    const bytes = await readAvatar((await params).handle);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

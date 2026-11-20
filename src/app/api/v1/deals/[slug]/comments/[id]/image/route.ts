import { readCommentImage } from "@/server/deals/comment-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Comment pictures are public like the comment itself; always served as WebP, never sniffed. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const bytes = await readCommentImage((await params).id);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

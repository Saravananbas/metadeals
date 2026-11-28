import { NextResponse } from "next/server";
import { notFound } from "next/navigation";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { resolveDealAddress } from "@/server/deals/seo-url-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Old single-part addresses: /deal/{slug} (and the short id form). The deal is found by its own record (slug, database id or public id), never by
 * similar-looking words, and the visitor is sent once, with a permanent 301, straight to its current address. Anything else is 404; a deleted deal is 410.
 * The target is built from the site's configured address, not from the request (behind the host's proxy the request shows an internal address).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await resolveDealAddress(getDatabase(), [slug], publicWhere(listingSchema.parse({})));
  if (result.kind === "redirect") {
    const target = new URL(result.to, getAuthEnv().NEXTAUTH_URL);
    target.search = new URL(request.url).search;
    return NextResponse.redirect(target, 301);
  }
  // "render" cannot normally happen here (every deal has a category); if a deal has no usable one it is held back, not shown under a wrong address.
  if (result.kind !== "gone") return notFound();
  return new NextResponse("This deal has been removed.", { status: 410, headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" } });
}

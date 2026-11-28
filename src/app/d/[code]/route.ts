import { NextResponse } from "next/server";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { usesMariaDb, findDealByCodeMariaDb } from "@/server/community/like-search";
import { DEAL_CODE_PATTERN } from "@/features/deals/short-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Short deal links: /d/3x9k2m1a opens the deal page. The code is the end of the deal id; only published or expired deals are found.
 * The redirect is built from the site's configured public address (never from the request, which behind the host's proxy shows an internal address)
 * and always stays on this site. Query parameters such as ?c=whatsapp are passed on.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const site = getAuthEnv().NEXTAUTH_URL;
  const go = (path: string) => NextResponse.redirect(new URL(path, site), 307);
  const { code } = await params;
  if (!DEAL_CODE_PATTERN.test(code)) return go("/");
  const deal = usesMariaDb()
    ? await findDealByCodeMariaDb(code)
    : await getDatabase().deal.findFirst({ where: { id: { endsWith: code }, status: { in: ["PUBLISHED", "EXPIRED"] } }, select: { id: true, slug: true, canonicalPath: true } });
  if (!deal) return go("/");
  const search = new URL(request.url).search;
  return go(`${deal.canonicalPath ?? `/deal/${encodeURIComponent(deal.slug)}`}${search}`);
}

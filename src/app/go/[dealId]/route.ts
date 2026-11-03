import { NextRequest } from "next/server";
import { getDatabase } from "@/server/db/client";
import { resolveDealRedirect, AffiliateError } from "@/server/affiliate/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const optionId = searchParams.get("option");
  const channel = searchParams.get("c") || searchParams.get("channel") || "web";

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "127.0.0.1";
  const userAgent = request.headers.get("user-agent") || "";
  const prefetch = request.headers.get("purpose") || request.headers.get("sec-purpose");

  const db = getDatabase();

  try {
    const result = await resolveDealRedirect(db, dealId, optionId, {
      ip,
      userAgent,
      prefetch,
      channel,
    });

    const response = Response.redirect(result.destinationUrl, 302);
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  } catch (error) {
    if (error instanceof AffiliateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Redirection failed." }, { status: 500 });
  }
}


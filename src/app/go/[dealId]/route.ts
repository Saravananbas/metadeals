import { NextRequest } from "next/server";
import { getDatabase } from "@/server/db/client";
import { resolveDealRedirect, AffiliateError } from "@/server/affiliate/service";
import { recordBuyClick, SESSION_COOKIE } from "@/server/analytics/collector";

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
    if (result.loggedClick) {
      await recordBuyClick({ dealId: result.dealId, merchantId: result.merchantId, channel, ip, userAgent, sessionCookie: request.cookies.get(SESSION_COOKIE)?.value ?? null });
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: result.destinationUrl,
        "Cache-Control": "no-store, private",
        "X-Robots-Tag": "noindex, nofollow",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  } catch (error) {
    const status = error instanceof AffiliateError ? error.status : 500;
    const message = error instanceof AffiliateError ? error.message : "Redirection failed.";

    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/html")) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Offer Unavailable — MetaDeals4U</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--md-color-page, white); color: var(--md-color-text, black); display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
    .card { background: var(--md-color-surface, white); border: 1px solid var(--md-color-border, lightgray); border-radius: 16px; padding: 40px 32px; max-width: 480px; width: 100%; text-align: center; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; color: var(--md-color-text, black); }
    p { font-size: 15px; color: var(--md-color-text-muted, gray); margin: 0 0 24px 0; line-height: 1.5; }
    a { display: inline-block; background: var(--md-color-primary, indigo); color: var(--md-color-primary-contrast, white); text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 10px; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Offer Unavailable</h1>
    <p>${message}</p>
    <a href="/">Browse All Deals on MetaDeals4U</a>
  </div>
</body>
</html>`;
      return new Response(html, {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, private",
          "X-Robots-Tag": "noindex, nofollow",
        },
      });
    }

    return Response.json({ error: message }, { status });
  }
}


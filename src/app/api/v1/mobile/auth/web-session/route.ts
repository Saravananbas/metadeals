import { encode } from "next-auth/jwt";
import { getAuthEnv } from "@/config/env";
import { hashOpaqueToken } from "@/server/auth/crypto";
import { bearerOf, customerIdFromAppToken } from "@/server/customer/app-tokens";
import { customerErrorResponse } from "@/server/customer/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAYS_30 = 30 * 86400;

/**
 * GET /api/v1/mobile/auth/web-session?next=/path   (Authorization: Bearer <app token>)
 * Lets the app's web view (forum, post a deal, profile) share the native sign-in: the app token, sent in a header (never in the address),
 * is exchanged for the website's own customer session cookie, then the browser is sent to a path on this site.
 */
export async function GET(request: Request) {
  try {
    const token = bearerOf(request);
    if (!token) return Response.json({ error: "Please sign in to continue." }, { status: 401 });
    const customerId = await customerIdFromAppToken(token);
    const env = getAuthEnv(), secure = env.NEXTAUTH_URL.startsWith("https://");
    const jwt = await encode({ token: { customerId, remember: true }, secret: hashOpaqueToken("customer-nextauth", env.NEXTAUTH_SECRET), maxAge: DAYS_30 });
    const wanted = new URL(request.url).searchParams.get("next") ?? "/";
    // Only a path on this site: no other host, no "//host" or backslash tricks.
    const next = /^\/(?![/\\])[\w\-./?=&%]*$/.test(wanted) ? wanted : "/";
    const cookie = `${secure ? "__Secure-" : ""}md-customer-session=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS_30}${secure ? "; Secure" : ""}`;
    return new Response(null, { status: 302, headers: { Location: next, "Set-Cookie": cookie, "Cache-Control": "no-store" } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}

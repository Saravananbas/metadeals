import { NextResponse, type NextRequest } from "next/server";
import { clientIpFromHeaders } from "@/server/client-ip";
import { allowList, allowed } from "@/server/ip-allow";

const clientIp = (request: NextRequest) => clientIpFromHeaders(request.headers) ?? "";

const isLoopback = (ip: string) => ip === "" || ip === "::1" || ip === "127.0.0.1";

export function proxy(request: NextRequest) {
  const rules = allowList();
  const ip = clientIp(request);
  // Working on your own computer (development) never needs the list.
  if (!rules.length || allowed(ip, rules) || (process.env.NODE_ENV !== "production" && isLoopback(ip))) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page is not available</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:Canvas;color:CanvasText"><main style="text-align:center;padding:24px"><h1 style="margin:0 0 8px;font-size:28px">Page is not available</h1><p style="margin:0;opacity:.7">The page you are looking for does not exist or is not available.</p></main></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/admin/:path*", "/api/v1/admin/:path*", "/api/admin/:path*", "/api/auth/login", "/api/auth/logout", "/api/auth/setup/:path*", "/api/auth/password-reset/:path*"],
};

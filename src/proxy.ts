import { NextResponse, type NextRequest } from "next/server";
import { clientIpFromHeaders } from "@/server/client-ip";

/**
 * The admin portal (pages, login and its APIs) can be limited to a few IP addresses.
 * ADMIN_ALLOWED_IPS is a comma-separated list, for example "203.0.113.7,198.51.100.0/24".
 * Left empty, nothing is restricted (local development). Anyone else gets the same "page not available" answer as a missing page.
 */
const allowList = () => (process.env.ADMIN_ALLOWED_IPS ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);

const clientIp = (request: NextRequest) => clientIpFromHeaders(request.headers) ?? "";

/** IPv4 or IPv6 text to a number, or null if it is not an address. */
function ipToBig(ip: string): { value: bigint; bits: 32 | 128 } | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((n) => n >= 0 && n <= 255) ? { value: parts.reduce((acc, n) => (acc << 8n) | BigInt(n), 0n), bits: 32 } : null;
  }
  if (!/^[0-9a-f:]+$/.test(ip) || (ip.match(/::/g) ?? []).length > 1) return null;
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [], right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (ip.includes("::") ? missing < 1 : missing !== 0) return null;
  const groups = [...left, ...Array(ip.includes("::") ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return { value: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n), bits: 128 };
}

function allowed(ip: string, rules: string[]) {
  const visitor = ipToBig(ip);
  return rules.some((rule) => {
    if (!rule.includes("/")) { const r = ipToBig(rule); return Boolean(visitor && r && visitor.bits === r.bits && visitor.value === r.value) || rule === ip; }
    const [base, bitsText] = rule.split("/");
    const range = ipToBig(base), prefix = Number(bitsText);
    if (!visitor || !range || visitor.bits !== range.bits || !Number.isInteger(prefix) || prefix < 0 || prefix > range.bits) return false;
    const shift = BigInt(range.bits - prefix);
    return visitor.value >> shift === range.value >> shift;
  });
}

const isLoopback = (ip: string) => ip === "" || ip === "::1" || ip === "127.0.0.1";

export function proxy(request: NextRequest) {
  const rules = allowList();
  const ip = clientIp(request);
  // Working on your own computer (development) never needs the list.
  if (!rules.length || allowed(ip, rules) || (process.env.NODE_ENV !== "production" && isLoopback(ip))) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page is not available</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f4f2fb;color:#1f1b3a"><main style="text-align:center;padding:24px"><h1 style="margin:0 0 8px;font-size:28px">Page is not available</h1><p style="margin:0;color:#5b5778">The page you are looking for does not exist or is not available.</p></main></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export const config = {
  matcher: ["/admin/:path*", "/api/v1/admin/:path*", "/api/admin/:path*", "/api/auth/login", "/api/auth/logout", "/api/auth/setup/:path*", "/api/auth/password-reset/:path*"],
};

import { timingSafeEqual } from "node:crypto";
import { addressBucket, clientIpFromHeaders } from "@/server/client-ip";
import { adminAccessFor } from "@/server/ip-allow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const secretMatches = (given: string | null, expected: string) => {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Operator check for the hosting proxy (docs/security/HOSTINGER_PROXY_VALIDATION.md). Guarded by the same secret as the nightly job (header `x-cron-secret`),
 * so it can be called from a script without signing in. It reports what the app receives and how the admin address rule decides; it never returns secrets or the allow-list itself.
 * `?as=<address>` asks how the admin rule would treat a hypothetical address (for example a stranger's) without changing anything.
 */
export async function GET(request: Request) {
  const expected = process.env.ANALYTICS_CRON_SECRET;
  if (!expected || expected.length < 24) return Response.json({ ok: false, error: "Not configured." }, { status: 503 });
  if (!secretMatches(request.headers.get("x-cron-secret"), expected)) return Response.json({ ok: false }, { status: 401 });
  const proxyHeaders: Record<string, string> = {};
  request.headers.forEach((value, name) => { if (/^(x-forwarded-|x-real-ip|forwarded$|via$|cf-|x-client-ip|true-client-ip|x-original-|x-envoy)/i.test(name)) proxyHeaders[name] = value.slice(0, 200); });
  const ip = clientIpFromHeaders(request.headers);
  const as = new URL(request.url).searchParams.get("as");
  return Response.json({
    ok: true,
    proxyHeadersSeen: proxyHeaders,
    forwardedForEntries: (request.headers.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean),
    trustedProxyHops: Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1,
    clientIpUsed: ip,
    rateLimitBucket: addressBucket(ip),
    protocolSeenByProxy: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
    adminRuleForThisClient: ip ? adminAccessFor(ip) : "unknown-address",
    ...(as ? { adminRuleForHypotheticalAddress: { address: as.slice(0, 60), decision: adminAccessFor(as.trim().toLowerCase()) } } : {}),
    nodeEnv: process.env.NODE_ENV,
  }, { headers: { "Cache-Control": "no-store" } });
}

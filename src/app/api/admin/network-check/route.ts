import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { clientIpFromHeaders } from "@/server/client-ip";

export const dynamic = "force-dynamic";

/**
 * Staff-only: shows what the app sees about the connection, so the hosting proxy's behaviour can be checked from the real site
 * (see docs/security/INFRASTRUCTURE_RUNBOOKS.md). No secrets are returned.
 */
export async function GET(request: Request) {
  const context = await getCurrentAuthContext();
  if (!context) return Response.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!roleCan(context.user.role, "operations:read")) return Response.json({ error: "Permission denied." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  return Response.json({
    clientIpUsed: clientIpFromHeaders(request.headers),
    forwardedForEntries: forwarded,
    trustedProxyHops: Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1,
    xRealIp: request.headers.get("x-real-ip"),
    protocolSeenByProxy: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
    adminIpAllowListConfigured: Boolean((process.env.ADMIN_ALLOWED_IPS ?? "").trim()),
    nodeEnv: process.env.NODE_ENV,
  }, { headers: { "Cache-Control": "no-store" } });
}

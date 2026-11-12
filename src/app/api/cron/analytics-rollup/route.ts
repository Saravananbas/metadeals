import { timingSafeEqual } from "node:crypto";
import { runAnalyticsRollup } from "@/server/analytics/rollup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Nightly job called by an hPanel cron job: POST with header `x-cron-secret: <ANALYTICS_CRON_SECRET>`. */
export async function POST(request: Request) {
  const expected = process.env.ANALYTICS_CRON_SECRET;
  if (!expected || expected.length < 24) return Response.json({ ok: false, error: "Rollup is not configured." }, { status: 503 });
  if (!secretMatches(request.headers.get("x-cron-secret"), expected)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runAnalyticsRollup()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("analytics rollup failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ ok: false }, { status: 500 });
  }
}

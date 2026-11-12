import { isRedisConfigured } from "@/config/env";
import { checkReadiness } from "@/features/health/service";
import { getDatabase } from "@/server/db/client";
import { createRedisProbe } from "@/server/redis/client";
import { logger } from "@/server/logging/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  const result = await checkReadiness({
    database: async () => { await getDatabase().$queryRaw`SELECT 1`; },
    redis: async () => {
      if (!isRedisConfigured()) return;
      const client = createRedisProbe();
      try {
        await client.connect();
        await client.ping();
      } finally {
        client.disconnect();
      }
    },
  });
  if (!result.ready) logger.warn({ requestId, checks: result.checks }, "Readiness check failed");
  return Response.json(
    { status: result.status, checks: result.checks, requestId },
    { status: result.ready ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}

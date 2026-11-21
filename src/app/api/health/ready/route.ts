import { isRedisConfigured } from "@/config/env";
import { checkReadiness } from "@/features/health/service";
import { databaseFailure } from "@/features/health/database-failure";
import { getDatabase } from "@/server/db/client";
import { createRedisProbe } from "@/server/redis/client";
import { logger } from "@/server/logging/logger";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  const result = await checkReadiness({
    database: async () => {
      try { await getDatabase().$queryRaw`SELECT 1`; } catch (error) {
        const databaseReason = databaseFailure(error);
        logger.warn({ requestId, reason: databaseReason, errorType: error instanceof Error ? error.name : "Unknown", errorMessage: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) }, "Database check failed");
        throw error;
      }
    },
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

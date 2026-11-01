import "server-only";
import Redis from "ioredis";
import { getRedisEnv } from "@/config/env";
import { logger } from "@/server/logging/logger";

/** Short-lived bounded connection for API readiness, not a worker connection. */
export function createRedisProbe() {
  const client = new Redis(getRedisEnv().REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  client.on("error", () => logger.warn({ dependency: "redis" }, "Redis connection failed"));
  return client;
}

import "server-only";
import type { ConnectionOptions } from "bullmq";
import { getRedisEnv } from "@/config/env";

/** Configuration only. No queues, jobs or workers run in M0. */
export function getQueueConnection(role: "producer" | "worker"): ConnectionOptions {
  const url = new URL(getRedisEnv().REDIS_URL);
  const db = url.pathname.slice(1) || "0";
  if (!/^\d+$/.test(db)) throw new Error("REDIS_URL must contain a numeric database index");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: Number(db),
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: role === "worker" ? null : 1,
    enableOfflineQueue: role === "worker",
    connectTimeout: 3000,
  };
}

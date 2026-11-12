import type { ConnectionOptions } from "bullmq";
import { getRedisEnv } from "@/config/env";

export const QUEUE_NAMES = {
  SOURCE_SCRAPE: "source-scrape-queue",
  DEAL_DISCOVERY: "deal-discovery-queue",
  DEAL_LIFECYCLE: "deal-lifecycle-queue",
  COMPETITOR_SHADOW: "competitor-shadow-queue",
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export interface ScrapeJobPayload {
  sourceId: string;
  sourceType: "RETAILER" | "COMPETITOR";
  category?: string;
  triggeredBy: string;
  timestamp: number;
}

export interface DiscoveryJobPayload {
  candidateId: string;
  offerData: {
    sourceId: string;
    productName: string;
    brand: string;
    productUrl: string;
    mrpPaise: number;
    sellingPricePaise: number;
    isAvailable: boolean;
  };
  observedAt: number;
}

export interface LifecycleJobPayload {
  dealId: string;
  action: "CHECK_STOCK" | "REVERIFY_PRICE" | "CHECK_EXPIRY";
  scheduledAt: number;
}

export interface ShadowJobPayload {
  competitorSource: string;
  productUrl: string;
  pricePaise: number;
  mrpPaise: number;
  observedAt: number;
}

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

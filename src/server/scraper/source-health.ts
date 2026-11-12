import { getDatabase } from "@/server/db/client";

export type SourceType = "RETAILER" | "COMPETITOR";

export interface NormalizedOfferContract {
  sourceId: string;
  sourceType: SourceType;
  productName: string;
  brand: string;
  modelOrVariantId?: string;
  productUrl: string;
  imageUrl?: string;
  seller?: string;
  mrpPaise: number;
  sellingPricePaise: number;
  couponPricePaise?: number;
  bankOfferPaise?: number;
  deliveryFeePaise?: number;
  isAvailable: boolean;
  category?: string;
  extractedAt: Date;
  extractionMethod: "OFFICIAL_API" | "FEED_RSS" | "STRUCTURED_DATA" | "HTML" | "BROWSER" | "MOCK";
  evidenceReference?: string;
}

export class SourceHealthManager {
  private static readonly FAILURE_THRESHOLD = 5;

  /**
   * Evaluates if a connector is healthy or circuit-broken.
   */
  async canExecute(connectorCode: string): Promise<{ allowed: boolean; reason?: string }> {
    const db = getDatabase();
    const record = await db.sourceHealthRecord.findUnique({
      where: { connectorCode },
    });

    if (!record) {
      return { allowed: true };
    }

    if (record.state === "SUSPENDED") {
      return {
        allowed: false,
        reason: `CIRCUIT_BREAKER_TRIGGERED: Connector ${connectorCode} suspended due to ${record.consecutiveFailures} consecutive failures.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Records a successful execution run for a connector.
   */
  async recordSuccess(connectorCode: string): Promise<void> {
    const db = getDatabase();
    await db.sourceHealthRecord.upsert({
      where: { connectorCode },
      create: {
        connectorCode,
        state: "HEALTHY",
        totalRequests: 1,
        successfulRequests: 1,
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
      },
      update: {
        state: "HEALTHY",
        totalRequests: { increment: 1 },
        successfulRequests: { increment: 1 },
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
      },
    });
  }

  /**
   * Records a failed extraction or network outage.
   * Scraper timeouts/network errors increment failures and trigger circuit breaker if threshold is met.
   * Note: Scraper failure represents UNKNOWN status, never product unavailability!
   */
  async recordFailure(connectorCode: string, reason: string): Promise<void> {
    const db = getDatabase();
    const existing = await db.sourceHealthRecord.findUnique({ where: { connectorCode } });
    const consecutive = (existing?.consecutiveFailures ?? 0) + 1;
    const newState = consecutive >= SourceHealthManager.FAILURE_THRESHOLD ? "SUSPENDED" : "DEGRADED";

    await db.sourceHealthRecord.upsert({
      where: { connectorCode },
      create: {
        connectorCode,
        state: newState,
        totalRequests: 1,
        successfulRequests: 0,
        consecutiveFailures: 1,
        lastFailureAt: new Date(),
        lastFailureReason: reason.slice(0, 500),
      },
      update: {
        state: newState,
        totalRequests: { increment: 1 },
        consecutiveFailures: { increment: 1 },
        lastFailureAt: new Date(),
        lastFailureReason: reason.slice(0, 500),
      },
    });
  }

  /**
   * Manually resets a circuit-broken connector back to HEALTHY.
   */
  async resetCircuitBreaker(connectorCode: string): Promise<void> {
    const db = getDatabase();
    await db.sourceHealthRecord.updateMany({
      where: { connectorCode },
      data: {
        state: "HEALTHY",
        consecutiveFailures: 0,
      },
    });
  }
}

export const sourceHealthManager = new SourceHealthManager();


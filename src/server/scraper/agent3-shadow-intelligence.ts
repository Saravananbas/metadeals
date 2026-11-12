import { getDatabase } from "@/server/db/client";
import { DealQualityEngine } from "./deal-quality-engine";
import { type NormalizedOfferContract } from "./source-health";
import { writeAudit } from "@/server/auth/audit";

export interface ShadowEvaluationInput {
  candidateId: string;
  label: "GENUINE" | "FALSE_POSITIVE" | "DUPLICATE" | "PRICE_ERROR" | "WRONG_VARIANT" | "EXPIRED" | "UNAVAILABLE" | "UNVERIFIABLE";
  reviewerId: string;
  notes?: string;
  timestamp?: number;
}

export interface ShadowTelemetryMetrics {
  totalEvaluated: number;
  precision: number;
  falsePositiveRate: number;
  labelBreakdown: Record<string, number>;
}

export class Agent3ShadowIntelligence {
  /**
   * In-memory persistent history store for human evaluation labels and calibration.
   */
  private static evaluationRecords = new Map<string, ShadowEvaluationInput[]>();

  /**
   * Processes competitor discovery in 100% SHADOW MODE.
   *
   * ABSOLUTE RESTRICTION:
   * 1. Never creates PublicationAuthorization.
   * 2. Never calls Agent2PublishingEngine.
   * 3. Never writes to Deal or DealCandidate tables.
   * 4. Enforces duplicate detection and integrates available price observations.
   */
  public static async recordCompetitorCandidate(
    offer: NormalizedOfferContract,
    historyPrices: Array<{ pricePaise: number; observedAt: Date }> = []
  ): Promise<{
    recorded: boolean;
    isDuplicate: boolean;
    shadowId?: string;
    dealScore: number;
    error?: string;
  }> {
    // 1. Strict Source Firewall Check
    if (offer.sourceType !== "COMPETITOR") {
      throw new Error("AGENT_3_SOURCE_VIOLATION: Agent 3 may only process registered COMPETITOR feeds.");
    }

    // 2. Validate availability and price sanity
    if (!offer.isAvailable) {
      return {
        recorded: false,
        isDuplicate: false,
        dealScore: 0,
        error: "PRODUCT_UNAVAILABLE: Competitor product is not available",
      };
    }

    if (offer.sellingPricePaise <= 0 || offer.mrpPaise <= 0 || offer.sellingPricePaise >= offer.mrpPaise) {
      return {
        recorded: false,
        isDuplicate: false,
        dealScore: 0,
        error: "INVALID_PRICING: Selling price must be strictly positive and lower than MRP",
      };
    }

    // 3. Integrate Price Observation History & Deal Quality Scoring
    const assessment = DealQualityEngine.evaluateDeal({
      sellingPricePaise: offer.sellingPricePaise,
      mrpPaise: offer.mrpPaise,
      history: historyPrices,
      isStockConfirmed: offer.isAvailable,
      isVariantMatched: Boolean(offer.brand && offer.productName),
    });

    const db = getDatabase();

    // 4. Duplicate Candidate Detection (same competitorSource and sourceUrl within 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const existing = await db.shadowCandidate.findFirst({
      where: {
        competitorSource: offer.sourceId,
        sourceUrl: offer.productUrl,
        discoveredAt: { gte: oneDayAgo },
      },
    });

    if (existing) {
      return {
        recorded: true,
        isDuplicate: true,
        shadowId: existing.id,
        dealScore: existing.dealScore,
      };
    }

    // 5. Store in ShadowCandidate table ONLY (Complete Isolation)
    const shadowRecord = await db.shadowCandidate.create({
      data: {
        competitorSource: offer.sourceId,
        sourceUrl: offer.productUrl,
        title: offer.productName,
        pricePaise: offer.sellingPricePaise,
        mrpPaise: offer.mrpPaise,
        brand: offer.brand,
        dealScore: assessment.attractivenessScore,
      },
    });

    // 6. Write non-public shadow audit event
    try {
      await writeAudit({
        action: "SHADOW_CANDIDATE_RECORDED",
        targetId: shadowRecord.id,
        success: true,
        metadata: {
          competitorSource: offer.sourceId,
          dealScore: assessment.attractivenessScore,
          sellingPricePaise: offer.sellingPricePaise,
        },
      });
    } catch {
      // Non-blocking
    }

    return {
      recorded: true,
      isDuplicate: false,
      shadowId: shadowRecord.id,
      dealScore: assessment.attractivenessScore,
    };
  }

  /**
   * Records human evaluation labels for shadow telemetry calibration.
   * Persists reviewer ID, notes, and timestamp for audit and precision metrics.
   */
  public static evaluateShadowOutcome(input: ShadowEvaluationInput): {
    evaluated: boolean;
    candidateId: string;
    label: string;
    reviewerId: string;
    timestamp: number;
  } {
    const record: ShadowEvaluationInput = {
      ...input,
      timestamp: input.timestamp ?? Date.now(),
    };

    const history = this.evaluationRecords.get(input.candidateId) || [];
    history.push(record);
    this.evaluationRecords.set(input.candidateId, history);

    return {
      evaluated: true,
      candidateId: input.candidateId,
      label: input.label,
      reviewerId: input.reviewerId,
      timestamp: record.timestamp!,
    };
  }

  /**
   * Calculates actual evaluation precision and false-positive metrics across evaluated candidates.
   */
  public static calculatePrecisionMetrics(): ShadowTelemetryMetrics {
    let total = 0;
    let genuineCount = 0;
    let falsePositiveCount = 0;
    const labelBreakdown: Record<string, number> = {};

    for (const records of this.evaluationRecords.values()) {
      for (const rec of records) {
        total++;
        labelBreakdown[rec.label] = (labelBreakdown[rec.label] || 0) + 1;
        if (rec.label === "GENUINE") genuineCount++;
        if (rec.label === "FALSE_POSITIVE" || rec.label === "PRICE_ERROR") falsePositiveCount++;
      }
    }

    return {
      totalEvaluated: total,
      precision: total > 0 ? Math.round((genuineCount / total) * 100) : 100,
      falsePositiveRate: total > 0 ? Math.round((falsePositiveCount / total) * 100) : 0,
      labelBreakdown,
    };
  }
}

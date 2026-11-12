import { getDatabase } from "@/server/db/client";
import { connectorRegistry } from "@/server/scraper/connectors/registry";
import { sourceHealthManager } from "@/server/scraper/source-health";
import { Agent1DealHunter } from "@/server/scraper/agent1-deal-hunter";
import { isRedisConfigured } from "@/config/env";
import { QueueProducers } from "@/server/queue/producers";
import { recordPriceObservation } from "@/server/scraper/price-history";
import { logger } from "@/server/logging/logger";
import { writeAudit } from "@/server/auth/audit";
import type { RetailerProductListing } from "@/server/scraper/types";
import type { NormalizedOfferContract } from "@/server/scraper/source-health";

export interface IngestionResult {
  sourceCode: string;
  totalDiscovered: number;
  processedCount: number;
  candidatesCreated: number;
  priceObservationsRecorded: number;
  heldForReviewCount: number;
  errors: string[];
}

export class IngestionService {
  /**
   * Orchestrates complete ingestion cycle for an eligible retailer connector.
   * STRICT SAFETY BOUNDARY:
   * 1. Never publishes deals.
   * 2. Agent 2 is NOT called.
   * 3. Distinct variants are NEVER merged.
   * 4. Unknown/error scraper results NEVER mark items out-of-stock.
   */
  public static async runConnectorIngestion(sourceCode: string): Promise<IngestionResult> {
    const result: IngestionResult = {
      sourceCode,
      totalDiscovered: 0,
      processedCount: 0,
      candidatesCreated: 0,
      priceObservationsRecorded: 0,
      heldForReviewCount: 0,
      errors: [],
    };

    // 1. Resolve Connector from Registry
    const connector = connectorRegistry.get(sourceCode);
    if (!connector) {
      result.errors.push(`CONNECTOR_NOT_FOUND: No registered connector for code ${sourceCode}`);
      return result;
    }

    // 2. Check Source Health Circuit Breaker
    const health = await sourceHealthManager.canExecute(sourceCode);
    if (!health.allowed) {
      result.errors.push(`SOURCE_SUSPENDED: ${health.reason}`);
      return result;
    }

    // 3. Discover Listings from Connector (Handles timeout/error without classifying as OOS)
    let listings: RetailerProductListing[] = [];
    try {
      listings = await connector.discoverListings();
      await sourceHealthManager.recordSuccess(sourceCode);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Scraper network failure or timeout";
      await sourceHealthManager.recordFailure(sourceCode, msg);
      result.errors.push(`EXTRACTION_FAILED: ${msg} (Classified as UNKNOWN, never OUT_OF_STOCK)`);
      return result;
    }

    result.totalDiscovered = listings.length;
    const db = getDatabase();

    // 4. Process each listing through normalization, identity matching, price logging, and Agent 1
    for (const listing of listings) {
      try {
        await this.processSingleListing(db, listing, sourceCode, result);
        result.processedCount++;
      } catch (err: unknown) {
        const errorDetail = err instanceof Error ? err.message : "Processing error";
        result.errors.push(`ITEM_FAILED [${listing.sourceUrl}]: ${errorDetail}`);
        logger.error({ url: listing.sourceUrl, error: errorDetail }, "Ingestion item failure");
      }
    }

    // 5. Audit Log Ingestion Batch Run
    try {
      await writeAudit({
        action: "RETAILER_INGESTION_COMPLETED",
        targetId: sourceCode,
        success: result.errors.length === 0,
        metadata: {
          totalDiscovered: result.totalDiscovered,
          candidatesCreated: result.candidatesCreated,
          priceObservationsRecorded: result.priceObservationsRecorded,
          heldForReview: result.heldForReviewCount,
        },
      });
    } catch {
      // Non-blocking
    }

    return result;
  }

  /**
   * Processes a single normalized listing.
   */
  private static async processSingleListing(
    db: ReturnType<typeof getDatabase>,
    listing: RetailerProductListing,
    sourceCode: string,
    result: IngestionResult
  ): Promise<void> {
    // A. Sanity & Data Quality Gates
    if (listing.observedPriceMinor <= 0 || listing.observedMrpMinor <= 0) {
      throw new Error("INVALID_PRICING: Selling price and MRP must be positive integers");
    }
    if (listing.observedPriceMinor >= listing.observedMrpMinor) {
      throw new Error("NO_DISCOUNT: Selling price must be strictly less than MRP");
    }
    if (!listing.rawTitle || listing.rawTitle.trim().length < 5) {
      throw new Error("INVALID_TITLE: Product title must have at least 5 characters");
    }

    // B. Product Identity & Variant Deduplication
    // Check if DealCandidate exists for this retailer platform and external ID
    let candidate = listing.externalId
      ? await db.dealCandidate.findFirst({
          where: {
            sourcePlatform: listing.sourcePlatform,
            externalId: listing.externalId,
          },
        })
      : await db.dealCandidate.findFirst({
          where: { sourceUrl: listing.sourceUrl },
        });

    if (!candidate) {
      const discountPercent = Math.round(
        ((listing.observedMrpMinor - listing.observedPriceMinor) / listing.observedMrpMinor) * 100
      );

      candidate = await db.dealCandidate.create({
        data: {
          sourceUrl: listing.sourceUrl,
          sourcePlatform: listing.sourcePlatform,
          externalId: listing.externalId,
          rawTitle: listing.rawTitle,
          brand: listing.brand || "Brand",
          categorySlug: listing.categorySlug || "electronics",
          observedPriceMinor: listing.observedPriceMinor,
          observedMrpMinor: listing.observedMrpMinor,
          currency: listing.currency || "INR",
          discountPercent,
          imageUrl: listing.imageUrl,
          sellerName: listing.sellerName,
          inStock: listing.inStock,
          confidenceScore: 0,
        },
      });
      result.candidatesCreated++;
    } else {
      // Update existing candidate price observations if price moved
      if (
        candidate.observedPriceMinor !== listing.observedPriceMinor ||
        candidate.inStock !== listing.inStock
      ) {
        candidate = await db.dealCandidate.update({
          where: { id: candidate.id },
          data: {
            observedPriceMinor: listing.observedPriceMinor,
            observedMrpMinor: listing.observedMrpMinor,
            inStock: listing.inStock,
            updatedAt: new Date(),
          },
        });
      }
    }

    // C. Append-only Price Observation Record
    await recordPriceObservation(db, {
      merchantSlug: listing.sourcePlatform.toLowerCase().replace(/[^\w-]/g, ""),
      priceMinor: listing.observedPriceMinor,
      mrpMinor: listing.observedMrpMinor,
      sourceUrl: listing.sourceUrl,
      currency: listing.currency || "INR",
      candidateId: candidate.id,
    });
    result.priceObservationsRecorded++;

    // D. Fetch historical observations for 90-day baseline
    const pastObservations = await db.priceObservation.findMany({
      where: { candidateId: candidate.id },
      orderBy: { observedAt: "desc" },
      take: 20,
    });
    const historyPrices = pastObservations.map((o) => ({
      pricePaise: o.priceMinor,
      observedAt: o.observedAt,
    }));

    // E. Normalized Contract for Agent 1 Quality Assessment
    const normalizedContract: NormalizedOfferContract = {
      sourceId: sourceCode,
      sourceType: "RETAILER",
      productName: listing.rawTitle,
      brand: listing.brand || "Brand",
      modelOrVariantId: listing.externalId,
      productUrl: listing.sourceUrl,
      imageUrl: listing.imageUrl,
      seller: listing.sellerName,
      mrpPaise: listing.observedMrpMinor,
      sellingPricePaise: listing.observedPriceMinor,
      isAvailable: listing.inStock,
      category: listing.categorySlug,
      extractedAt: new Date(),
      extractionMethod: listing.isMockOrFixture ? "MOCK" : "OFFICIAL_API",
    };

    // F. Agent 1 Deal Quality Assessment
    const assessment = await Agent1DealHunter.processDiscoveredOffer(
      normalizedContract,
      historyPrices
    );

    if (assessment.route === "AWAITING_APPROVAL") {
      // Enqueue to discovery queue for review & mobile notification
      if (isRedisConfigured()) await QueueProducers.enqueueDiscoveryJob({
        candidateId: candidate.id,
        offerData: {
          sourceId: sourceCode,
          productName: listing.rawTitle,
          brand: listing.brand || "Brand",
          productUrl: listing.sourceUrl,
          mrpPaise: listing.observedMrpMinor,
          sellingPricePaise: listing.observedPriceMinor,
          isAvailable: listing.inStock,
        },
        observedAt: Date.now(),
      });
    } else {
      result.heldForReviewCount++;
    }
  }
}


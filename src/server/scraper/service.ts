import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  candidateInputSchema,
  calculateDiscountPercent,
  type CandidateInput,
  type CandidateReviewAction,
} from "@/features/scraper/validation";
import { verifyCandidate } from "./verification";
import { getPriceReferenceStats, recordPriceObservation } from "./price-history";
import { publishVerifiedCandidate } from "./publishing";
import { connectorRegistry } from "./connectors/registry";

export type DatabaseClient = Prisma.TransactionClient;

export class ScraperService {
  /**
   * Ingests a discovered deal candidate. Applies price observation, verification gates,
   * anomaly detection, and triggers auto-publishing if VERIFIED or review queue if UNCERTAIN.
   */
  async ingestCandidate(db: DatabaseClient, raw: unknown) {
    const input: CandidateInput = candidateInputSchema.parse(raw);
    const discountPercent = calculateDiscountPercent(
      input.observedMrpMinor,
      input.observedPriceMinor
    );

    // 1. Fetch historical price stats for this retailer/product
    const merchantSlug = input.sourcePlatform.toLowerCase().replace(/[^\w-]/g, "");
    const priceStats = await getPriceReferenceStats(db, { merchantSlug });

    // 2. Run deterministic verification rules
    const verification = verifyCandidate(input, priceStats);

    // 3. Create Candidate record
    const candidate = await db.dealCandidate.create({
      data: {
        sourceUrl: input.sourceUrl,
        sourcePlatform: input.sourcePlatform,
        externalId: input.externalId,
        rawTitle: input.rawTitle,
        brand: input.brand,
        categorySlug: input.categorySlug,
        observedPriceMinor: input.observedPriceMinor,
        observedMrpMinor: input.observedMrpMinor,
        currency: input.currency,
        discountPercent,
        imageUrl: input.imageUrl,
        sellerName: input.sellerName,
        inStock: input.inStock,
        confidenceScore: verification.confidenceScore,
        status: verification.status,
        rejectionReason: verification.rejectionReason,
        rawData: input.rawData,
      },
    });

    // 4. Record raw price observation
    await recordPriceObservation(db, {
      merchantSlug,
      priceMinor: input.observedPriceMinor,
      mrpMinor: input.observedMrpMinor,
      sourceUrl: input.sourceUrl,
      currency: input.currency,
      candidateId: candidate.id,
    });

    // 5. Automatic Publication Policy:
    // If VERIFIED -> immediately publish to the live site
    if (verification.status === "VERIFIED") {
      const deal = await publishVerifiedCandidate(db, candidate.id);
      return {
        candidate: await db.dealCandidate.findUnique({ where: { id: candidate.id } }),
        deal,
        outcome: "PUBLISHED" as const,
      };
    }

    // If UNCERTAIN -> routed to admin review queue
    // If REJECTED -> rejected without publishing
    return {
      candidate,
      deal: null,
      outcome: verification.status,
    };
  }

  /**
   * Admin reviews an uncertain candidate (approves to publish, or rejects).
   */
  async reviewCandidate(
    db: DatabaseClient,
    candidateId: string,
    action: CandidateReviewAction,
    actorId: string
  ) {
    const candidate = await db.dealCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new Error(`Candidate ${candidateId} not found.`);
    }

    if (action.action === "APPROVE") {
      const deal = await publishVerifiedCandidate(db, candidate.id, actorId);
      return {
        candidate: await db.dealCandidate.findUnique({ where: { id: candidate.id } }),
        deal,
        status: "APPROVED_AND_PUBLISHED",
      };
    }

    const updated = await db.dealCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "REJECTED",
        rejectionReason: action.reason || "Rejected by administrator review.",
        updatedAt: new Date(),
      },
    });

    return {
      candidate: updated,
      deal: null,
      status: "REJECTED",
    };
  }

  /**
   * Executes a scan for a specific connector and ingests discovered listings.
   */
  async runConnectorScan(db: DatabaseClient, connectorCode: string) {
    const connector = connectorRegistry.get(connectorCode);
    if (!connector) {
      throw new Error(`Connector ${connectorCode} not found.`);
    }

    const job = await db.scraperJob.create({
      data: {
        connectorCode,
        status: "RUNNING",
      },
    });

    try {
      const listings = await connector.discoverListings();
      let itemsVerified = 0;
      let itemsPublished = 0;

      for (const listing of listings) {
        const result = await this.ingestCandidate(db, listing);
        if (result.outcome === "PUBLISHED") {
          itemsVerified++;
          itemsPublished++;
        }
      }

      const completed = await db.scraperJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          itemsFound: listings.length,
          itemsVerified,
          itemsPublished,
          completedAt: new Date(),
        },
      });

      return completed;
    } catch (err) {
      const failed = await db.scraperJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        },
      });
      return failed;
    }
  }

  /**
   * Lists candidates with pagination and optional status filter.
   */
  async listCandidates(
    db: DatabaseClient,
    options: {
      status?: "DISCOVERED" | "VALIDATING" | "VERIFIED" | "UNCERTAIN" | "REJECTED" | "PUBLISHED";
      limit?: number;
      offset?: number;
    }
  ) {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const [items, total] = await Promise.all([
      db.dealCandidate.findMany({
        where: options.status ? { status: options.status } : {},
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          deal: { select: { id: true, slug: true, title: true } },
          priceObservations: { take: 5, orderBy: { observedAt: "desc" } },
        },
      }),
      db.dealCandidate.count({
        where: options.status ? { status: options.status } : {},
      }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * Returns aggregate scraper and intelligence metrics.
   */
  async getScraperMetrics(db: DatabaseClient) {
    const [
      totalCandidates,
      verifiedCandidates,
      publishedDeals,
      pendingReview,
      rejectedCandidates,
      totalObservations,
      latestJob,
      lastSuccessfulJob,
    ] = await Promise.all([
      db.dealCandidate.count(),
      db.dealCandidate.count({ where: { status: "VERIFIED" } }),
      db.dealCandidate.count({ where: { status: "PUBLISHED" } }),
      db.dealCandidate.count({ where: { status: "UNCERTAIN" } }),
      db.dealCandidate.count({ where: { status: "REJECTED" } }),
      db.priceObservation.count(),
      db.scraperJob.findFirst({ orderBy: { startedAt: "desc" } }),
      db.scraperJob.findFirst({
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
      }),
    ]);

    const priceStats = await getPriceReferenceStats(db, {});

    const connectors = await Promise.all(
      connectorRegistry.getAll().map(async (c) => {
        const health = await c.checkHealth();
        const lastJob = await db.scraperJob.findFirst({
          where: { connectorCode: c.code },
          orderBy: { startedAt: "desc" },
        });
        return {
          code: c.code,
          name: c.name,
          isHealthy: health.isHealthy,
          message: health.message,
          lastCheckedAt: health.lastCheckedAt.toISOString(),
          lastJob: lastJob
            ? {
                id: lastJob.id,
                status: lastJob.status,
                itemsFound: lastJob.itemsFound,
                itemsVerified: lastJob.itemsVerified,
                itemsPublished: lastJob.itemsPublished,
                errorMessage: lastJob.errorMessage,
                startedAt: lastJob.startedAt.toISOString(),
                completedAt: lastJob.completedAt ? lastJob.completedAt.toISOString() : null,
              }
            : null,
        };
      })
    );

    return {
      totalCandidates,
      verifiedCandidates,
      publishedDeals,
      pendingReview,
      rejectedCandidates,
      totalObservations,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            connectorCode: latestJob.connectorCode,
            status: latestJob.status,
            itemsFound: latestJob.itemsFound,
            itemsVerified: latestJob.itemsVerified,
            itemsPublished: latestJob.itemsPublished,
            errorMessage: latestJob.errorMessage,
            startedAt: latestJob.startedAt.toISOString(),
            completedAt: latestJob.completedAt ? latestJob.completedAt.toISOString() : null,
          }
        : null,
      lastSuccessfulScanAt: lastSuccessfulJob?.completedAt
        ? lastSuccessfulJob.completedAt.toISOString()
        : null,
      priceStats,
      connectors,
    };
  }
}

export const scraperService = new ScraperService();

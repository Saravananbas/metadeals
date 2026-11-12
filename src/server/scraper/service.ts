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
   * Ingests a discovered deal candidate with idempotent deduplication.
   *
   * Idempotency Policy:
   * 1. If a listing with the same (sourcePlatform, externalId) or sourceUrl already exists:
   *    - Do NOT create a duplicate candidate or deal.
   *    - Record a new historical PriceObservation timestamped with current observed values.
   *    - If price/mrp changed, update the existing candidate & published deal.
   * 2. If genuine new listing:
   *    - Apply deterministic verification gates and anomaly detection.
   *    - Public Catalogue Protection: If discovered from mock/fixture sources, keep as UNCERTAIN
   *      and DO NOT automatically publish to the public website.
   *    - Genuinely verified live candidates are automatically published.
   * 3. Distinct product variants (different externalId or distinct URL) are never merged.
   */
  async ingestCandidate(
    db: DatabaseClient,
    raw: unknown,
    options?: { isMockOrFixture?: boolean }
  ) {
    const input: CandidateInput = candidateInputSchema.parse(raw);
    const isMock = options?.isMockOrFixture ?? Boolean(input.isMockOrFixture);
    const merchantSlug = input.sourcePlatform.toLowerCase().replace(/[^\w-]/g, "");

    // 1. Idempotency Check: Look for existing candidate for this retailer & product identity
    let existingCandidate = input.externalId
      ? await db.dealCandidate.findFirst({
          where: {
            sourcePlatform: input.sourcePlatform,
            externalId: input.externalId,
          },
          include: { deal: true },
        })
      : null;

    if (!existingCandidate) {
      existingCandidate = await db.dealCandidate.findFirst({
        where: {
          sourceUrl: input.sourceUrl,
        },
        include: { deal: true },
      });
    }

    if (existingCandidate) {
      // Record historical price observation without duplicating candidate or deal
      await recordPriceObservation(db, {
        merchantSlug,
        priceMinor: input.observedPriceMinor,
        mrpMinor: input.observedMrpMinor,
        sourceUrl: input.sourceUrl,
        currency: input.currency,
        candidateId: existingCandidate.id,
        dealId: existingCandidate.dealId ?? undefined,
      });

      const priceChanged =
        existingCandidate.observedPriceMinor !== input.observedPriceMinor ||
        existingCandidate.observedMrpMinor !== input.observedMrpMinor;

      let updatedCandidate = existingCandidate;
      if (priceChanged) {
        const discountPercent = calculateDiscountPercent(
          input.observedMrpMinor,
          input.observedPriceMinor
        );
        updatedCandidate = await db.dealCandidate.update({
          where: { id: existingCandidate.id },
          data: {
            observedPriceMinor: input.observedPriceMinor,
            observedMrpMinor: input.observedMrpMinor,
            discountPercent,
            inStock: input.inStock,
            updatedAt: new Date(),
          },
          include: { deal: true },
        });

        // If candidate is linked to a published deal, update the Deal's current price
        if (existingCandidate.dealId) {
          await db.deal.update({
            where: { id: existingCandidate.dealId },
            data: {
              priceMinor: input.observedPriceMinor,
              mrpMinor: input.observedMrpMinor,
              updatedAt: new Date(),
            },
          });
        }
      }

      return {
        candidate: updatedCandidate,
        deal: existingCandidate.deal,
        outcome: priceChanged ? ("PRICE_UPDATED" as const) : ("EXISTING_RETAINED" as const),
        isDuplicate: true,
      };
    }

    // 2. Check if a Deal already exists with the same source productUrl
    const existingDeal = await db.deal.findFirst({
      where: { productUrl: input.sourceUrl },
    });

    const discountPercent = calculateDiscountPercent(
      input.observedMrpMinor,
      input.observedPriceMinor
    );

    // 3. Fetch historical price stats for this retailer/product
    const priceStats = await getPriceReferenceStats(db, { merchantSlug });

    // 4. Run deterministic verification rules
    const verification = verifyCandidate(input, priceStats);

    // 5. Public Catalogue Safety: Never auto-publish fixture/mock products to the public site
    const effectiveStatus = isMock ? "UNCERTAIN" : verification.status;
    const effectiveRejectionReason = isMock
      ? "Discovered from mock/fixture source; automated publishing prevented to protect public catalogue."
      : verification.rejectionReason;

    // 6. Create Candidate record
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
        confidenceScore: isMock ? Math.min(verification.confidenceScore, 40) : verification.confidenceScore,
        status: effectiveStatus,
        rejectionReason: effectiveRejectionReason,
        rawData: input.rawData,
        dealId: existingDeal?.id ?? null,
      },
    });

    // 7. Record raw price observation
    await recordPriceObservation(db, {
      merchantSlug,
      priceMinor: input.observedPriceMinor,
      mrpMinor: input.observedMrpMinor,
      sourceUrl: input.sourceUrl,
      currency: input.currency,
      candidateId: candidate.id,
      dealId: existingDeal?.id ?? undefined,
    });

    // 8. Automatic Publication Policy:
    // Only genuinely live verified candidates are auto-published.
    if (!isMock && verification.status === "VERIFIED") {
      if (existingDeal) {
        // Link to existing deal rather than creating a duplicate
        const updated = await db.dealCandidate.update({
          where: { id: candidate.id },
          data: { status: "PUBLISHED", dealId: existingDeal.id },
        });
        return {
          candidate: updated,
          deal: existingDeal,
          outcome: "LINKED_EXISTING" as const,
        };
      }

      const deal = await publishVerifiedCandidate(db, candidate.id);
      return {
        candidate: await db.dealCandidate.findUnique({ where: { id: candidate.id } }),
        deal,
        outcome: "PUBLISHED" as const,
      };
    }

    // If UNCERTAIN / MOCK -> routed to admin review queue
    // If REJECTED -> rejected without publishing
    return {
      candidate,
      deal: null,
      outcome: isMock ? ("MOCK_HELD" as const) : verification.status,
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
      const isConnectorLive = connector.isLive ?? false;
      const listings = await connector.discoverListings();
      let itemsVerified = 0;
      let itemsPublished = 0;

      for (const listing of listings) {
        const isMockOrFixture = listing.isMockOrFixture ?? !isConnectorLive;
        const result = await this.ingestCandidate(db, listing, { isMockOrFixture });
        if (result.outcome === "PUBLISHED") {
          itemsVerified++;
          itemsPublished++;
        } else if (
          result.outcome === "EXISTING_RETAINED" ||
          result.outcome === "PRICE_UPDATED" ||
          result.outcome === "LINKED_EXISTING"
        ) {
          itemsVerified++;
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

        // Determine last live retrieval vs last mock/fixture scan
        const lastLiveJob = health.isLive
          ? await db.scraperJob.findFirst({
              where: { connectorCode: c.code, status: "COMPLETED" },
              orderBy: { completedAt: "desc" },
            })
          : null;

        const lastMockJob = !health.isLive
          ? await db.scraperJob.findFirst({
              where: { connectorCode: c.code, status: "COMPLETED" },
              orderBy: { completedAt: "desc" },
            })
          : null;

        return {
          code: c.code,
          name: c.name,
          status: health.status,
          isHealthy: health.isHealthy,
          isLive: health.isLive,
          message: health.message,
          lastCheckedAt: health.lastCheckedAt.toISOString(),
          lastLiveRetrievalAt: lastLiveJob?.completedAt ? lastLiveJob.completedAt.toISOString() : null,
          lastMockScanAt: lastMockJob?.completedAt ? lastMockJob.completedAt.toISOString() : null,
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

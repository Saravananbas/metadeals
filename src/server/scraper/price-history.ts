import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { PriceReferenceStats } from "./types";

export type DatabaseClient = Prisma.TransactionClient;

function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Appends a new price observation.
 */
export async function recordPriceObservation(
  db: DatabaseClient,
  data: {
    merchantSlug: string;
    priceMinor: number;
    mrpMinor: number;
    sourceUrl: string;
    currency?: string;
    dealId?: string;
    candidateId?: string;
  }
) {
  return db.priceObservation.create({
    data: {
      merchantSlug: data.merchantSlug,
      priceMinor: data.priceMinor,
      mrpMinor: data.mrpMinor,
      sourceUrl: data.sourceUrl,
      currency: data.currency ?? "INR",
      dealId: data.dealId,
      candidateId: data.candidateId,
    },
  });
}

/**
 * Calculates historical price reference statistics for a given merchant or deal.
 */
export async function getPriceReferenceStats(
  db: DatabaseClient,
  criteria: { merchantSlug?: string; dealId?: string }
): Promise<PriceReferenceStats> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const observations = await db.priceObservation.findMany({
    where: {
      ...(criteria.merchantSlug ? { merchantSlug: criteria.merchantSlug } : {}),
      ...(criteria.dealId ? { dealId: criteria.dealId } : {}),
      observedAt: { gte: ninetyDaysAgo },
    },
    orderBy: { observedAt: "desc" },
    select: { priceMinor: true, observedAt: true },
  });

  if (observations.length === 0) {
    return {
      observationCount: 0,
      median7DayMinor: null,
      median30DayMinor: null,
      median90DayMinor: null,
      lowestObservedMinor: null,
      highestObservedMinor: null,
      latestObservedAt: null,
    };
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const prices7d: number[] = [];
  const prices30d: number[] = [];
  const prices90d: number[] = [];

  let minPrice = observations[0].priceMinor;
  let maxPrice = observations[0].priceMinor;

  for (const obs of observations) {
    prices90d.push(obs.priceMinor);
    if (obs.observedAt >= thirtyDaysAgo) {
      prices30d.push(obs.priceMinor);
    }
    if (obs.observedAt >= sevenDaysAgo) {
      prices7d.push(obs.priceMinor);
    }
    if (obs.priceMinor < minPrice) minPrice = obs.priceMinor;
    if (obs.priceMinor > maxPrice) maxPrice = obs.priceMinor;
  }

  return {
    observationCount: observations.length,
    median7DayMinor: computeMedian(prices7d),
    median30DayMinor: computeMedian(prices30d),
    median90DayMinor: computeMedian(prices90d),
    lowestObservedMinor: minPrice,
    highestObservedMinor: maxPrice,
    latestObservedAt: observations[0].observedAt,
  };
}

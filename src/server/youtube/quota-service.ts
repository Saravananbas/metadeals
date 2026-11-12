import "server-only";
import { getDatabase } from "@/server/db/client";

export type QuotaThresholdStatus = "HEALTHY" | "NEAR_LIMIT" | "CRITICAL" | "QUOTA_EXCEEDED";

export interface QuotaStatusResult {
  searchRequestsUsed: number;
  searchRequestsRemaining: number;
  searchLimit: number;
  searchPercent: number;
  searchStatus: QuotaThresholdStatus;

  otherUnits: number;
  totalQuotaUnits: number;
  quotaLimit: number;
  quotaPercent: number;
  quotaStatus: QuotaThresholdStatus;

  overallStatus: QuotaThresholdStatus;
  statusColor: "green" | "amber" | "red";

  totalApiRequests: number;
  searchCalls: number;
  videoDetailCalls: number;
  otherCalls: number;

  unitsByEndpoint: Record<string, number>;
  successfulRequests: number;
  failedRequests: number;
  blockedRequests: number;
  lastRequestAt: string | null;
  resetTime: string;
  resetFormatted: string;

  history: Array<{
    date: string;
    searchCalls: number;
    videoCalls: number;
    totalUnits: number;
    successfulRequests: number;
    failedRequests: number;
    blockedRequests: number;
  }>;
}

export interface QuotaReservation {
  allowed: boolean;
  ledgerId?: string;
  blockedReason?: string;
  searchRemaining?: number;
}

/**
 * YouTube Data API Quota Costs per Google specification:
 * - search.list: 100 units
 * - videos.list: 1 unit
 * - channels.list: 1 unit
 * - playlists.list: 1 unit
 */
export const ENDPOINT_QUOTA_COSTS: Record<string, number> = {
  "search.list": 100,
  "videos.list": 1,
  "channels.list": 1,
  "playlists.list": 1,
};

export function getDailySearchCap(): number {
  const envVal = process.env.YOUTUBE_DAILY_SEARCH_CAP;
  if (envVal && !isNaN(parseInt(envVal, 10))) {
    return parseInt(envVal, 10);
  }
  return 80; // Internal daily search cap
}

export function getDailyQuotaCap(): number {
  const envVal = process.env.YOUTUBE_DAILY_QUOTA_CAP;
  if (envVal && !isNaN(parseInt(envVal, 10))) {
    return parseInt(envVal, 10);
  }
  return 10000; // YouTube Data API default daily allocation
}

/**
 * Computes day start and end in US Pacific Time (PST/PDT),
 * where Google resets the YouTube Data API daily quota at midnight.
 */
export function getPacificDayBoundaries(now = new Date()): { dayStart: Date; dayEnd: Date; resetFormatted: string } {
  // Format current time in America/Los_Angeles
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(now);
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "2026";
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "PT";

  // Pacific Time is either UTC-8 (PST) or UTC-7 (PDT)
  const isPdt = tzName === "PDT";
  const offsetString = isPdt ? "-07:00" : "-08:00";

  const dayStart = new Date(`${year}-${month}-${day}T00:00:00${offsetString}`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const msRemaining = Math.max(0, dayEnd.getTime() - now.getTime());
  const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

  const resetFormatted = `Resets at 00:00 ${tzName} (in ${hoursRemaining}h ${minutesRemaining}m)`;

  return { dayStart, dayEnd, resetFormatted };
}

/**
 * Calculates threshold status based on usage percentage:
 * - 0–69%: Green – Healthy
 * - 70–89%: Amber – Near Limit
 * - 90–100%: Red – Critical
 * - >100%: Red – Quota Exceeded
 */
export function calculateThresholdStatus(percent: number): QuotaThresholdStatus {
  if (percent > 100) return "QUOTA_EXCEEDED";
  if (percent >= 90) return "CRITICAL";
  if (percent >= 70) return "NEAR_LIMIT";
  return "HEALTHY";
}

/**
 * Sanitizes errors to prevent API keys or secrets from leaking into the database ledger.
 */
export function sanitizeErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/AIza[0-9A-Za-z-_]{30,}/g, "[REDACTED_API_KEY]")
    .replace(/key=[a-zA-Z0-9_\-]+/gi, "key=[REDACTED_API_KEY]")
    .slice(0, 450);
}

export class YouTubeQuotaService {
  /**
   * Atomically checks quota limits and reserves quota units BEFORE issuing an API request.
   * Uses a PostgreSQL transaction to prevent concurrent administrators from exceeding caps.
   */
  async reserveQuota(
    endpoint: "search.list" | "videos.list" | string,
    units?: number,
    meta?: {
      dealId?: string;
      canonicalProduct?: string;
      adminUserId?: string;
    }
  ): Promise<QuotaReservation> {
    const cost = units ?? (ENDPOINT_QUOTA_COSTS[endpoint] || 1);
    const searchLimit = getDailySearchCap();
    const quotaLimit = getDailyQuotaCap();
    const { dayStart } = getPacificDayBoundaries();

    const db = getDatabase();

    return await db.$transaction(async (tx) => {
      // 1. Fetch all non-blocked ledger entries for the current quota day
      const todayEntries = await tx.youTubeQuotaLedger.findMany({
        where: {
          createdAt: { gte: dayStart },
          outcome: { not: "BLOCKED" },
        },
        select: {
          endpoint: true,
          units: true,
        },
      });

      const searchCallsToday = todayEntries.filter((e) => e.endpoint === "search.list").length;
      const totalUnitsToday = todayEntries.reduce((sum, e) => sum + e.units, 0);

      // 2. Check internal search cap (80 calls)
      if (endpoint === "search.list" && searchCallsToday >= searchLimit) {
        await tx.youTubeQuotaLedger.create({
          data: {
            endpoint,
            units: 0,
            outcome: "BLOCKED",
            dealId: meta?.dealId,
            canonicalProduct: meta?.canonicalProduct,
            adminUserId: meta?.adminUserId,
            errorCategory: "SEARCH_LIMIT_EXCEEDED",
            errorMessage: `Internal daily limit of ${searchLimit} search requests reached. Search blocked to preserve quota.`,
          },
        });

        return {
          allowed: false,
          blockedReason: `Internal daily limit of ${searchLimit} search calls reached. Resets at midnight PST.`,
          searchRemaining: 0,
        };
      }

      // 3. Check total daily quota unit cap (10,000 units)
      if (totalUnitsToday + cost > quotaLimit) {
        await tx.youTubeQuotaLedger.create({
          data: {
            endpoint,
            units: 0,
            outcome: "BLOCKED",
            dealId: meta?.dealId,
            canonicalProduct: meta?.canonicalProduct,
            adminUserId: meta?.adminUserId,
            errorCategory: "QUOTA_LIMIT_EXCEEDED",
            errorMessage: `Daily quota limit of ${quotaLimit} units exceeded. Request blocked.`,
          },
        });

        return {
          allowed: false,
          blockedReason: `Daily YouTube API quota cap (${quotaLimit.toLocaleString()} units) exceeded.`,
          searchRemaining: Math.max(0, searchLimit - searchCallsToday),
        };
      }

      // 4. Reserve quota atomically in database ledger
      const ledger = await tx.youTubeQuotaLedger.create({
        data: {
          endpoint,
          units: cost,
          outcome: "RESERVED",
          dealId: meta?.dealId,
          canonicalProduct: meta?.canonicalProduct,
          adminUserId: meta?.adminUserId,
        },
      });

      return {
        allowed: true,
        ledgerId: ledger.id,
        searchRemaining: endpoint === "search.list" ? Math.max(0, searchLimit - searchCallsToday - 1) : Math.max(0, searchLimit - searchCallsToday),
      };
    });
  }

  /**
   * Finalizes the quota outcome after HTTP execution.
   * Note: Failed API requests retain their charged units in accordance with Google's quota accounting rules.
   */
  async recordQuotaOutcome(
    ledgerId: string,
    success: boolean,
    details?: {
      errorCategory?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    try {
      const db = getDatabase();
      await db.youTubeQuotaLedger.update({
        where: { id: ledgerId },
        data: {
          outcome: success ? "SUCCESS" : "FAILED",
          errorCategory: details?.errorCategory || (success ? null : "API_ERROR"),
          errorMessage: details?.errorMessage ? sanitizeErrorMessage(details.errorMessage) : null,
        },
      });
    } catch {
      // Non-blocking update failure
    }
  }

  /**
   * Calculates comprehensive quota monitor metrics for the admin dashboard.
   */
  async getQuotaStatus(): Promise<QuotaStatusResult> {
    const db = getDatabase();
    const searchLimit = getDailySearchCap();
    const quotaLimit = getDailyQuotaCap();
    const { dayStart, dayEnd, resetFormatted } = getPacificDayBoundaries();

    // Query today's entries
    const todayEntries = await db.youTubeQuotaLedger.findMany({
      where: {
        createdAt: { gte: dayStart },
      },
      orderBy: { createdAt: "desc" },
    });

    const activeEntries = todayEntries.filter((e) => e.outcome !== "BLOCKED");

    const searchCalls = activeEntries.filter((e) => e.endpoint === "search.list").length;
    const videoDetailCalls = activeEntries.filter((e) => e.endpoint === "videos.list").length;
    const otherCalls = activeEntries.filter((e) => e.endpoint !== "search.list" && e.endpoint !== "videos.list").length;

    let totalQuotaUnits = 0;
    let otherUnits = 0;
    const unitsByEndpoint: Record<string, number> = {};

    for (const entry of activeEntries) {
      totalQuotaUnits += entry.units;
      unitsByEndpoint[entry.endpoint] = (unitsByEndpoint[entry.endpoint] || 0) + entry.units;
      if (entry.endpoint !== "search.list") {
        otherUnits += entry.units;
      }
    }

    const searchRequestsRemaining = Math.max(0, searchLimit - searchCalls);
    const searchPercent = Math.min(100, Math.round((searchCalls / searchLimit) * 1000) / 10);
    const quotaPercent = Math.min(100, Math.round((totalQuotaUnits / quotaLimit) * 1000) / 10);

    const searchStatus = calculateThresholdStatus(searchPercent);
    const quotaStatus = calculateThresholdStatus(quotaPercent);

    // Overall status takes the higher severity
    const severityMap: Record<QuotaThresholdStatus, number> = {
      HEALTHY: 1,
      NEAR_LIMIT: 2,
      CRITICAL: 3,
      QUOTA_EXCEEDED: 4,
    };
    const overallStatus: QuotaThresholdStatus =
      severityMap[searchStatus] >= severityMap[quotaStatus] ? searchStatus : quotaStatus;

    const statusColor: "green" | "amber" | "red" =
      overallStatus === "HEALTHY" ? "green" : overallStatus === "NEAR_LIMIT" ? "amber" : "red";

    const successfulRequests = todayEntries.filter((e) => e.outcome === "SUCCESS").length;
    const failedRequests = todayEntries.filter((e) => e.outcome === "FAILED").length;
    const blockedRequests = todayEntries.filter((e) => e.outcome === "BLOCKED").length;

    const lastRequestAt = todayEntries[0]?.createdAt.toISOString() || null;

    // Fetch 7-day historical usage
    const historyStart = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const historicalEntries = await db.youTubeQuotaLedger.findMany({
      where: {
        createdAt: { gte: historyStart, lt: dayStart },
      },
      orderBy: { createdAt: "desc" },
    });

    const historyMap = new Map<
      string,
      {
        searchCalls: number;
        videoCalls: number;
        totalUnits: number;
        successfulRequests: number;
        failedRequests: number;
        blockedRequests: number;
      }
    >();

    for (const entry of historicalEntries) {
      const d = entry.createdAt.toISOString().slice(0, 10);
      const cur = historyMap.get(d) || {
        searchCalls: 0,
        videoCalls: 0,
        totalUnits: 0,
        successfulRequests: 0,
        failedRequests: 0,
        blockedRequests: 0,
      };

      if (entry.outcome !== "BLOCKED") {
        if (entry.endpoint === "search.list") cur.searchCalls++;
        else if (entry.endpoint === "videos.list") cur.videoCalls++;
        cur.totalUnits += entry.units;
      }

      if (entry.outcome === "SUCCESS") cur.successfulRequests++;
      else if (entry.outcome === "FAILED") cur.failedRequests++;
      else if (entry.outcome === "BLOCKED") cur.blockedRequests++;

      historyMap.set(d, cur);
    }

    const history = Array.from(historyMap.entries()).map(([date, stats]) => ({
      date,
      ...stats,
    }));

    return {
      searchRequestsUsed: searchCalls,
      searchRequestsRemaining,
      searchLimit,
      searchPercent,
      searchStatus,

      otherUnits,
      totalQuotaUnits,
      quotaLimit,
      quotaPercent,
      quotaStatus,

      overallStatus,
      statusColor,

      totalApiRequests: activeEntries.length,
      searchCalls,
      videoDetailCalls,
      otherCalls,

      unitsByEndpoint,
      successfulRequests,
      failedRequests,
      blockedRequests,
      lastRequestAt,
      resetTime: dayEnd.toISOString(),
      resetFormatted,

      history,
    };
  }
}

export const youTubeQuotaService = new YouTubeQuotaService();


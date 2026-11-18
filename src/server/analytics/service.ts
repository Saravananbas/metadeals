import "server-only";
import { type AdminRole } from "@/server/auth/permissions";
import { actorCan } from "@/server/auth/access";
import type { DealDatabase } from "@/server/deals/repository";

export class AnalyticsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AnalyticsError";
  }
}

export interface AnalyticsActor {
  id: string;
  role: AdminRole;
}

export async function getUnifiedAnalyticsSummary(
  db: DealDatabase,
  actor: AnalyticsActor
) {
  if (!(await actorCan(actor, "analytics:view"))) {
    throw new AnalyticsError("Forbidden: analytics:view permission required.", 403);
  }

  const [
    totalDeals,
    publishedDeals,
    totalClicks,
    clicksByChannelRaw,
    transactions,
    distributionPosts,
  ] = await Promise.all([
    db.deal.count(),
    db.deal.count({ where: { status: "PUBLISHED" } }),
    db.affiliateClick.count(),
    db.affiliateClick.groupBy({
      by: ["channel"],
      _count: { _all: true },
    }),
    db.affiliateTransaction.findMany({
      select: {
        provider: true,
        status: true,
        commissionMinor: true,
      },
    }),
    db.distributionPost.groupBy({
      by: ["platform", "status"],
      _count: { _all: true },
    }),
  ]);

  const clicksByChannel = Object.fromEntries(
    clicksByChannelRaw.map((row) => [row.channel, row._count._all])
  );

  let totalReportedCommissionMinor = 0;
  let confirmedCommissionMinor = 0;
  let pendingCommissionMinor = 0;
  let rejectedCommissionMinor = 0;

  for (const tx of transactions) {
    totalReportedCommissionMinor += tx.commissionMinor;
    if (tx.status === "APPROVED" || tx.status === "PAID") {
      confirmedCommissionMinor += tx.commissionMinor;
    } else if (tx.status === "PENDING") {
      pendingCommissionMinor += tx.commissionMinor;
    } else if (tx.status === "REJECTED") {
      rejectedCommissionMinor += tx.commissionMinor;
    }
  }

  const distributionStats = {
    telegram: { sent: 0, failed: 0, skipped: 0 },
    whatsapp: { sent: 0, failed: 0, skipped: 0 },
  };

  for (const post of distributionPosts) {
    const platform = post.platform === "TELEGRAM" ? "telegram" : "whatsapp";
    const status = post.status.toLowerCase() as "sent" | "failed" | "skipped";
    if (distributionStats[platform] && status in distributionStats[platform]) {
      distributionStats[platform][status] = post._count._all;
    }
  }

  return {
    overview: {
      totalDeals,
      publishedDeals,
      totalOutboundClicks: totalClicks,
      totalTransactionsReported: transactions.length,
    },
    clicks: {
      total: totalClicks,
      byChannel: clicksByChannel,
    },
    monetization: {
      currency: "INR",
      totalReportedCommissionMinor,
      confirmedCommissionMinor,
      pendingCommissionMinor,
      rejectedCommissionMinor,
      disclaimer: "Outbound clicks represent user referrals, not guaranteed purchases. Commission reflects provider-reported transaction statements only.",
    },
    distribution: distributionStats,
  };
}


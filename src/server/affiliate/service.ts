import "server-only";
import { getAuthEnv } from "@/config/env";
import { roleCan, type AdminRole } from "@/server/auth/permissions";
import { merchantSelect, type DealDatabase } from "@/server/deals/repository";
import { ALLOWED_RETAILER_DOMAINS } from "@/server/product-extraction/security/domain-allowlist";
import { convertMerchantUrl } from "./adapters/registry";
import {
  validateDestinationHost,
  isCrawlerOrPrefetch,
  createActorHash as hashActor,
  type ImportBatchInput,
  type RedirectResolution,
} from "./types";

export { validateDestinationHost, isCrawlerOrPrefetch };

export const PERMITTED_AFFILIATE_NETWORK_HOSTS = [
  "cuelinks.com",
  "clnk.in",
  "linksredirect.com",
  "amzn.to",
  "amzn.in",
  "dl.flipkart.com",
  "fkrt.it",
];

export const PERMITTED_RETAILER_HOSTS = [
  ...ALLOWED_RETAILER_DOMAINS.map((d) => d.domain),
  ...PERMITTED_AFFILIATE_NETWORK_HOSTS,
];

export function createActorHash(
  ip: string,
  userAgent: string,
  date: Date = new Date()
): string {
  const secret = getAuthEnv().AUTH_SESSION_SECRET;
  return hashActor(ip, userAgent, secret, date);
}

export class AffiliateError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AffiliateError";
  }
}

export interface AffiliateActor {
  id: string;
  role: AdminRole;
}

export async function resolveDealRedirect(
  db: DealDatabase,
  dealIdOrSlug: string,
  optionId?: string | null,
  requestMeta: {
    ip: string;
    userAgent: string;
    prefetch?: string | null;
    channel?: string;
  } = { ip: "127.0.0.1", userAgent: "Mozilla/5.0" }
): Promise<RedirectResolution> {
  const deal = await db.deal.findFirst({
    where: {
      OR: [{ id: dealIdOrSlug }, { slug: dealIdOrSlug }],
    },
    include: {
      merchant: { select: merchantSelect },
      options: { include: { merchant: { select: merchantSelect } } },
    },
  });

  if (!deal) {
    throw new AffiliateError("Deal not found.", 404);
  }

  const now = new Date();
  if (
    deal.status !== "PUBLISHED" ||
    (deal.startsAt && deal.startsAt > now) ||
    (deal.expiresAt && deal.expiresAt <= now)
  ) {
    throw new AffiliateError("This deal is no longer active.", 410);
  }

  let targetMerchant = deal.merchant;
  let selectedOptionId: string | null = null;
  let candidateAffiliateUrl: string | null = deal.affiliateUrl;
  let candidateProductUrl: string = deal.productUrl;

  if (optionId) {
    const option = deal.options.find((o) => o.id === optionId);
    if (!option) {
      throw new AffiliateError("Purchase option not found.", 404);
    }
    selectedOptionId = option.id;
    targetMerchant = option.merchant;
    candidateAffiliateUrl = option.affiliateUrl || null;
    candidateProductUrl = option.productUrl;
  }

  // Validate destination against merchant allowed hosts and permitted retailer hosts
  const isUrlAllowed = (url: string | null | undefined): boolean => {
    if (!url) return false;
    return validateDestinationHost(
      url,
      targetMerchant.websiteUrl,
      targetMerchant.affiliateHosts,
      PERMITTED_RETAILER_HOSTS
    );
  };

  let targetUrl: string | null = null;

  if (candidateAffiliateUrl) {
    // Configured affiliate URL is present: validate destination host
    if (!isUrlAllowed(candidateAffiliateUrl)) {
      throw new AffiliateError("Untrusted destination domain.", 400);
    }
    targetUrl = candidateAffiliateUrl;
  } else if (candidateProductUrl) {
    // Affiliate URL is missing: attempt adapter conversion on the original product URL
    try {
      const parsed = new URL(candidateProductUrl);
      const converted = convertMerchantUrl(candidateProductUrl, parsed.hostname, {
        dealId: deal.slug || deal.id,
        subId: requestMeta.channel || "web",
      });
      if (converted.isAffiliate && converted.url && isUrlAllowed(converted.url)) {
        targetUrl = converted.url;
      }
    } catch {
      // Continue to direct product URL fallback
    }

    // Fall back to original retailer product URL if conversion was unavailable or returned direct
    if (!targetUrl) {
      if (!isUrlAllowed(candidateProductUrl)) {
        throw new AffiliateError("Untrusted destination domain.", 400);
      }
      targetUrl = candidateProductUrl;
    }
  } else {
    throw new AffiliateError("Destination URL is unavailable.", 404);
  }

  const isBot = isCrawlerOrPrefetch(
    requestMeta.userAgent,
    requestMeta.prefetch || null
  );

  if (isBot) {
    return {
      destinationUrl: targetUrl,
      dealId: deal.id,
      merchantId: targetMerchant.id,
      optionId: selectedOptionId,
      loggedClick: false,
    };
  }

  const actorHash = createActorHash(requestMeta.ip, requestMeta.userAgent, now);
  const channel = (requestMeta.channel || "web").slice(0, 30);

  try {
    await db.affiliateClick.create({
      data: {
        dealId: deal.id,
        optionId: selectedOptionId,
        merchantId: targetMerchant.id,
        channel,
        actorHash,
        createdAt: now,
      },
    });
  } catch {
    // Non-blocking click write failure: continue redirection
  }

  return {
    destinationUrl: targetUrl,
    dealId: deal.id,
    merchantId: targetMerchant.id,
    optionId: selectedOptionId,
    loggedClick: true,
  };
}

export async function importAffiliateTransactions(
  db: DealDatabase,
  actor: AffiliateActor,
  batch: ImportBatchInput
) {
  if (!roleCan(actor.role, "affiliate:manage")) {
    throw new AffiliateError("Forbidden: insufficient permissions.", 403);
  }

  let imported = 0;
  let updated = 0;

  for (const item of batch.transactions) {
    const existing = await db.affiliateTransaction.findUnique({
      where: {
        provider_externalId: {
          provider: batch.provider,
          externalId: item.externalId,
        },
      },
    });

    if (existing) {
      await db.affiliateTransaction.update({
        where: { id: existing.id },
        data: {
          status: item.status,
          commissionMinor: item.commissionMinor,
          reportedAt: new Date(item.reportedAt),
          enteredById: actor.id,
        },
      });
      updated++;
    } else {
      await db.affiliateTransaction.create({
        data: {
          provider: batch.provider,
          externalId: item.externalId,
          dealId: item.dealId || null,
          status: item.status,
          commissionMinor: item.commissionMinor,
          currency: item.currency,
          reportedAt: new Date(item.reportedAt),
          enteredById: actor.id,
        },
      });
      imported++;
    }
  }

  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "affiliate.transactions_imported",
      targetId: batch.provider,
      success: true,
      metadata: {
        provider: batch.provider,
        importedCount: imported,
        updatedCount: updated,
        totalRows: batch.transactions.length,
      },
    },
  });

  return { imported, updated, total: batch.transactions.length };
}

export async function getAffiliateClickStats(
  db: DealDatabase,
  actor: AffiliateActor,
  filters: { dealId?: string; merchantId?: string; channel?: string }
) {
  if (!roleCan(actor.role, "operations:read")) {
    throw new AffiliateError("Forbidden: insufficient permissions.", 403);
  }

  const where = {
    ...(filters.dealId ? { dealId: filters.dealId } : {}),
    ...(filters.merchantId ? { merchantId: filters.merchantId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
  };

  const [totalClicks, recentClicks] = await Promise.all([
    db.affiliateClick.count({ where }),
    db.affiliateClick.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return { totalClicks, recentClicks };
}

export async function getAffiliateTransactions(
  db: DealDatabase,
  actor: AffiliateActor,
  filters: { provider?: string; status?: string }
) {
  if (!roleCan(actor.role, "operations:read")) {
    throw new AffiliateError("Forbidden: insufficient permissions.", 403);
  }

  const where = {
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const transactions = await db.affiliateTransaction.findMany({
    where,
    orderBy: { reportedAt: "desc" },
    take: 100,
  });

  const totals = transactions.reduce(
    (acc, tx) => {
      acc.totalCommissionMinor += tx.commissionMinor;
      if (tx.status === "APPROVED" || tx.status === "PAID") {
        acc.confirmedCommissionMinor += tx.commissionMinor;
      }
      return acc;
    },
    { totalCommissionMinor: 0, confirmedCommissionMinor: 0 }
  );

  return { transactions, ...totals };
}


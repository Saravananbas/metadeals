import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";

export class CuelinksAdapter implements AffiliateProviderAdapter {
  readonly name = "cuelinks";

  canHandle(url: string, merchantHost: string): boolean {
    // When Cuelinks is disabled or set to direct mode (e.g. during local dev before channel approval), bypass Cuelinks
    if (process.env.CUELINKS_ENABLED === "false" || process.env.CUELINKS_REDIRECT_MODE === "direct") {
      return false;
    }
    // Cuelinks can wrap multiple merchants when configured as a fallback aggregator
    return Boolean(process.env.CUELINKS_PUB_ID && url && merchantHost);
  }

  convertUrl(originalUrl: string, context: AffiliateConversionContext): ConvertedLinkResult {
    const pubId = process.env.CUELINKS_PUB_ID;
    if (!pubId) {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }

    try {
      const redirectBase = new URL("https://linksredirect.com/");
      redirectBase.searchParams.set("pub_id", pubId);
      redirectBase.searchParams.set("url", originalUrl);
      if (context.subId) {
        redirectBase.searchParams.set("subid", context.subId);
      }
      return { url: redirectBase.toString(), provider: this.name, isAffiliate: true };
    } catch {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }
  }

  parseTransactionReport(raw: unknown): unknown[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>) => ({
      externalId: String(item.transaction_id || item.id || ""),
      dealId: item.subid ? String(item.subid) : null,
      status: String(item.status || "PENDING").toUpperCase(),
      commissionMinor: Math.round(Number(item.commission || item.payout || 0) * 100),
      currency: "INR",
      reportedAt: item.created_at ? new Date(String(item.created_at)).toISOString() : new Date().toISOString(),
    }));
  }
}


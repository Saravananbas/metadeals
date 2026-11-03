import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";

export class AmazonAdapter implements AffiliateProviderAdapter {
  readonly name = "amazon";

  canHandle(url: string, merchantHost: string): boolean {
    const host = merchantHost.toLowerCase();
    return host.includes("amazon.") || host.includes("amzn.");
  }

  convertUrl(originalUrl: string, context: AffiliateConversionContext): ConvertedLinkResult {
    const tag = process.env.AMAZON_ASSOCIATE_TAG;
    if (!tag) {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }

    try {
      const parsed = new URL(originalUrl);
      parsed.searchParams.set("tag", tag);
      if (context.subId) {
        parsed.searchParams.set("ascsubtag", context.subId);
      }
      return { url: parsed.toString(), provider: this.name, isAffiliate: true };
    } catch {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }
  }

  parseTransactionReport(raw: unknown): unknown[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>) => ({
      externalId: String(item.orderId || item.transactionId || item.id || ""),
      dealId: item.dealId ? String(item.dealId) : null,
      status: String(item.status || "PENDING").toUpperCase(),
      commissionMinor: Math.round(Number(item.commission || item.earnings || 0) * 100),
      currency: "INR",
      reportedAt: item.date ? new Date(String(item.date)).toISOString() : new Date().toISOString(),
    }));
  }
}


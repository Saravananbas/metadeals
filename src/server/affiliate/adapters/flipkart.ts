import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";

export class FlipkartAdapter implements AffiliateProviderAdapter {
  readonly name = "flipkart";

  canHandle(url: string, merchantHost: string): boolean {
    const host = merchantHost.toLowerCase();
    return host.includes("flipkart.") || host.includes("fkrt.");
  }

  convertUrl(originalUrl: string, context: AffiliateConversionContext): ConvertedLinkResult {
    const affid = process.env.FLIPKART_AFFILIATE_ID;
    if (!affid) {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }

    try {
      const parsed = new URL(originalUrl);
      parsed.searchParams.set("affid", affid);
      if (context.subId) {
        parsed.searchParams.set("affExtParam1", context.subId);
      }
      return { url: parsed.toString(), provider: this.name, isAffiliate: true };
    } catch {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }
  }

  parseTransactionReport(raw: unknown): unknown[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: Record<string, unknown>) => ({
      externalId: String(item.affiliateOrderId || item.orderId || item.id || ""),
      dealId: item.dealId ? String(item.dealId) : null,
      status: String(item.status || "PENDING").toUpperCase(),
      commissionMinor: Math.round(Number(item.commission || item.tentativeCommission || 0) * 100),
      currency: "INR",
      reportedAt: item.orderDate ? new Date(String(item.orderDate)).toISOString() : new Date().toISOString(),
    }));
  }
}


import type { AffiliateProviderAdapter, AffiliateConversionContext, ConvertedLinkResult } from "./types";

/**
 * Cuelinks MCP and API adapter.
 * Uses Cuelinks MCP shortlink conversion (`clnk.in`) when CUELINKS_PUBLISHER_ID or CUELINKS_PUB_ID is set.
 */
export class CuelinksMcpAdapter implements AffiliateProviderAdapter {
  readonly name = "cuelinks-mcp";

  canHandle(url: string, merchantHost: string): boolean {
    if (process.env.CUELINKS_ENABLED === "false" || process.env.CUELINKS_REDIRECT_MODE === "direct") {
      return false;
    }
    const pubId = process.env.CUELINKS_PUBLISHER_ID || process.env.CUELINKS_PUB_ID;
    if (!pubId || !url || !merchantHost) return false;

    const supported = [
      "cuelinks.com",
      "clnk.in",
      "myntra.com",
      "ajio.com",
      "tatacliq.com",
      "croma.com",
      "reliancedigital.in",
      "nykaa.com",
    ];
    return supported.some((h) => merchantHost === h || merchantHost.endsWith(`.${h}`));
  }

  convertUrl(originalUrl: string, context: AffiliateConversionContext): ConvertedLinkResult {
    const pubId = process.env.CUELINKS_PUBLISHER_ID || process.env.CUELINKS_PUB_ID;
    if (!pubId) {
      return { url: originalUrl, provider: this.name, isAffiliate: false };
    }

    try {
      const redirectBase = new URL("https://clnk.in/r");
      redirectBase.searchParams.set("id", pubId);
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

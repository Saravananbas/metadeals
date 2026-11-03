import "server-only";

export interface CuelinksCampaign {
  id: number;
  name: string;
  url: string;
  domain: string;
  category: string;
  payout: string;
  status: string;
}

export interface CuelinksTransaction {
  id: string;
  campaignName: string;
  orderId: string;
  status: "approved" | "pending" | "rejected";
  commissionMinor: number;
  currency: string;
  transactionDate: string;
}

export interface CuelinksConvertResult {
  originalUrl: string;
  affiliateUrl: string;
}

/**
 * Client for Cuelinks API / Model Context Protocol (MCP) server.
 * Connects to https://mcp.cuelinks.com / https://api.cuelinks.com/v3
 */
export class CuelinksClient {
  private readonly apiKey: string | null;
  private readonly publisherId: string | null;
  private readonly baseUrl: string;

  constructor(config?: { apiKey?: string; publisherId?: string; baseUrl?: string }) {
    this.apiKey = config?.apiKey ?? process.env.CUELINKS_API_KEY ?? null;
    this.publisherId = config?.publisherId ?? process.env.CUELINKS_PUBLISHER_ID ?? null;
    this.baseUrl = config?.baseUrl ?? process.env.CUELINKS_MCP_URL ?? "https://mcp.cuelinks.com";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.publisherId);
  }

  /**
   * Converts a merchant product URL into a tracked Cuelinks shortlink (`clnk.in`).
   */
  async convertLink(targetUrl: string, subId?: string): Promise<CuelinksConvertResult> {
    if (!this.publisherId) {
      return { originalUrl: targetUrl, affiliateUrl: targetUrl };
    }

    const encodedUrl = encodeURIComponent(targetUrl);
    const subParam = subId ? `&subid=${encodeURIComponent(subId)}` : "";
    const affiliateUrl = `https://clnk.in/r?id=${encodeURIComponent(this.publisherId)}&url=${encodedUrl}${subParam}`;

    return {
      originalUrl: targetUrl,
      affiliateUrl,
    };
  }

  /**
   * Searches active campaigns across retailers (Amazon, Flipkart, Myntra, Tata Cliq, etc.).
   */
  async searchCampaigns(query?: string): Promise<CuelinksCampaign[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const url = new URL("/v3/campaigns.json", this.baseUrl);
      if (query) url.searchParams.set("search", query);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return [];
      }

      const json = await res.json() as { campaigns?: Array<{ id: number; name: string; url: string; domain: string; category?: string; payout?: string; status?: string }> };
      return (json.campaigns ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        url: c.url,
        domain: c.domain,
        category: c.category ?? "General",
        payout: c.payout ?? "Standard",
        status: c.status ?? "active",
      }));
    } catch {
      return [];
    }
  }

  /**
   * Fetches real-time affiliate transactions and commissions.
   */
  async getTransactions(startDate?: string, endDate?: string): Promise<CuelinksTransaction[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const url = new URL("/v3/transactions.json", this.baseUrl);
      if (startDate) url.searchParams.set("from", startDate);
      if (endDate) url.searchParams.set("to", endDate);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return [];
      }

      const json = await res.json() as {
        transactions?: Array<{
          id: string | number;
          campaign_name: string;
          order_id: string;
          status: string;
          commission: number;
          currency?: string;
          created_at: string;
        }>;
      };

      return (json.transactions ?? []).map((t) => {
        let status: "approved" | "pending" | "rejected" = "pending";
        if (t.status.toLowerCase().includes("approv")) status = "approved";
        else if (t.status.toLowerCase().includes("reject")) status = "rejected";

        return {
          id: String(t.id),
          campaignName: t.campaign_name,
          orderId: t.order_id,
          status,
          commissionMinor: Math.round(t.commission * 100),
          currency: t.currency ?? "INR",
          transactionDate: t.created_at,
        };
      });
    } catch {
      return [];
    }
  }
}

export const cuelinksClient = new CuelinksClient();

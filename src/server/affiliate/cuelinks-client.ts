export type CuelinksConnectionStatus =
  | "LIVE_CONNECTED"
  | "NOT_CONFIGURED"
  | "AUTHENTICATION_FAILED"
  | "PERMISSION_MISSING"
  | "API_ERROR";

export interface CuelinksHealth {
  status: CuelinksConnectionStatus;
  isLive: boolean;
  publisherId?: string | null;
  message?: string;
  checkedAt: string;
}

export interface CuelinksCampaign {
  id: number;
  name: string;
  url: string;
  domain: string;
  category: string;
  payout: string;
  status: string;
  approvalRequired?: boolean;
}

export interface CuelinksOffer {
  id: number;
  campaignId: number;
  campaignName: string;
  title: string;
  couponCode?: string | null;
  description: string;
  url: string;
  startDate?: string;
  endDate?: string;
  status: "active" | "expired";
}

export interface CuelinksTransaction {
  id: string;
  campaignName: string;
  orderId: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "payable" | "paid";
  commissionMinor: number;
  currency: string;
  transactionDate: string;
}

export interface CuelinksConvertResult {
  originalUrl: string;
  affiliateUrl: string;
  isAffiliate: boolean;
  status: "MONETIZED" | "NON_MONETIZED" | "CONVERSION_FAILED";
  error?: string;
}

/**
 * Cuelinks V3 Publisher API Client.
 * Base: https://developers.cuelinks.com/pub_api/v3
 * Auth: Authorization: Token YOUR_API_KEY
 */
export class CuelinksClient {
  private readonly apiKey: string | null;
  private readonly publisherId: string | null;
  private readonly baseUrl: string;

  constructor(config?: { apiKey?: string; publisherId?: string; baseUrl?: string }) {
    this.apiKey = config?.apiKey ?? process.env.CUELINKS_API_KEY ?? null;
    this.publisherId =
      config?.publisherId ??
      process.env.CUELINKS_PUBLISHER_ID ??
      process.env.CUELINKS_PUB_ID ??
      null;
    this.baseUrl =
      config?.baseUrl ??
      process.env.CUELINKS_BASE_URL ??
      "https://developers.cuelinks.com/pub_api/v3";
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey || this.publisherId);
  }

  getPublisherId(): string | null {
    return this.publisherId;
  }

  /**
   * Diagnostic connection and health check (GET /ping or /campaigns.json?limit=1)
   */
  async checkHealth(): Promise<CuelinksHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.apiKey) {
      if (this.publisherId) {
        return {
          status: "NOT_CONFIGURED",
          isLive: false,
          publisherId: this.publisherId,
          message: "CUELINKS_API_KEY not configured. Running in tracking-only mode with publisher ID.",
          checkedAt,
        };
      }
      return {
        status: "NOT_CONFIGURED",
        isLive: false,
        message: "CUELINKS_API_KEY environment variable is not configured.",
        checkedAt,
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const url = `${this.baseUrl}/campaigns.json?limit=1`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Authorization: `Token ${this.apiKey}`,
          Accept: "application/json",
        },
      }).finally(() => clearTimeout(timeout));

      if (res.status === 200) {
        return {
          status: "LIVE_CONNECTED",
          isLive: true,
          publisherId: this.publisherId,
          message: "Successfully connected to Cuelinks V3 API.",
          checkedAt,
        };
      }

      if (res.status === 401) {
        return {
          status: "AUTHENTICATION_FAILED",
          isLive: false,
          message: "Authentication failed. Invalid or expired CUELINKS_API_KEY.",
          checkedAt,
        };
      }

      if (res.status === 403) {
        return {
          status: "PERMISSION_MISSING",
          isLive: false,
          message: "Permission missing. Ensure your key has read:campaigns, read:reports, read:transactions, read:offers, and write:links permissions.",
          checkedAt,
        };
      }

      return {
        status: "API_ERROR",
        isLive: false,
        message: `Cuelinks API returned HTTP ${res.status}: ${res.statusText}`,
        checkedAt,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        status: "API_ERROR",
        isLive: false,
        message: `Failed to connect to Cuelinks API: ${msg}`,
        checkedAt,
      };
    }
  }

  /**
   * Synchronously builds a standard Cuelinks tracking URL using the publisher ID.
   */
  buildTrackingUrl(targetUrl: string, subId?: string): string {
    const channelId = process.env.CUELINKS_CHANNEL_ID;
    const pubId = this.publisherId;
    if (!channelId && !pubId) return targetUrl;

    try {
      const redirectBase = new URL("https://linksredirect.com/");
      if (channelId) { redirectBase.searchParams.set("cid", channelId); redirectBase.searchParams.set("source", "linkkit"); }
      else redirectBase.searchParams.set("pub_id", pubId as string);
      redirectBase.searchParams.set("url", targetUrl);
      if (subId) {
        redirectBase.searchParams.set("subid", subId);
      }
      return redirectBase.toString();
    } catch {
      return targetUrl;
    }
  }

  /**
   * Converts a merchant product URL into a tracked Cuelinks affiliate link.
   * Uses Cuelinks V3 POST /links/convert if API key is configured.
   */
  async convertLink(targetUrl: string, subId?: string): Promise<CuelinksConvertResult> {
    if (!targetUrl || typeof targetUrl !== "string") {
      return { originalUrl: "", affiliateUrl: "", isAffiliate: false, status: "NON_MONETIZED" };
    }

    if (!this.apiKey) {
      if (this.publisherId) {
        const tracking = this.buildTrackingUrl(targetUrl, subId);
        return {
          originalUrl: targetUrl,
          affiliateUrl: tracking,
          isAffiliate: true,
          status: "MONETIZED",
        };
      }
      return {
        originalUrl: targetUrl,
        affiliateUrl: targetUrl,
        isAffiliate: false,
        status: "NON_MONETIZED",
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const url = `${this.baseUrl}/links/convert`;
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Token ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          url: targetUrl,
          subid: subId,
        }),
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = (await res.json()) as {
          affiliated?: boolean;
          tracking_url?: string;
          url?: string;
          short_url?: string;
        };

        if (data.affiliated === true) {
          const affUrl = data.tracking_url || data.short_url || data.url || targetUrl;
          return {
            originalUrl: targetUrl,
            affiliateUrl: affUrl,
            isAffiliate: true,
            status: "MONETIZED",
          };
        }

        return {
          originalUrl: targetUrl,
          affiliateUrl: targetUrl,
          isAffiliate: false,
          status: "NON_MONETIZED",
        };
      }
    } catch {
      // API call failed, fall back safely
    }

    if (this.publisherId) {
      return {
        originalUrl: targetUrl,
        affiliateUrl: this.buildTrackingUrl(targetUrl, subId),
        isAffiliate: true,
        status: "MONETIZED",
      };
    }

    return {
      originalUrl: targetUrl,
      affiliateUrl: targetUrl,
      isAffiliate: false,
      status: "CONVERSION_FAILED",
      error: "Cuelinks conversion request could not be completed.",
    };
  }

  /**
   * Retrieves active participating campaigns across retailers (GET /campaigns.json)
   */
  async searchCampaigns(query?: string, page = 1, limit = 20): Promise<{ campaigns: CuelinksCampaign[]; total: number }> {
    if (!this.apiKey) return { campaigns: [], total: 0 };

    try {
      const url = new URL(`${this.baseUrl}/campaigns.json`);
      if (query) url.searchParams.set("search", query);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) return { campaigns: [], total: 0 };

      const json = (await res.json()) as {
        campaigns?: Array<{
          id: number;
          name: string;
          url: string;
          domain: string;
          category?: string;
          payout?: string;
          status?: string;
          approval_required?: boolean;
        }>;
        total?: number;
      };

      const campaigns = (json.campaigns ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        url: c.url,
        domain: c.domain,
        category: c.category ?? "General",
        payout: c.payout ?? "Standard",
        status: c.status ?? "active",
        approvalRequired: Boolean(c.approval_required),
      }));

      return { campaigns, total: json.total ?? campaigns.length };
    } catch {
      return { campaigns: [], total: 0 };
    }
  }

  /**
   * Retrieves real offers and coupon codes (GET /offers.json)
   */
  async getOffers(params?: { campaignId?: number; page?: number; limit?: number }): Promise<CuelinksOffer[]> {
    if (!this.apiKey) return [];

    try {
      const url = new URL(`${this.baseUrl}/offers.json`);
      if (params?.campaignId) url.searchParams.set("campaign_id", String(params.campaignId));
      if (params?.page) url.searchParams.set("page", String(params.page));
      if (params?.limit) url.searchParams.set("limit", String(params.limit));

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) return [];

      const json = (await res.json()) as {
        offers?: Array<{
          id: number;
          campaign_id: number;
          campaign_name?: string;
          title: string;
          coupon_code?: string;
          description?: string;
          url: string;
          start_date?: string;
          end_date?: string;
          status?: string;
        }>;
      };

      const now = new Date();
      return (json.offers ?? []).map((o) => {
        const isExpired = o.end_date ? new Date(o.end_date) < now : false;
        return {
          id: o.id,
          campaignId: o.campaign_id,
          campaignName: o.campaign_name || "Merchant Campaign",
          title: o.title,
          couponCode: o.coupon_code || null,
          description: o.description || "",
          url: o.url,
          startDate: o.start_date,
          endDate: o.end_date,
          status: isExpired ? "expired" : "active",
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Retrieves affiliate transactions and commissions (GET /transactions.json)
   */
  async getTransactions(startDate?: string, endDate?: string): Promise<CuelinksTransaction[]> {
    if (!this.apiKey) return [];

    try {
      const url = new URL(`${this.baseUrl}/transactions.json`);
      if (startDate) url.searchParams.set("from", startDate);
      if (endDate) url.searchParams.set("to", endDate);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) return [];

      const json = (await res.json()) as {
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
        let status: "pending" | "approved" | "rejected" | "cancelled" | "payable" | "paid" = "pending";
        const rawStatus = (t.status || "").toLowerCase();
        if (rawStatus.includes("approv")) status = "approved";
        else if (rawStatus.includes("reject")) status = "rejected";
        else if (rawStatus.includes("cancel")) status = "cancelled";
        else if (rawStatus.includes("paid")) status = "paid";
        else if (rawStatus.includes("payable")) status = "payable";

        return {
          id: String(t.id),
          campaignName: t.campaign_name,
          orderId: t.order_id,
          status,
          commissionMinor: Math.round(Number(t.commission || 0) * 100),
          currency: t.currency ?? "INR",
          transactionDate: t.created_at,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Retrieves Cuelinks performance, earnings, and unmonetized traffic reports
   */
  async getReports(
    reportType: "performance" | "campaigns" | "earnings" | "unmonetized_traffic",
    params?: Record<string, string>
  ): Promise<Record<string, unknown> | null> {
    if (!this.apiKey) return null;

    try {
      const url = new URL(`${this.baseUrl}/reports/${reportType}.json`);
      if (params) {
        for (const [key, val] of Object.entries(params)) {
          url.searchParams.set(key, val);
        }
      }

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Token ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export const cuelinksClient = new CuelinksClient();

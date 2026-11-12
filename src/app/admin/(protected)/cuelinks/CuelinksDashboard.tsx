"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./cuelinks-dashboard.module.css";
import type { CuelinksHealth, CuelinksConvertResult } from "@/server/affiliate/cuelinks-client";

interface CuelinksStats {
  totalDeals: number;
  monetizedDeals: number;
  unmonetizedDeals: number;
  monetizationRate: number;
  totalClicks: number;
  totalTransactions: number;
  totalEarningsPaise: number;
}

interface CuelinksCampaign {
  id: number;
  name: string;
  url: string;
  domain: string;
  category: string;
  payout: string;
  status: string;
}

interface CuelinksOffer {
  id: number;
  campaignName: string;
  title: string;
  couponCode?: string | null;
  description: string;
  url: string;
  status: string;
}

interface InitialData {
  health: CuelinksHealth;
  stats: CuelinksStats;
  campaigns: CuelinksCampaign[];
  offers: CuelinksOffer[];
}

const defaultData: InitialData = {
  health: { isLive: false, status: "NOT_CONFIGURED", message: "Loading Cuelinks...", checkedAt: new Date().toISOString() },
  stats: {
    totalDeals: 0,
    monetizedDeals: 0,
    unmonetizedDeals: 0,
    monetizationRate: 0,
    totalClicks: 0,
    totalTransactions: 0,
    totalEarningsPaise: 0,
  },
  campaigns: [],
  offers: [],
};

export function CuelinksDashboard({
  initialData,
  role,
}: {
  initialData?: InitialData;
  role: string;
}) {
  const [data, setData] = useState<InitialData>(initialData ?? defaultData);
  const [activeTab, setActiveTab] = useState<"overview" | "tester" | "campaigns" | "offers">("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Conversion Tester State
  const [testUrl, setTestUrl] = useState("https://www.amazon.in/dp/B0CX234");
  const [testSubId, setTestSubId] = useState("admin_test");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState<CuelinksConvertResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Campaign search state
  const [campaignSearch, setCampaignSearch] = useState("");

  const refreshHealthAndStats = useCallback(async () => {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/v1/admin/cuelinks");
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (json.data) {
        setData(json.data);
        setStatusMessage("Cuelinks status and database metrics updated successfully.");
      }
    } catch (err) {
      setStatusMessage(`Failed to refresh Cuelinks data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!initialData) void Promise.resolve().then(refreshHealthAndStats);
  }, [initialData, refreshHealthAndStats]);

  const handleTestConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testUrl.trim()) return;

    setIsConverting(true);
    setConversionResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/v1/admin/cuelinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_convert",
          url: testUrl.trim(),
          subId: testSubId.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.data) {
        setConversionResult(json.data);
      } else {
        alert(json.error || "Failed to convert URL");
      }
    } catch (err) {
      alert(`Error converting link: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsConverting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { health, stats, campaigns, offers } = data;

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(campaignSearch.toLowerCase()) ||
      c.domain.toLowerCase().includes(campaignSearch.toLowerCase()) ||
      c.category.toLowerCase().includes(campaignSearch.toLowerCase())
  );

  return (
    <main className={styles.adminPage}>
      {/* Navigation */}
      <AdminNav active="affiliate" />

      {/* Header */}
      <header className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>Monetization & Affiliate Engine</div>
          <h1>Cuelinks V3 Management</h1>
          <p className={styles.meta}>
            Sole affiliate monetization provider for MetaDeals4U · Signed in as {role.toLowerCase().replace("_", " ")}
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.syncBtn}
            onClick={refreshHealthAndStats}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Checking..." : "Check API Health"}
          </button>
        </div>
      </header>

      {statusMessage && (
        <div className={styles.setupNotice} style={{ borderColor: "var(--md-color-primary)" }}>
          {statusMessage}
        </div>
      )}

      {/* Metric Cards */}
      <div className={styles.metricGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Connection Health</div>
          <div style={{ marginTop: 4 }}>
            {health.status === "LIVE_CONNECTED" ? (
              <span className={`${styles.badge} ${styles.badgeLive}`}>LIVE CONNECTED</span>
            ) : health.status === "NOT_CONFIGURED" ? (
              <span className={`${styles.badge} ${styles.badgeNotConfigured}`}>NOT CONFIGURED</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeFailed}`}>{health.status}</span>
            )}
          </div>
          <div className={styles.metricSub}>
            {health.publisherId ? `Pub ID: ${health.publisherId}` : "No publisher ID configured"}
          </div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Monetized Deals</div>
          <div className={styles.metricValue}>
            {stats.monetizedDeals} / {stats.totalDeals}
          </div>
          <div className={styles.metricSub}>{stats.monetizationRate}% of published deals have affiliate tracking</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Affiliate Clicks</div>
          <div className={styles.metricValue}>{stats.totalClicks}</div>
          <div className={styles.metricSub}>Tracked via /go/[dealId] redirect</div>
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricLabel}>Transactions Recorded</div>
          <div className={styles.metricValue}>{stats.totalTransactions}</div>
          <div className={styles.metricSub}>
            Earned ₹{Math.round(stats.totalEarningsPaise / 100).toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabsBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === "overview" ? styles.activeTabBtn : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview & Setup
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "tester" ? styles.activeTabBtn : ""}`}
          onClick={() => setActiveTab("tester")}
        >
          Live Link Tester
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "campaigns" ? styles.activeTabBtn : ""}`}
          onClick={() => setActiveTab("campaigns")}
        >
          Campaigns ({campaigns.length})
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === "offers" ? styles.activeTabBtn : ""}`}
          onClick={() => setActiveTab("offers")}
        >
          Offers & Coupons ({offers.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & SETUP */}
      {activeTab === "overview" && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Cuelinks V3 Architecture & Integration</h2>
          <div className={styles.setupNotice}>
            <strong>Sole Monetization Provider:</strong> All retailer links across MetaDeals4U (Amazon, Flipkart,
            Myntra, Tata CLiQ, Croma, Reliance Digital, AJIO, etc.) are converted to tracked Cuelinks affiliate links.
            Direct associate tags have been consolidated into Cuelinks V3 so that all traffic, conversions, and
            commissions are centralized.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>Environment Configuration</h3>
              <p style={{ fontSize: 14, color: "var(--md-color-text-secondary)", lineHeight: 1.5 }}>
                Configure the following keys in your <code>.env</code> file:
              </p>
              <pre
                style={{
                  background: "var(--md-color-surface)",
                  padding: 14,
                  borderRadius: 10,
                  fontSize: 13,
                  border: "1px solid var(--md-color-border)",
                  overflowX: "auto",
                }}
              >
{`# Cuelinks V3 Publisher API
CUELINKS_API_KEY=your_cuelinks_api_token
CUELINKS_PUB_ID=your_cuelinks_publisher_id
CUELINKS_BASE_URL=https://developers.cuelinks.com/pub_api/v3`}
              </pre>
              <p style={{ fontSize: 13, color: "var(--md-color-text-secondary)" }}>
                Current Status: <strong>{health.message || health.status}</strong>
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>Publishing & Redirect Flow</h3>
              <ol style={{ fontSize: 14, color: "var(--md-color-text-secondary)", lineHeight: 1.6, paddingLeft: 20 }}>
                <li>Admin scans or pastes product URL from any partner store.</li>
                <li>Scraper normalizes and extracts verified pricing and metadata.</li>
                <li>
                  During deal publishing, Cuelinks V3 API converts the retailer URL into a monetized tracking link.
                </li>
                <li>Visitor clicks &quot;Buy Now&quot; on MetaDeals4U &rarr; requests <code>/go/[dealId]</code>.</li>
                <li>Click attribution is safely logged in PostgreSQL (bot &amp; prefetch filtered).</li>
                <li>Visitor is seamlessly 302-redirected to the retailer with affiliate parameters.</li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: LIVE LINK TESTER */}
      {activeTab === "tester" && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Live Link Conversion Tester</h2>
          <p className={styles.panelSubtitle}>
            Test URL conversion against the live Cuelinks engine in real-time. Enter any retailer product link to
            inspect the generated affiliate tracking link.
          </p>

          <form onSubmit={handleTestConvert} className={styles.testerForm}>
            <div className={styles.testerRow}>
              <input
                type="url"
                className={styles.testerInput}
                placeholder="https://www.amazon.in/dp/... or https://www.flipkart.com/..."
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                required
              />
              <input
                type="text"
                className={styles.testerSubIdInput}
                placeholder="Sub ID (optional)"
                value={testSubId}
                onChange={(e) => setTestSubId(e.target.value)}
              />
              <button type="submit" className={styles.testerBtn} disabled={isConverting}>
                {isConverting ? "Converting..." : "Convert Link"}
              </button>
            </div>
          </form>

          {conversionResult && (
            <div className={styles.testerResultBox}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong>Conversion Result:</strong>
                {conversionResult.status === "MONETIZED" ? (
                  <span className={`${styles.badge} ${styles.badgeLive}`}>MONETIZED</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeNotConfigured}`}>
                    {conversionResult.status}
                  </span>
                )}
              </div>

              <div>
                <span style={{ fontSize: 12, color: "var(--md-color-text-secondary)", display: "block" }}>
                  Destination Tracking URL:
                </span>
                <div className={styles.resultUrlRow}>
                  <span>{conversionResult.affiliateUrl}</span>
                  <button
                    className={styles.copyBtn}
                    onClick={() => copyToClipboard(conversionResult.affiliateUrl)}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 13, color: "var(--md-color-text-secondary)" }}>
                Original: <span style={{ fontFamily: "monospace" }}>{conversionResult.originalUrl}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: CAMPAIGNS */}
      {activeTab === "campaigns" && (
        <section className={styles.panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 className={styles.panelTitle} style={{ margin: 0 }}>
              Partner Campaigns
            </h2>
            <input
              type="text"
              placeholder="Search campaigns..."
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              className={styles.testerInput}
              style={{ maxWidth: 280, padding: "8px 12px" }}
            />
          </div>

          {filteredCampaigns.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Merchant / Campaign</th>
                    <th>Domain</th>
                    <th>Category</th>
                    <th>Payout / Commission</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>{c.domain}</td>
                      <td>{c.category}</td>
                      <td>
                        <span style={{ color: "var(--md-color-success)", fontWeight: 700 }}>{c.payout}</span>
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeLive}`}>{c.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              {health.status !== "LIVE_CONNECTED"
                ? "Connect CUELINKS_API_KEY in .env to view live merchant campaigns and commission payouts."
                : "No matching campaigns found."}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: OFFERS */}
      {activeTab === "offers" && (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Active Offers &amp; Coupons</h2>
          {offers.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Offer Title</th>
                    <th>Coupon Code</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.campaignName}</strong>
                      </td>
                      <td>{o.title}</td>
                      <td>
                        {o.couponCode ? (
                          <code style={{ background: "color-mix(in srgb, var(--md-color-text) 6%, transparent)", padding: "2px 6px", borderRadius: 4 }}>
                            {o.couponCode}
                          </code>
                        ) : (
                          <span style={{ color: "var(--md-color-text-secondary)" }}>No code needed</span>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles.badgeLive}`}>{o.status}</span>
                      </td>
                      <td>
                        {o.url && (
                          <a
                            href={o.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--md-color-primary)", textDecoration: "none", fontWeight: 600 }}
                          >
                            Visit Offer &rarr;
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState}>
              {health.status !== "LIVE_CONNECTED"
                ? "Connect CUELINKS_API_KEY in .env to retrieve curated offers and coupon codes from Cuelinks."
                : "No active offers available at this moment."}
            </div>
          )}
        </section>
      )}
    </main>
  );
}


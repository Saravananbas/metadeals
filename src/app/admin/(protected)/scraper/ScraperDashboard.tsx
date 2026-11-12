"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useCallback, useTransition, useEffect } from "react";
import {
  RefreshCw,
  Play,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  TrendingDown,
  Activity,
  Check,
  X,
  Radio,
} from "lucide-react";
import { formatINR } from "@/features/deals/pricing";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./scraper-dashboard.module.css";

export type CandidateItem = {
  id: string;
  sourceUrl: string;
  sourcePlatform: string;
  externalId: string | null;
  rawTitle: string;
  brand: string | null;
  categorySlug: string;
  observedPriceMinor: number;
  observedMrpMinor: number;
  currency: string;
  discountPercent: number;
  imageUrl: string | null;
  sellerName: string | null;
  inStock: boolean;
  confidenceScore: number;
  status: "DISCOVERED" | "VALIDATING" | "VERIFIED" | "UNCERTAIN" | "REJECTED" | "PUBLISHED";
  rejectionReason: string | null;
  rawData?: string | null;
  dealId: string | null;
  deal?: { id: string; slug: string; title: string } | null;
  priceObservations?: Array<{ priceMinor: number; mrpMinor: number; observedAt: string }>;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorInfo = {
  code: string;
  name: string;
  status?: string;
  isHealthy: boolean;
  isLive?: boolean;
  message?: string;
  lastCheckedAt: string;
  lastLiveRetrievalAt?: string | null;
  lastMockScanAt?: string | null;
  lastJob?: {
    id: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    itemsFound: number;
    itemsVerified: number;
    itemsPublished: number;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
};

export type ScraperMetricsData = {
  totalCandidates: number;
  verifiedCandidates: number;
  publishedDeals: number;
  pendingReview: number;
  rejectedCandidates: number;
  totalObservations: number;
  latestJob: {
    id: string;
    connectorCode: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    itemsFound: number;
    itemsVerified: number;
    itemsPublished: number;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
  } | null;
  lastSuccessfulScanAt: string | null;
  priceStats: {
    observationCount: number;
    median7DayMinor: number | null;
    median30DayMinor: number | null;
    median90DayMinor: number | null;
    lowestObservedMinor: number | null;
    highestObservedMinor: number | null;
    latestObservedAt: string | null;
  };
  connectors: ConnectorInfo[];
};

export type ScraperDashboardProps = {
  actorId: string;
  role: string;
  initialTab?: TabKey;
  initialMetrics?: ScraperMetricsData;
  initialCandidates?: {
    items: CandidateItem[];
    total: number;
    limit: number;
    offset: number;
  };
};

const defaultMetrics: ScraperMetricsData = {
  totalCandidates: 0,
  verifiedCandidates: 0,
  publishedDeals: 0,
  pendingReview: 0,
  rejectedCandidates: 0,
  totalObservations: 0,
  latestJob: null,
  lastSuccessfulScanAt: null,
  priceStats: {
    observationCount: 0,
    median7DayMinor: null,
    median30DayMinor: null,
    median90DayMinor: null,
    lowestObservedMinor: null,
    highestObservedMinor: null,
    latestObservedAt: null,
  },
  connectors: [],
};

export type TabKey = "overview" | "review" | "discovered" | "published" | "intelligence" | "connectors";

export function ScraperDashboard({
  role,
  initialMetrics,
  initialCandidates,
  initialTab = "overview",
}: ScraperDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [metrics, setMetrics] = useState<ScraperMetricsData>(initialMetrics ?? defaultMetrics);
  const [candidates, setCandidates] = useState<CandidateItem[]>(initialCandidates?.items ?? []);
  const [totalCandidatesCount, setTotalCandidatesCount] = useState(initialCandidates?.total ?? 0);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  const [selectedConnector, setSelectedConnector] = useState<string>(
    initialMetrics?.connectors[0]?.code || "cuelinks-feed"
  );
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<ScraperMetricsData["latestJob"]>(
    initialMetrics?.latestJob ?? null
  );

  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isRefreshing, startTransition] = useTransition();

  // Review confirmation modal state
  const [confirmAction, setConfirmAction] = useState<{
    candidate: CandidateItem;
    type: "APPROVE" | "REJECT";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Fetch metrics and candidates
  const refreshData = useCallback(async () => {
    try {
      setError("");
      const [metricsRes, candidatesRes] = await Promise.all([
        fetch("/api/v1/admin/scraper/metrics"),
        fetch(
          `/api/v1/admin/scraper/candidates?${
            statusFilter !== "ALL" ? `status=${encodeURIComponent(statusFilter)}&` : ""
          }limit=${pageSize}&offset=${(page - 1) * pageSize}`
        ),
      ]);

      if (metricsRes.ok) {
        const m = await metricsRes.json();
        if (m.data) setMetrics(m.data);
      }

      if (candidatesRes.ok) {
        const c = await candidatesRes.json();
        if (c.data) {
          setCandidates(c.data.items || []);
          setTotalCandidatesCount(c.data.total ?? 0);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh dashboard data.");
    }
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    if (!initialMetrics) void Promise.resolve().then(refreshData);
  }, [initialMetrics, refreshData]);

  // Handle Tab Change
  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
    setNotice("");
    setError("");
    if (tab === "review") {
      setStatusFilter("UNCERTAIN");
      setPage(1);
    } else if (tab === "published") {
      setStatusFilter("PUBLISHED");
      setPage(1);
    } else if (tab === "discovered") {
      setStatusFilter("ALL");
      setPage(1);
    }
  };

  // Run Connector Scan
  const handleRunScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isScanning) return;

    setIsScanning(true);
    setNotice("");
    setError("");

    try {
      const res = await fetch("/api/v1/admin/scraper/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorCode: selectedConnector }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Scan execution failed.");
      }

      const job = payload.data;
      setScanResult(job);

      if (job.status === "COMPLETED") {
        setNotice(
          `Scan completed successfully: Discovered ${job.itemsFound} items, verified ${job.itemsVerified}, automatically published ${job.itemsPublished} genuine deals.`
        );
      } else if (job.status === "FAILED") {
        setError(`Scan failed: ${job.errorMessage || "Unknown error"}`);
      }

      // Refresh metrics and candidates after scan
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run connector scan.");
    } finally {
      setIsScanning(false);
    }
  };

  // Execute Review Action (Approve / Reject)
  const handleExecuteReview = async () => {
    if (!confirmAction) return;

    setIsSubmittingReview(true);
    setError("");
    setNotice("");

    try {
      const res = await fetch("/api/v1/admin/scraper/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: confirmAction.candidate.id,
          action: confirmAction.type,
          reason: confirmAction.type === "REJECT" ? rejectReason : undefined,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Review action failed.");
      }

      if (confirmAction.type === "APPROVE") {
        setNotice(
          `Deal "${confirmAction.candidate.rawTitle}" approved and published successfully! Deal ID: ${payload.data.deal?.id || "N/A"}`
        );
      } else {
        setNotice(`Candidate "${confirmAction.candidate.rawTitle}" rejected.`);
      }

      setConfirmAction(null);
      setRejectReason("");
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process review action.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Uncertain candidates awaiting review
  const reviewCandidates = candidates.filter((c) => c.status === "UNCERTAIN");
  const publishedCandidates = candidates.filter((c) => c.status === "PUBLISHED");

  return (
    <main className={styles.adminPage}>
      {/* Admin Navigation */}
      <AdminNav active="scraper" />

      {/* Header */}
      <header className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>MetaDeals4U · Automated Deal Intelligence</div>
          <h1>Deal Scraper & Intelligence</h1>
          <p className={styles.meta}>
            Signed in as {role.toLowerCase().replace("_", " ")} · Automated discovery, verification gates & publishing engine
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => startTransition(() => refreshData())}
            disabled={isRefreshing}
            title="Refresh metrics and candidate listings"
          >
            <RefreshCw size={15} className={isRefreshing ? "spin" : ""} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <div className={styles.error} role="alert">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabsContainer} role="tablist">
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "overview" ? styles.tabButtonActive : ""}`}
          onClick={() => handleTabChange("overview")}
        >
          <Activity size={15} /> Overview & Scanner
        </button>

        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "review" ? styles.tabButtonActive : ""}`}
          onClick={() => handleTabChange("review")}
        >
          <AlertTriangle size={15} /> Review Queue
          {metrics.pendingReview > 0 && (
            <span className={`${styles.tabBadge} ${styles.tabBadgeAlert}`}>
              {metrics.pendingReview}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "discovered" ? styles.tabButtonActive : ""}`}
          onClick={() => handleTabChange("discovered")}
        >
          <LayersIcon size={15} /> Discovered Deals
          <span className={styles.tabBadge}>{metrics.totalCandidates}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "published" ? styles.tabButtonActive : ""}`}
          onClick={() => handleTabChange("published")}
        >
          <CheckCircle2 size={15} /> Published Deals
          <span className={styles.tabBadge}>{metrics.publishedDeals}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "intelligence" ? styles.tabButtonActive : ""}`}
          onClick={() => handleTabChange("intelligence")}
        >
          <TrendingDown size={15} /> Price Intelligence
        </button>

        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === "connectors" ? styles.tabButtonActive : ""}`}
          onClick={() => handleTabChange("connectors")}
        >
          <Radio size={15} /> Connector Health
          <span className={styles.tabBadge}>{metrics.connectors.length}</span>
        </button>
      </div>

      {/* SECTION A & B: OVERVIEW & RUN DISCOVERY */}
      {activeTab === "overview" && (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Engine Metrics Overview</h2>
            <p className={styles.sectionDescription}>
              Real-time aggregate telemetry from the automated discovery pipeline and deterministic verification engine.
            </p>

            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Total Discovered</div>
                <div className={styles.metricValue}>{metrics.totalCandidates.toLocaleString("en-IN")}</div>
                <div className={styles.metricSubtext}>Candidate offers ingested</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Verified Candidates</div>
                <div className={styles.metricValue} style={{ color: "var(--md-color-success)" }}>
                  {(metrics.verifiedCandidates ?? 0).toLocaleString("en-IN")}
                </div>
                <div className={styles.metricSubtext}>Passed all 6 gates</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Awaiting Review</div>
                <div className={styles.metricValue} style={{ color: "var(--md-color-warning)" }}>
                  {metrics.pendingReview.toLocaleString("en-IN")}
                </div>
                <div className={styles.metricSubtext}>Uncertain / anomaly flagged</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Auto-Published Deals</div>
                <div className={styles.metricValue} style={{ color: "var(--md-color-primary)" }}>
                  {metrics.publishedDeals.toLocaleString("en-IN")}
                </div>
                <div className={styles.metricSubtext}>Live on homepage catalog</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Rejected Candidates</div>
                <div className={styles.metricValue} style={{ color: "var(--md-color-danger)" }}>
                  {metrics.rejectedCandidates.toLocaleString("en-IN")}
                </div>
                <div className={styles.metricSubtext}>Failed verification thresholds</div>
              </div>

              <div className={styles.metricCard}>
                <div className={styles.metricLabel}>Price Observations</div>
                <div className={styles.metricValue}>
                  {metrics.totalObservations.toLocaleString("en-IN")}
                </div>
                <div className={styles.metricSubtext}>Historical data points</div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", fontSize: "13px", color: "var(--md-color-text-secondary)" }}>
              <div>
                <strong>Latest Scan Status:</strong>{" "}
                <span
                  className={`${styles.statusBadge} ${
                    metrics.latestJob?.status === "COMPLETED"
                      ? styles.statusPublished
                      : metrics.latestJob?.status === "RUNNING"
                      ? styles.statusDiscovered
                      : styles.statusRejected
                  }`}
                >
                  {metrics.latestJob?.status || "IDLE"}
                </span>
              </div>
              <div>
                <strong>Last Successful Scan:</strong>{" "}
                {metrics.lastSuccessfulScanAt
                  ? new Date(metrics.lastSuccessfulScanAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    }) + " IST"
                  : "None recorded yet"}
              </div>
            </div>
          </section>

          {/* RUN DISCOVERY SECTION */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Run Automated Discovery</h2>
            <p className={styles.sectionDescription}>
              Trigger an on-demand connector scan to scrape and ingest product deals from supported retailers.
            </p>

            <form className={styles.discoveryForm} onSubmit={handleRunScan}>
              <label htmlFor="connectorSelect" style={{ fontWeight: 600, fontSize: "14px" }}>
                Select Retailer Connector:
              </label>
              <select
                id="connectorSelect"
                className={styles.selectInput}
                value={selectedConnector}
                onChange={(e) => setSelectedConnector(e.target.value)}
                disabled={isScanning}
              >
                {metrics.connectors.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>

              <button
                type="submit"
                className={styles.button}
                disabled={isScanning}
              >
                <Play size={15} />
                {isScanning ? "Scanning Retailer..." : "Run Discovery Scan"}
              </button>
            </form>

            {/* Scan Execution Status Card */}
            {scanResult && (
              <div
                style={{
                  border: "1px solid var(--md-color-border)",
                  borderRadius: "14px",
                  padding: "18px",
                  background: "var(--md-color-surface)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>
                    Scan Job: {scanResult.connectorCode} ({scanResult.id})
                  </h3>
                  <span
                    className={`${styles.statusBadge} ${
                      scanResult.status === "COMPLETED"
                        ? styles.statusPublished
                        : scanResult.status === "RUNNING"
                        ? styles.statusDiscovered
                        : styles.statusRejected
                    }`}
                  >
                    {scanResult.status}
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px",
                    fontSize: "13px",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Started:</span>{" "}
                    <strong>
                      {new Date(scanResult.startedAt).toLocaleTimeString("en-IN", {
                        timeZone: "Asia/Kolkata",
                      })}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Completed:</span>{" "}
                    <strong>
                      {scanResult.completedAt
                        ? new Date(scanResult.completedAt).toLocaleTimeString("en-IN", {
                            timeZone: "Asia/Kolkata",
                          })
                        : "In progress"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Discovered:</span>{" "}
                    <strong>{scanResult.itemsFound} items</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Verified:</span>{" "}
                    <strong>{scanResult.itemsVerified} items</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Published:</span>{" "}
                    <strong>{scanResult.itemsPublished} deals</strong>
                  </div>
                </div>

                {scanResult.errorMessage && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px 12px",
                      background: "var(--md-color-danger-bg)",
                      color: "var(--md-color-danger)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  >
                    <strong>Error:</strong> {scanResult.errorMessage}
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* SECTION D: MANUAL REVIEW QUEUE */}
      {activeTab === "review" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <AlertTriangle size={18} style={{ color: "var(--md-color-warning)" }} />
            Manual Review Queue ({reviewCandidates.length})
          </h2>
          <p className={styles.sectionDescription}>
            Uncertain candidates flagged by verification gates (extreme discount &gt; 85%, price anomaly below 30-day median, or missing attributes). Review and approve genuine offers for publication, or reject false deals.
          </p>

          {reviewCandidates.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle2 size={36} style={{ color: "var(--md-color-success)", marginBottom: "10px" }} />
              <p>No uncertain deals currently awaiting review.</p>
              <p style={{ fontSize: "12px" }}>All discovered deals have either passed verification or been processed.</p>
            </div>
          ) : (
            <div className={styles.reviewGrid}>
              {reviewCandidates.map((candidate) => (
                <article key={candidate.id} className={styles.reviewItemCard}>
                  <Image
                    unoptimized
                    src={candidate.imageUrl || "/deal-placeholder.svg"}
                    alt={candidate.rawTitle}
                    width={80}
                    height={80}
                    className={styles.reviewThumb}
                  />

                  <div className={styles.reviewContent}>
                    <h3>{candidate.rawTitle}</h3>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "12px", color: "var(--md-color-text-muted)" }}>
                      <span><strong>Brand:</strong> {candidate.brand || "Unspecified"}</span>
                      <span>•</span>
                      <span><strong>Retailer:</strong> {candidate.sourcePlatform}</span>
                      <span>•</span>
                      <span><strong>Category:</strong> {candidate.categorySlug}</span>
                      <span>•</span>
                      <a
                        href={candidate.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={styles.linkExternal}
                      >
                        Source URL <ExternalLink size={12} />
                      </a>
                    </div>

                    <div className={styles.reviewPrices}>
                      <span className={styles.currentPrice}>
                        {formatINR(candidate.observedPriceMinor / 100)}
                      </span>
                      <span className={styles.mrpPrice}>
                        {formatINR(candidate.observedMrpMinor / 100)}
                      </span>
                      <span className={styles.discountPill}>
                        {candidate.discountPercent}% OFF
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--md-color-text-muted)" }}>
                        Confidence: {candidate.confidenceScore}/100
                      </span>
                    </div>

                    {/* Verification Reason / Anomaly Details */}
                    {candidate.rejectionReason && (
                      <div className={styles.reviewWarningBox}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span><strong>Warning:</strong> {candidate.rejectionReason}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.reviewActions}>
                    <button
                      type="button"
                      className={styles.approveButton}
                      onClick={() => setConfirmAction({ candidate, type: "APPROVE" })}
                    >
                      <Check size={14} /> Approve & Publish
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => setConfirmAction({ candidate, type: "REJECT" })}
                    >
                      <X size={14} /> Reject Deal
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION C: DISCOVERED DEALS */}
      {activeTab === "discovered" && (
        <section className={styles.section}>
          <div className={styles.filtersRow}>
            <div>
              <h2 className={styles.sectionTitle}>Discovered Deal Candidates</h2>
              <p className={styles.sectionDescription} style={{ marginBottom: 0 }}>
                Complete audit table of all candidate products ingested from retailer connectors.
              </p>
            </div>

            <div className={styles.filterGroup}>
              <label htmlFor="statusFilterSelect" style={{ fontSize: "13px", fontWeight: 600 }}>
                Status:
              </label>
              <select
                id="statusFilterSelect"
                className={styles.selectInput}
                style={{ minWidth: "160px" }}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">All Statuses ({totalCandidatesCount})</option>
                <option value="DISCOVERED">Discovered</option>
                <option value="VERIFIED">Verified</option>
                <option value="UNCERTAIN">Uncertain (Review)</option>
                <option value="PUBLISHED">Published</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
          </div>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Retailer</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>MRP</th>
                  <th>Discount</th>
                  <th>Status</th>
                  <th>Discovered</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.emptyState}>
                      No candidate deals match the selected filter.
                    </td>
                  </tr>
                ) : (
                  candidates.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.productCell}>
                          <Image
                            unoptimized
                            src={item.imageUrl || "/deal-placeholder.svg"}
                            alt={item.rawTitle}
                            width={44}
                            height={44}
                            className={styles.productThumb}
                          />
                          <div className={styles.productInfo}>
                            <div className={styles.productTitle} title={item.rawTitle}>
                              {item.rawTitle}
                            </div>
                            <div className={styles.productMeta}>
                              <span>{item.brand || "No Brand"}</span>
                              <span>•</span>
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className={styles.linkExternal}
                              >
                                View source <ExternalLink size={10} />
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{item.sourcePlatform}</td>
                      <td>{item.categorySlug}</td>
                      <td>
                        <strong>{formatINR(item.observedPriceMinor / 100)}</strong>
                      </td>
                      <td>
                        <span style={{ textDecoration: "line-through", color: "var(--md-color-text-muted)" }}>
                          {formatINR(item.observedMrpMinor / 100)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.discountPill}>{item.discountPercent}%</span>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            item.status === "PUBLISHED" || item.status === "VERIFIED"
                              ? styles.statusPublished
                              : item.status === "UNCERTAIN"
                              ? styles.statusUncertain
                              : item.status === "REJECTED"
                              ? styles.statusRejected
                              : styles.statusDiscovered
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--md-color-text-muted)" }}>
                        {new Date(item.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className={styles.pagination}>
            <span>
              Showing {candidates.length > 0 ? (page - 1) * pageSize + 1 : 0} -{" "}
              {Math.min(page * pageSize, totalCandidatesCount)} of {totalCandidatesCount}
            </span>
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ minHeight: "36px", padding: "6px 12px" }}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              className={styles.secondaryButton}
              style={{ minHeight: "36px", padding: "6px 12px" }}
              disabled={page * pageSize >= totalCandidatesCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}

      {/* SECTION E: PUBLISHED DEALS */}
      {activeTab === "published" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <CheckCircle2 size={18} style={{ color: "var(--md-color-success)" }} />
            Automated Published Deals ({publishedCandidates.length})
          </h2>
          <p className={styles.sectionDescription}>
            Deals that successfully passed all verification gates and were automatically published to the live MetaDeals4U homepage.
          </p>

          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Retailer</th>
                  <th>Live Price</th>
                  <th>MRP</th>
                  <th>Savings</th>
                  <th>Published Date</th>
                  <th>Public Link</th>
                </tr>
              </thead>
              <tbody>
                {publishedCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyState}>
                      No automated deals published yet. Run a discovery scan to verify and publish deals.
                    </td>
                  </tr>
                ) : (
                  publishedCandidates.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className={styles.productCell}>
                          <Image
                            unoptimized
                            src={item.imageUrl || "/deal-placeholder.svg"}
                            alt={item.rawTitle}
                            width={44}
                            height={44}
                            className={styles.productThumb}
                          />
                          <div className={styles.productInfo}>
                            <div className={styles.productTitle}>{item.rawTitle}</div>
                            <div className={styles.productMeta}>
                              <span>{item.brand || "Generic"}</span>
                              <span>•</span>
                              <span>{item.categorySlug}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{item.sourcePlatform}</td>
                      <td>
                        <strong style={{ color: "var(--md-color-success)" }}>
                          {formatINR(item.observedPriceMinor / 100)}
                        </strong>
                      </td>
                      <td>
                        <span style={{ textDecoration: "line-through", color: "var(--md-color-text-muted)" }}>
                          {formatINR(item.observedMrpMinor / 100)}
                        </span>
                      </td>
                      <td>
                        <span className={styles.discountPill}>
                          {item.discountPercent}% OFF
                        </span>
                      </td>
                      <td>
                        {new Date(item.updatedAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td>
                        {item.deal?.slug || item.deal?.id ? (
                          <Link
                            href={`/deal/${item.deal.slug || item.deal.id}`}
                            target="_blank"
                            className={styles.linkExternal}
                          >
                            View Live Deal <ExternalLink size={12} />
                          </Link>
                        ) : (
                          <span style={{ color: "var(--md-color-text-muted)" }}>Published</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION F: PRICE INTELLIGENCE */}
      {activeTab === "intelligence" && (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Historical Price Telemetry</h2>
            <p className={styles.sectionDescription}>
              Ground-truth statistical reference baselines derived from live price observations across Indian e-commerce merchants.
            </p>

            <div className={styles.priceIntelligenceGrid}>
              <div className={styles.priceStatCard}>
                <div className={styles.metricLabel}>Total Observations</div>
                <div className={styles.metricValue}>
                  {metrics.priceStats.observationCount.toLocaleString("en-IN")}
                </div>
                <div className={styles.metricSubtext}>Price tracking records</div>
              </div>

              <div className={styles.priceStatCard}>
                <div className={styles.metricLabel}>7-Day Median Price</div>
                <div className={styles.metricValue}>
                  {metrics.priceStats.median7DayMinor !== null
                    ? formatINR(metrics.priceStats.median7DayMinor / 100)
                    : "Insufficient data"}
                </div>
                <div className={styles.metricSubtext}>Rolling 7-day benchmark</div>
              </div>

              <div className={styles.priceStatCard}>
                <div className={styles.metricLabel}>30-Day Median Price</div>
                <div className={styles.metricValue}>
                  {metrics.priceStats.median30DayMinor !== null
                    ? formatINR(metrics.priceStats.median30DayMinor / 100)
                    : "Insufficient data"}
                </div>
                <div className={styles.metricSubtext}>Primary anomaly comparison</div>
              </div>

              <div className={styles.priceStatCard}>
                <div className={styles.metricLabel}>90-Day Median Price</div>
                <div className={styles.metricValue}>
                  {metrics.priceStats.median90DayMinor !== null
                    ? formatINR(metrics.priceStats.median90DayMinor / 100)
                    : "Insufficient data"}
                </div>
                <div className={styles.metricSubtext}>Quarterly pricing trend</div>
              </div>

              <div className={styles.priceStatCard}>
                <div className={styles.metricLabel}>Lowest Observed</div>
                <div className={styles.metricValue} style={{ color: "var(--md-color-success)" }}>
                  {metrics.priceStats.lowestObservedMinor !== null
                    ? formatINR(metrics.priceStats.lowestObservedMinor / 100)
                    : "N/A"}
                </div>
                <div className={styles.metricSubtext}>All-time record low</div>
              </div>

              <div className={styles.priceStatCard}>
                <div className={styles.metricLabel}>Highest Observed</div>
                <div className={styles.metricValue}>
                  {metrics.priceStats.highestObservedMinor !== null
                    ? formatINR(metrics.priceStats.highestObservedMinor / 100)
                    : "N/A"}
                </div>
                <div className={styles.metricSubtext}>Peak recorded price</div>
              </div>
            </div>
          </section>

          {/* Verification Rules Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Deterministic Verification Gates</h2>
            <p className={styles.sectionDescription}>
              The 6 automated gates enforced by the Deal Scraper & Intelligence Engine:
            </p>

            <div style={{ display: "grid", gap: "12px", fontSize: "13px", lineHeight: "1.6" }}>
              <div style={{ padding: "12px", background: "var(--md-color-surface)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                <strong>Gate A — Genuine Discount Verification:</strong> Confirms selling price is strictly lower than authentic MRP and calculates verified savings.
              </div>
              <div style={{ padding: "12px", background: "var(--md-color-surface)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                <strong>Gate B — Extreme Discount Protection:</strong> Discounts &ge; 85% are automatically held in the Manual Review Queue to prevent pricing glitch dissemination.
              </div>
              <div style={{ padding: "12px", background: "var(--md-color-surface)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                <strong>Gate C — Historical Median Anomaly:</strong> Price drops exceeding 70% below the 30-day historical median are routed to administrators.
              </div>
              <div style={{ padding: "12px", background: "var(--md-color-surface)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                <strong>Gate D — Price Integrity & Logic:</strong> Rejects zero, negative, missing, or malformed prices (price &gt; MRP).
              </div>
              <div style={{ padding: "12px", background: "var(--md-color-surface)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                <strong>Gate E — URL Security & In-Stock:</strong> Requires secure HTTPS, validated merchant domain, and positive in-stock status.
              </div>
              <div style={{ padding: "12px", background: "var(--md-color-surface)", borderRadius: "10px", border: "1px solid var(--md-color-border)" }}>
                <strong>Gate F — Minimum Savings Threshold:</strong> Offers with &lt; 5% discount are filtered out to keep deal quality high.
              </div>
            </div>
          </section>
        </>
      )}

      {/* SECTION G: CONNECTOR HEALTH */}
      {activeTab === "connectors" && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Retailer Connector Health & Status</h2>
          <p className={styles.sectionDescription}>
            Status, diagnostics and execution history for registered e-commerce connectors.
          </p>

          <div className={styles.connectorGrid}>
            {metrics.connectors.map((c) => (
              <div key={c.code} className={styles.connectorCard}>
                <div className={styles.connectorCardHeader}>
                  <div>
                    <h3 className={styles.connectorTitle}>{c.name}</h3>
                    <div className={styles.connectorCode}>{c.code}</div>
                  </div>
                  <span
                    className={`${styles.statusBadge} ${
                      c.isLive
                        ? styles.statusPublished
                        : c.status === "FIXTURE_MODE" || c.status === "MOCK_MODE"
                        ? styles.statusUncertain
                        : styles.statusRejected
                    }`}
                  >
                    {c.status ?? (c.isHealthy ? "HEALTHY" : "DEGRADED")}
                  </span>
                </div>

                <div className={styles.connectorMessage}>
                  {c.message || "Ready for automated discovery scan."}
                </div>

                <div className={styles.connectorStats}>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Mode:</span>{" "}
                    <strong>{c.isLive ? "Live Connected" : "Static Fixture / Mock"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Checked At:</span>{" "}
                    {new Date(c.lastCheckedAt).toLocaleTimeString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Last Live Retrieval:</span>{" "}
                    {c.lastLiveRetrievalAt ? (
                      new Date(c.lastLiveRetrievalAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      <span style={{ color: "var(--md-amber-700)" }}>None (API credentials required)</span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: "var(--md-color-text-muted)" }}>Last Mock Scan:</span>{" "}
                    {c.lastMockScanAt ? (
                      new Date(c.lastMockScanAt).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    ) : (
                      "None recorded"
                    )}
                  </div>
                  {c.lastJob ? (
                    <>
                      <div>
                        <span style={{ color: "var(--md-color-text-muted)" }}>Last Scan:</span>{" "}
                        <strong
                          style={{
                            color:
                              c.lastJob.status === "COMPLETED"
                                ? "var(--md-color-success)"
                                : "var(--md-color-danger)",
                          }}
                        >
                          {c.lastJob.status}
                        </strong>{" "}
                        ({c.lastJob.itemsPublished} published)
                      </div>
                      <div>
                        <span style={{ color: "var(--md-color-text-muted)" }}>Last Run Time:</span>{" "}
                        {new Date(c.lastJob.startedAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </>
                  ) : (
                    <div>
                      <span style={{ color: "var(--md-color-text-muted)" }}>Last Scan:</span> No scan recorded yet
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CONFIRMATION / REJECTION MODAL */}
      {confirmAction && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>
              {confirmAction.type === "APPROVE" ? "Approve & Publish Deal" : "Reject Candidate Deal"}
            </h3>

            <div className={styles.modalBody}>
              {confirmAction.type === "APPROVE" ? (
                <>
                  <p>
                    Are you sure you want to approve <strong>&quot;{confirmAction.candidate.rawTitle}&quot;</strong>?
                  </p>
                  <p>
                    This will immediately publish the deal to the public MetaDeals4U website at{" "}
                    <strong>{formatINR(confirmAction.candidate.observedPriceMinor / 100)}</strong> ({confirmAction.candidate.discountPercent}% off MRP).
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Are you sure you want to reject <strong>&quot;{confirmAction.candidate.rawTitle}&quot;</strong>?
                  </p>
                  <p>
                    This will mark the candidate as REJECTED. It will not be published to the public catalog.
                  </p>
                  <label htmlFor="rejectReasonText" style={{ display: "block", fontWeight: 600, fontSize: "13px", marginTop: "10px" }}>
                    Rejection Reason (optional):
                  </label>
                  <textarea
                    id="rejectReasonText"
                    className={styles.reasonInput}
                    placeholder="e.g. Extreme pricing error, retailer glitch, or refurbished item"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </>
              )}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setConfirmAction(null);
                  setRejectReason("");
                }}
                disabled={isSubmittingReview}
              >
                Cancel
              </button>

              {confirmAction.type === "APPROVE" ? (
                <button
                  type="button"
                  className={styles.approveButton}
                  onClick={handleExecuteReview}
                  disabled={isSubmittingReview}
                >
                  <Check size={14} />
                  {isSubmittingReview ? "Publishing..." : "Confirm & Publish"}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={handleExecuteReview}
                  disabled={isSubmittingReview}
                >
                  <X size={14} />
                  {isSubmittingReview ? "Rejecting..." : "Confirm Rejection"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LayersIcon({ size }: { size?: number }) {
  return (
    <svg
      width={size || 16}
      height={size || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}


import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import styles from "./intelligence.module.css";

function countByStatus<T extends string>(rows: Array<{ status: T; _count: { _all: number } }>) {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all])) as Partial<Record<T, number>>;
}

async function safeQuery<T>(query: Promise<T>) {
  try {
    return { value: await query, available: true } as const;
  } catch {
    return { value: null, available: false } as const;
  }
}

function displayCount(value: number | null | undefined) {
  return value === null || value === undefined ? "Unavailable" : value.toLocaleString("en-IN");
}

function Metric({ label, value, hint }: { label: string; value: number | string | null; hint?: string }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value === null ? "Unavailable" : typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function Unavailable({ children }: { children: string }) {
  return <span className={styles.unavailable} title={children}>Unavailable: {children}</span>;
}

function when(value: Date | null | undefined) {
  return value ? value.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "No record";
}

export default async function DealIntelligencePage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "intelligence:view")) redirect(firstAllowedPath(context.user));

  const db = getDatabase();
  const [candidateRowsResult, authorizationRowsResult, candidateTotalResult, shadowTotalResult, latestCandidateResult, latestAuthorizationResult,
    latestShadowResult, sourcesResult, publishedDealsResult, priceObservationsResult, latestPriceObservationResult, lifecycleEventsResult, latestJobsResult] = await Promise.all([
    safeQuery(db.dealCandidate.groupBy({ by: ["status"], _count: { _all: true } })),
    safeQuery(db.publicationAuthorization.groupBy({ by: ["status"], _count: { _all: true } })),
    safeQuery(db.dealCandidate.count()),
    safeQuery(db.shadowCandidate.count()),
    safeQuery(db.dealCandidate.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } })),
    safeQuery(db.publicationAuthorization.findFirst({ orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } })),
    safeQuery(db.shadowCandidate.findFirst({ orderBy: { discoveredAt: "desc" }, select: { competitorSource: true, discoveredAt: true } })),
    safeQuery(db.sourceHealthRecord.findMany({ orderBy: { connectorCode: "asc" }, select: { connectorCode: true, state: true, totalRequests: true, successfulRequests: true, consecutiveFailures: true, lastSuccessAt: true, lastFailureAt: true } })),
    safeQuery(db.deal.count({ where: { status: "PUBLISHED" } })),
    safeQuery(db.priceObservationRecord.count()),
    safeQuery(db.priceObservationRecord.findFirst({ orderBy: { observedAt: "desc" }, select: { merchantSlug: true, observedAt: true } })),
    safeQuery(db.dealLifecycleEvent.count()),
    safeQuery(db.scraperJob.findMany({ orderBy: { startedAt: "desc" }, take: 8, select: { id: true, connectorCode: true, status: true, itemsFound: true, itemsVerified: true, itemsPublished: true, errorMessage: true, startedAt: true, completedAt: true } })),
  ]);

  const candidateRows = candidateRowsResult.value;
  const authorizationRows = authorizationRowsResult.value;
  const candidateCounts = candidateRows ? countByStatus(candidateRows) : null;
  const authorizationCounts = authorizationRows ? countByStatus(authorizationRows) : null;
  const candidateTotal = candidateTotalResult.value;
  const shadowTotal = shadowTotalResult.value;
  const latestCandidate = latestCandidateResult.value;
  const latestAuthorization = latestAuthorizationResult.value;
  const latestShadow = latestShadowResult.value;
  const sources = sourcesResult.value;
  const publishedDeals = publishedDealsResult.value;
  const priceObservations = priceObservationsResult.value;
  const latestPriceObservation = latestPriceObservationResult.value;
  const lifecycleEvents = lifecycleEventsResult.value;
  const latestJobs = latestJobsResult.value;
  const uncertainCandidates = candidateCounts?.UNCERTAIN;
  const recoveryAuthorizations = authorizationCounts?.RECOVERY_REQUIRED;
  const pendingAuthorizations = authorizationCounts?.PENDING_APPROVAL;
  const publishingAuthorizations = authorizationCounts?.PUBLISHING;
  const publishedAuthorizations = authorizationCounts?.PUBLISHED;
  const approvedAuthorizations = authorizationCounts?.APPROVED;
  const reviewCount = uncertainCandidates === undefined || recoveryAuthorizations === undefined
    ? null
    : uncertainCandidates + recoveryAuthorizations;

  return (
    <main className={styles.page}>
      <AdminNav active="intelligence" />
      <header className={styles.header}>
        <h1 className="sr-only">Deal Intelligence</h1>
        <span className={styles.readOnly}>Read only · Agent permissions enforced by server workflows</span>
      </header>

      <section className={styles.metrics} aria-label="Current operational metrics">
        <Metric label="Deals discovered" value={candidateTotal} hint={`Latest: ${candidateTotal === null || !latestCandidateResult.available ? "Unavailable" : when(latestCandidate?.createdAt)}`} />
        <Metric label="Awaiting review" value={reviewCount} />
        <Metric label="Published deals" value={publishedDeals} />
        <Metric label="Price observations" value={priceObservations} hint={`Latest: ${priceObservations === null || !latestPriceObservationResult.available ? "Unavailable" : when(latestPriceObservation?.observedAt)}`} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><h2>Agent operations</h2><p>Counts are read from persisted application records. Missing execution timing is shown as unavailable.</p></div></div>
        <div className={styles.agentGrid}>
          <article className={styles.agent}>
            <div className={styles.agentHeading}><div><span className={styles.agentLabel}>Agent 1</span><h3>Deal Hunter</h3></div><span className={styles.badge}>Discovery</span></div>
            <dl className={styles.definitionGrid}>
              <div><dt>Discovered</dt><dd>{displayCount(candidateTotal)}</dd></div>
              <div><dt>Approved for publishing</dt><dd>{displayCount(approvedAuthorizations)}</dd></div>
              <div><dt>Review required</dt><dd>{displayCount(uncertainCandidates)}</dd></div>
              <div><dt>Latest candidate</dt><dd>{candidateTotal === null || !latestCandidateResult.available ? "Unavailable" : when(latestCandidate?.createdAt)}</dd></div>
            </dl>
            <p className={styles.note}>Telegram delivery counts are not persisted yet. Approval records are shown separately from publication.</p>
            <Link className={styles.actionLink} href="/admin/scraper">Open source discovery and review</Link>
          </article>

          <article className={styles.agent}>
            <div className={styles.agentHeading}><div><span className={styles.agentLabel}>Agent 2</span><h3>Publishing Engine</h3></div><span className={`${styles.badge} ${styles.blue}`}>Publishing</span></div>
            <dl className={styles.definitionGrid}>
              <div><dt>Authorizations pending</dt><dd>{displayCount(pendingAuthorizations)}</dd></div>
              <div><dt>Publishing now</dt><dd>{displayCount(publishingAuthorizations)}</dd></div>
              <div><dt>Published authorizations</dt><dd>{displayCount(publishedAuthorizations)}</dd></div>
              <div><dt>Most recent authorization</dt><dd>{authorizationRows === null ? "Unavailable" : when(latestAuthorization?.createdAt)}</dd></div>
            </dl>
            <p className={styles.note}>Stage-by-stage elapsed time and failed-attempt history are not currently recorded, so those metrics are unavailable.</p>
            <Link className={styles.actionLink} href="/admin/deals">Open deal management</Link>
          </article>

          <article className={styles.agent}>
            <div className={styles.agentHeading}><div><span className={styles.agentLabel}>Agent 3</span><h3>Shadow Intelligence</h3></div><span className={`${styles.badge} ${styles.orange}`}>Shadow only</span></div>
            <dl className={styles.definitionGrid}>
              <div><dt>Competitor candidates</dt><dd>{displayCount(shadowTotal)}</dd></div>
              <div><dt>Most recent source</dt><dd>{shadowTotal === null ? "Unavailable" : latestShadow?.competitorSource ?? "No record"}</dd></div>
              <div><dt>Latest candidate</dt><dd>{shadowTotal === null || !latestShadowResult.available ? "Unavailable" : when(latestShadow?.discoveredAt)}</dd></div>
              <div><dt>Publishing permission</dt><dd>Disabled</dd></div>
            </dl>
            <p className={styles.note}>This dashboard is read only. Agent 3 cannot publish deals or change live deal visibility.</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><h2>Operations and administration</h2><p>Open the existing workflows. Unimplemented telemetry stays explicitly unavailable.</p></div></div>
        <div className={styles.operationsGrid}>
          <Link href="/admin/merchant-websites"><strong>Source Management</strong><span>Retailer directory and connector sources</span></Link>
          <Link href="/admin/scraper?tab=review"><strong>Approval Queue</strong><span>{displayCount(reviewCount)} records requiring review or recovery</span></Link>
          <Link href="/admin/scraper?tab=published"><strong>Published Deals</strong><span>{displayCount(publishedDeals)} currently published</span></Link>
          <Link href="/admin/scraper?tab=intelligence"><strong>Price History</strong><span>{displayCount(priceObservations)} recorded observations · {displayCount(lifecycleEvents)} lifecycle events</span></Link>
          <Link href="/admin/scraper?tab=connectors"><strong>Worker & Queue Health</strong><span>Source connector records and run history · <Unavailable>worker heartbeats are not yet persisted</Unavailable></span></Link>
          <Link href="/admin/cuelinks"><strong>Affiliate Analytics</strong><span>Existing Cuelinks reporting</span></Link>
          <div><strong>AI Cost Analytics</strong><span><Unavailable>model usage and cost ledger is not implemented</Unavailable></span></div>
          <div><strong>Telegram Settings</strong><span><Unavailable>secure settings UI and delivery telemetry are not implemented</Unavailable></span></div>
          <div><strong>Review Required</strong><span>{displayCount(uncertainCandidates)} uncertain candidates · {displayCount(recoveryAuthorizations)} recovery authorizations</span></div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><h2>Source health</h2><p>Persisted health records only; runtime worker heartbeats are not inferred from database state.</p></div><Link href="/admin/merchant-websites">Manage merchants</Link></div>
        {sources === null ? <p className={styles.empty}>Source health is unavailable in this database environment.</p> : sources.length === 0 ? <p className={styles.empty}>No source health records have been recorded.</p> : (
          <div className={styles.tableWrap}><table><thead><tr><th>Connector</th><th>State</th><th>Requests</th><th>Successes</th><th>Consecutive failures</th><th>Last success</th><th>Last failure</th></tr></thead>
            <tbody>{sources.map((source) => <tr key={source.connectorCode}><th scope="row">{source.connectorCode}</th><td><span className={`${styles.state} ${source.state === "HEALTHY" ? styles.healthy : source.state === "DEGRADED" ? styles.degraded : styles.suspended}`}>{source.state}</span></td><td>{source.totalRequests.toLocaleString("en-IN")}</td><td>{source.successfulRequests.toLocaleString("en-IN")}</td><td>{source.consecutiveFailures.toLocaleString("en-IN")}</td><td>{when(source.lastSuccessAt)}</td><td>{when(source.lastFailureAt)}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><div><h2>Recent scraper runs</h2><p>Run records are database-backed. No automatic publishing action is exposed here.</p></div><Link href="/admin/scraper">Open scraper</Link></div>
        {latestJobs === null ? <p className={styles.empty}>Scraper run history is unavailable in this database environment.</p> : latestJobs.length === 0 ? <p className={styles.empty}>No scraper runs have been recorded.</p> : (
          <div className={styles.tableWrap}><table><thead><tr><th>Started</th><th>Source</th><th>Status</th><th>Found</th><th>Verified</th><th>Published</th><th>Failure</th></tr></thead>
            <tbody>{latestJobs.map((job) => <tr key={job.id}><td>{when(job.startedAt)}</td><th scope="row">{job.connectorCode}</th><td>{job.status}</td><td>{job.itemsFound}</td><td>{job.itemsVerified}</td><td>{job.itemsPublished}</td><td>{job.errorMessage ? <span className={styles.failure}>Failure recorded</span> : "—"}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
      <p className={styles.footerNote}>Last loaded {when(new Date())}. Agent 3 remains isolated from publishing and live visibility controls.</p>
    </main>
  );
}

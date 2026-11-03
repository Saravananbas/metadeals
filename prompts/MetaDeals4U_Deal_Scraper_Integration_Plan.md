# MetaDeals4U --- Deal Scraper & Intelligence Engine Integration Plan

**Project:** MetaDeals4U\
**Repository:** `D:\Metadeals`\
**GitHub:** `https://github.com/Saravananbas/metadeals.git`\
**Local development URL:** `http://localhost:4123`\
**Document purpose:** Detailed implementation blueprint for adding a
Deal Scraper and Deal Intelligence Engine to the existing MetaDeals4U
website without creating a separate application, database, or product
catalogue.

------------------------------------------------------------------------

## 1. Executive Summary

MetaDeals4U will be extended with a **Deal Scraper & Intelligence
Engine** that discovers product listings and deal signals, records price
history, identifies unusually low prices, filters misleading discounts,
verifies candidates, and publishes eligible deals to the existing public
website.

The scraper is not a separate consumer website. It is a backend
capability integrated into the current MetaDeals4U application and its
existing product, deal, category, retailer, user, and admin data.

The intended pipeline is:

``` text
Retailer pages / permitted feeds / public deal communities / tracked products
                                  |
                                  v
                         Source connectors
                                  |
                                  v
                         Discovery candidates
                                  |
                                  v
                    Product identity and variant match
                                  |
                                  v
                    Price observation and history
                                  |
                                  v
                 Discount validation and anomaly rules
                                  |
                                  v
                       Independent verification
                                  |
                  +---------------+---------------+
                  |                               |
             VERIFIED                         UNCERTAIN
                  |                               |
          Immediate publication              Admin review queue
                  |                               |
                  v                         Approve / Reject
         Existing website deals                    |
                  |                                 v
                  +----------------<----------------+
                                  |
                                  v
                      Post-publication monitoring
                                  |
                    Price / stock / expiry updates
```

### Confirmed publishing policy

1.  **Verified deals:** Automatically publish to the existing
    MetaDeals4U website immediately after all mandatory verification
    gates pass. No manual approval or batch delay.
2.  **Uncertain deals:** Send to the admin manual-review queue. An
    administrator can approve or reject.
3.  **Invalid deals:** Reject and never expose publicly.
4.  **After publication:** Continue monitoring price and availability.
    Update, suppress, or mark a deal expired when the offer changes or
    is no longer valid.

A numeric score may help prioritize verification, but it must never
bypass mandatory validation gates or change this publishing policy.

------------------------------------------------------------------------

## 2. Core Integration Principles

### 2.1 Extend the existing application

Before implementation, inspect the current repository and establish
exactly how the website currently stores and serves products and deals.

-   Reuse the existing Next.js application and its routing conventions.
-   Reuse the existing authentication, admin roles, sessions, and
    authorization.
-   Reuse the existing database and Prisma schema if Prisma is already
    in use.
-   Extend existing Product, Deal, Retailer, Category, and related
    models where appropriate.
-   Reuse existing public deal APIs, product pages, category pages,
    search, and homepage sections.
-   Add scraper workers as background processes in the same repository
    initially.
-   Do not create a second public website, independent product
    catalogue, or parallel database.
-   Do not replace existing data with newly scraped data.
-   Do not assume that proposed model names or API paths already exist;
    map the design to the actual repository first.

### 2.2 Establish the current data model before coding

Antigravity must document:

  -----------------------------------------------------------------------
  Area                                What to inspect
  ----------------------------------- -----------------------------------
  Products                            Existing product table/model,
                                      identifiers, variants, images,
                                      attributes

  Deals                               Current deal schema, price fields,
                                      status, slug, expiry, publication
                                      rules

  Retailers                           Retailer/merchant records, URLs,
                                      logos, affiliate configuration

  Categories                          Existing category hierarchy and
                                      category-to-product relationship

  Users                               Existing user, admin, role,
                                      permission, and audit models

  Price data                          Whether historical price
                                      observations already exist

  Public APIs                         Homepage, latest deals, featured
                                      deals, category and product APIs

  Admin                               Existing dashboard, navigation,
                                      forms, tables, access controls

  Search                              Existing search implementation and
                                      indexing

  Media                               Existing image storage and image
                                      URL handling

  Jobs                                Existing scheduler, queues, cron
                                      jobs, or worker processes
  -----------------------------------------------------------------------

Produce a field-mapping document before creating or changing database
models.

### 2.3 Separate discovery data from public website data

A scraped listing is not automatically a public deal.

-   Discovery candidates and raw evidence remain private/internal.
-   Product records can be reused or created according to the existing
    product-data rules.
-   Only deals in the existing website's approved published state may
    appear in public queries.
-   The scraper must not write unverified candidates directly into
    public homepage or category feeds.
-   Preserve a clear link between a public deal and its candidate,
    evidence, verification, and price history.

------------------------------------------------------------------------

## 3. Scope and Initial Retailer Coverage

### 3.1 Initial categories

Start with:

-   Electronics
-   Home appliances

Examples include televisions, smartphones, laptops, tablets, headphones,
monitors, refrigerators, washing machines, air conditioners, kitchen
appliances, and accessories.

The category configuration should be extensible without code changes for
every new category.

### 3.2 Initial retailer targets

Use a connector-based design for retailers such as:

-   Amazon India
-   Flipkart
-   Myntra
-   AJIO
-   Croma
-   Reliance Digital

The initial category scope is electronics and appliances. Retailers
whose catalogue is not relevant to the initial categories can be enabled
later.

**Important:** A retailer name in this plan is a target, not a claim
that a live integration is already available. Each connector must be
assessed for permitted access, terms, robots policies, available
feeds/APIs, rate limits, and technical feasibility.

### 3.3 Additional discovery sources

Combine three discovery channels:

1.  **Retailer discovery:** Permitted retailer listing pages, sale
    pages, clearance pages, product pages, structured metadata,
    authorized feeds, and APIs.
2.  **Public deal communities:** Public deal websites, public Telegram
    channels through authorized access methods, RSS feeds, public
    announcements, and user-submitted deal links.
3.  **Product price monitoring:** Existing tracked products and listings
    whose prices are periodically observed.

Community posts are leads, not proof. The system must independently
verify the retailer listing before publication.

------------------------------------------------------------------------

## 4. Scraper Architecture

### 4.1 Components

Implement the following logical components, adapting names to the
existing codebase:

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  Scraper Orchestrator                Schedules source scans and manages
                                      scan priority

  Retailer Connector Registry         Registers, enables, disables, and
                                      configures connectors

  Retailer Connectors                 Extract listing and product data
                                      for an individual retailer

  Community Connectors                Collect permitted public deal
                                      signals

  Product Matcher                     Matches discovered listings to
                                      existing products and variants

  Price Normalizer                    Normalizes currency, price,
                                      shipping, coupon, and offer fields

  Price History Service               Stores observations and calculates
                                      reference statistics

  Deal Rules Engine                   Applies deterministic discount,
                                      validity, and anomaly rules

  Verification Service                Rechecks source evidence and
                                      mandatory deal conditions

  Publishing Service                  Publishes verified deals into the
                                      existing website data model

  Monitoring Service                  Rechecks published deal price and
                                      availability

  Admin API and UI                    Exposes source health, candidates,
                                      evidence, and review actions

  Worker Runtime                      Executes background jobs
                                      independently of web requests
  -----------------------------------------------------------------------

### 4.2 Recommended runtime

If the existing stack matches the following, reuse it:

-   Next.js + TypeScript for the website and admin UI.
-   Existing backend/API conventions for business logic.
-   Existing PostgreSQL database and Prisma ORM, if already configured.
-   Redis + BullMQ for background jobs, if compatible with the current
    infrastructure.
-   Playwright for pages that genuinely require browser rendering and
    are permitted to access.
-   Cheerio for parsing permitted static HTML.
-   Axios or the existing HTTP client for permitted HTTP requests.

Do not introduce a new technology just because it appears in this plan.
First inspect the current implementation and dependencies.

### 4.3 Web application and worker separation

The public website should remain responsive even while scraping is busy.

-   Next.js handles website pages and normal API requests.
-   Background workers handle crawling, parsing, matching, price
    analysis, verification, and monitoring.
-   Workers use the same application services and database models as the
    website.
-   Do not run long scraping tasks inside a user-facing HTTP request.
-   A worker failure must not take down the public website.
-   A failed connector must not stop other retailer connectors.

### 4.4 Queue design

If BullMQ is adopted or already present, use logical queues such as:

-   `discovery-queue`
-   `retailer-scan-queue`
-   `community-signal-queue`
-   `price-change-queue`
-   `product-match-queue`
-   `anomaly-queue`
-   `verification-queue`
-   `critical-alert-queue`
-   `publishing-queue`
-   `maintenance-queue`

Use deterministic job IDs, idempotency keys, bounded concurrency,
per-domain rate limits, timeouts, exponential backoff, dead-letter
handling, and graceful shutdown.

Suggested priorities:

  -----------------------------------------------------------------------
  Priority                Meaning                 Handling
  ----------------------- ----------------------- -----------------------
  P0                      Extreme price anomaly   Immediate revalidation
                          or potentially          and priority
                          exceptional deal        verification

  P1                      Strong discount with    High-priority
                          credible evidence       verification

  P2                      Normal candidate        Standard verification

  P3                      Low-confidence or       Lower-priority
                          low-value signal        processing or rejection
                                                  by hard rules
  -----------------------------------------------------------------------

These priorities control processing order, not the final publishing
policy.

------------------------------------------------------------------------

## 5. Retailer Connector Design

### 5.1 Standard connector contract

Every retailer connector should implement a common interface. The exact
TypeScript contract must be adapted to existing project conventions, but
it should support operations equivalent to:

``` ts
interface RetailerConnector {
  retailerCode: string;

  checkHealth(): Promise<ConnectorHealthResult>;

  discoverListings(
    input: DiscoveryRequest
  ): Promise<DiscoveryPage>;

  fetchProduct(
    input: ProductLookupRequest
  ): Promise<RetailerProductData>;

  normalizeListing(
    input: RawRetailerListing
  ): Promise<NormalizedListing>;
}
```

The interface should support:

-   Health check.
-   Category/listing discovery.
-   Pagination and incremental checkpoints.
-   Product detail retrieval.
-   Price and stock retrieval.
-   Seller identification.
-   Product identifier extraction.
-   Coupon and offer extraction where visible and permitted.
-   Source timestamp and evidence capture.
-   Connector-specific error classification.

### 5.2 Connector configuration

Store configuration in the database or the existing configuration
system:

-   Retailer and connector code.
-   Enabled/disabled status.
-   Supported categories.
-   Permitted source URLs or source patterns.
-   Scan frequency and maximum page count.
-   Per-domain concurrency and request limits.
-   Last successful scan and last attempted scan.
-   Last error and error count.
-   Connector health.
-   Credential/authorized feed reference, if applicable.
-   Configuration version and audit history.

Keep secrets in environment variables or a suitable secrets manager, not
in source code or ordinary database text fields.

### 5.3 Collection methods

Use the least intrusive permitted method available:

1.  Official retailer APIs or authorized feeds.
2.  Public structured data such as JSON-LD or other exposed metadata.
3.  Permitted public HTML retrieval and parsing.
4.  Browser rendering with Playwright only when necessary and permitted.

Respect retailer terms, robots policies, rate limits, and access
restrictions. Do not bypass CAPTCHA, bot protection, login requirements,
paywalls, or other access controls. If access is blocked or
authorization is unavailable, mark the connector as blocked/awaiting
authorization and continue with other sources.

### 5.4 Data to extract

Where available and permitted:

-   Retailer product URL and canonical URL.
-   Retailer product ID.
-   Product title.
-   Brand and manufacturer.
-   Model number.
-   GTIN/EAN/UPC.
-   SKU and variant identifier.
-   Product category.
-   Product image URL.
-   MRP/list price.
-   Current selling price.
-   Sale price.
-   Coupon and promotion information.
-   Seller name and seller ID.
-   Stock/availability status.
-   Delivery/shipping charges, if available.
-   Product condition (new, refurbished, open-box, etc.).
-   Timestamp of observation.
-   Source page and extraction method.

Store unknown values as unknown. Do not fabricate missing seller, price,
stock, rating, shipping, or coupon information.

------------------------------------------------------------------------

## 6. Product Identity and Website Catalogue Integration

This is one of the most important parts of the implementation. The
scraper must enrich and reuse the existing MetaDeals4U product catalogue
rather than create duplicates.

### 6.1 Product matching order

Use deterministic matching in this order:

1.  GTIN/EAN/UPC exact match.
2.  Manufacturer model number exact match.
3.  Retailer product ID within the same retailer.
4.  Brand + model + key specifications.
5.  Normalized title plus category and specifications as a
    lower-confidence match.

A title-only match must not be sufficient for high-risk variants.

### 6.2 Variant safety

Distinguish variants such as:

-   128 GB vs 256 GB storage.
-   8 GB vs 16 GB RAM.
-   43-inch vs 55-inch television.
-   Different model years.
-   Different colours where retailer SKU differs.
-   Single unit vs multipack.
-   New vs refurbished/open-box.
-   Regional or model variants.
-   Product vs accessory, replacement part, or remote control.

If identity is ambiguous, create a candidate requiring review rather
than merging it into an existing product.

### 6.3 Reuse existing products

Recommended integration behavior:

-   If an exact product exists, attach the new retailer listing to that
    product.
-   If the product exists but a new variant is discovered, create or
    propose a distinct variant using the existing catalogue conventions.
-   If no matching product exists, create a controlled product candidate
    or a new product according to existing website data rules.
-   Do not create duplicate product rows for the same model just because
    it appears on multiple retailers.
-   Preserve existing manually curated product names, descriptions,
    categories, and images unless a defined enrichment rule authorizes
    an update.
-   Store source provenance for scraped fields so administrators can see
    where each value came from.

### 6.4 Suggested data relationship

Adapt this to the existing schema; do not blindly create duplicate
models.

``` text
Product
  ├── ProductVariant
  ├── ProductIdentifier
  ├── RetailerListing
  │      ├── Retailer
  │      ├── Seller
  │      └── PriceObservation
  └── Deal
         ├── DealCandidate
         ├── DealVerification
         ├── DealEvidence
         └── DealPublication
```

A single product can have multiple retailer listings and multiple deal
records over time.

------------------------------------------------------------------------

## 7. Price History and Deal Intelligence

### 7.1 Store observations, not just the latest price

Every valid price observation should be retained as historical data,
including:

-   Product and variant.
-   Retailer listing.
-   Seller.
-   Observed price.
-   MRP/list price, separately.
-   Coupon/offer conditions.
-   Shipping or mandatory charges, if known.
-   Currency.
-   Availability.
-   Source URL.
-   Observation timestamp in UTC.
-   Extraction method.
-   Data quality/verification status.

Price observations should be append-only. Corrections should be
represented by new observations or explicit correction records, not
silent overwrites.

### 7.2 Reference-price calculations

Calculate where there is sufficient data:

-   7-day median and minimum.
-   30-day median and minimum.
-   90-day median and minimum.
-   180-day median and minimum.
-   Historical lowest observed price.
-   Price volatility.
-   Number of observations.
-   History coverage and freshness.

A claimed discount based only on retailer MRP must not be treated as a
genuine discount.

If there is insufficient history, the system must state that the
historical discount cannot be established and seek independent reference
evidence or route the candidate to review.

### 7.3 Example: misleading MRP

``` text
Retailer MRP:             ₹20,000
Current selling price:       ₹200
90-day median price:         ₹250

Claimed discount vs MRP:      99%
Actual drop vs median:        20%
```

The engine must not promote this as a genuine 99% discount. It should
use historical reference prices and clearly distinguish claimed MRP
savings from observed price reductions.

### 7.4 Example: possible price glitch

``` text
Product: 55-inch television
Historical median: ₹50,000
New observed price:    ₹285
```

This is a critical anomaly. It should trigger immediate revalidation,
product/variant verification, seller checks, and checkout/offer checks
where permitted. It must not be automatically rejected merely because
the price is unusually low.

### 7.5 Price normalization

Keep separate fields for:

-   MRP/list price.
-   Current product-page price.
-   Coupon-adjusted price.
-   Bank/card offer price.
-   Shipping/delivery charges.
-   Final checkout price, only when actually verified.
-   Effective price under explicit eligibility conditions.

Never label a price as a final checkout price if the system has only
read a product listing page.

------------------------------------------------------------------------

## 8. Deterministic Deal Detection Rules

No AI or LLM is required or permitted as a dependency for discovery,
matching, scoring, verification, or publishing decisions.

Use configurable deterministic rules.

### 8.1 Candidate triggers

Create candidates for:

-   Newly discovered products with unusually low prices.
-   Large price reductions on tracked products.
-   Price below historical median or minimum by a configurable
    threshold.
-   Retailer clearance or sale listings.
-   Coupon combinations that meet configured rules.
-   Public community deal signals.
-   Price anomalies relative to other retailers.
-   A sudden price change on an existing listing.

### 8.2 Hard validation gates

Before a deal can be marked verified, check:

1.  Product identity is sufficiently certain.
2.  Exact variant is known.
3.  Retailer listing is accessible through permitted means.
4.  Price is current and independently rechecked.
5.  Seller identity and reliability meet policy.
6.  The offer is valid for the stated product and conditions.
7.  Required coupon, membership, payment, or bank conditions are
    explicit.
8.  Availability is supported by evidence.
9.  Price and shipping/mandatory charges are represented accurately.
10. The source evidence is recent enough for the deal type.
11. No duplicate active deal exists for the same listing/offer.
12. No known invalidation or retailer correction exists.

The exact required gates should be configurable by category and offer
type. A hard-gate failure means the deal cannot be auto-published.

### 8.3 Trust and attractiveness scores

Maintain separate scores:

-   **Trust score:** Confidence that the listing, product, seller,
    price, and conditions are real.
-   **Attractiveness score:** How compelling the price is compared with
    reliable reference prices.

An illustrative trust score can consider:

  Signal                                     Illustrative weight
  ---------------------------------------- ---------------------
  Price-history coverage                                     25%
  Product identity and variant certainty                     20%
  Independent price references                               20%
  Seller reliability                                         15%
  Checkout/offer verification                                15%
  Data freshness                                              5%

Weights and thresholds must be configurable and validated using real
data. Hard gates always take precedence. A score must not turn an
invalid deal into a verified deal.

### 8.4 Outcomes

  -----------------------------------------------------------------------
  Outcome                             Action
  ----------------------------------- -----------------------------------
  Verified and all mandatory checks   Publish immediately
  pass                                

  Uncertain, incomplete, or           Manual review queue
  conflicting evidence                

  Invalid, misleading, unavailable,   Reject; never publish
  or wrong product                    
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 9. Verification Workflow

Verification should be a distinct service, not just a scraper parsing
step.

### 9.1 Revalidation

Before publication:

-   Fetch the source again using the permitted connector.
-   Confirm the canonical listing and product identity.
-   Re-read current price and stock.
-   Confirm seller and variant.
-   Re-evaluate coupon and payment conditions.
-   Compare the new observation with the candidate's evidence.
-   Check whether another job has already published or rejected the same
    offer.

For high-impact price anomalies, use an expedited revalidation path. The
frequency and number of checks must respect source access limits.

### 9.2 Evidence record

For each candidate, retain:

-   Source URL.
-   Retailer and seller.
-   Product and variant match result.
-   Price observation IDs.
-   Historical reference calculations.
-   Coupon/offer conditions.
-   Availability result.
-   Verification timestamps.
-   Rules executed and outcomes.
-   Trust/attractiveness scores.
-   Reviewer identity and decision, if manual.
-   Reason for rejection or suppression.

Capture only evidence that is permitted to collect and retain. Avoid
storing unnecessary personal data.

------------------------------------------------------------------------

## 10. Integrating With Existing Website Data and Pages

### 10.1 Public deal data flow

The publishing service must map a verified candidate into the existing
public deal model.

Conceptually:

``` text
Verified DealCandidate
        |
        v
Existing Product / ProductVariant
        |
        v
Existing Retailer / RetailerListing
        |
        v
Existing Deal record
        |
        v
Existing public deal APIs and website pages
```

Do not create a separate `ScrapedDeal` public table if the website
already has a canonical Deal model. Candidate/evidence records are
internal workflow data; the existing Deal model remains the public
source of truth.

### 10.2 Public website behavior

The existing homepage, category pages, search, and product pages should
read from the existing published-deal data source.

Extend existing components where possible:

-   DealCard.
-   DealGrid.
-   PriceDisplay.
-   DiscountBadge.
-   RetailerLink.
-   DealExpiryIndicator.
-   DealDetail.
-   ProductPriceComparison.
-   HistoricalPriceSummary, if the website design supports it.

Avoid redesigning the homepage as part of the scraper integration unless
a separate approved design milestone requires it.

### 10.3 Public visibility rules

Public APIs must filter on the existing published/active status and any
required visibility flags.

Never expose:

-   Raw candidate records.
-   Internal trust scores unless explicitly designed for public display.
-   Private evidence.
-   Connector credentials.
-   Internal error details.
-   Admin review notes.
-   Rejected candidates.
-   Unverified prices.

### 10.4 Suggested public endpoints

These are examples only. Reuse current routes and naming conventions
where they already exist.

  ----------------------------------------------------------------------------
  Purpose                             Example
  ----------------------------------- ----------------------------------------
  Latest deals                        `GET /api/deals/latest`

  Deal listing/search                 `GET /api/deals`

  Deal detail                         `GET /api/deals/[slug]`

  Featured deals                      `GET /api/deals/featured`

  Loot deals                          `GET /api/deals/loot`

  Categories                          `GET /api/categories`

  Product detail                      Existing product endpoint

  Price history                       `GET /api/products/[id]/price-history`
                                      (if approved for public use)
  ----------------------------------------------------------------------------

### 10.5 Immediate website publication

When a candidate passes all mandatory verification gates:

1.  Create or update the canonical Deal record in the existing database.
2.  Mark it published using the website's existing status conventions.
3.  Persist the publication event and candidate-to-deal relationship.
4.  Commit these database changes atomically where possible.
5.  Invalidate relevant Next.js cache/tags or use the existing cache
    mechanism.
6.  Update sitemap/search indexing if required by current architecture.
7.  Make the deal available through the existing public APIs
    immediately.
8.  Enqueue external notifications separately.

A notification failure must not roll back or hide a successfully
published website deal. Use an outbox/retry pattern or equivalent
reliable event delivery. Publication must be idempotent so a retried job
cannot create duplicate public deals.

### 10.6 Affiliate links and disclosure

-   Reuse the existing affiliate-link model and redirect logic, if
    present.
-   Only generate affiliate links through authorized programs and
    approved configuration.
-   Preserve the original retailer URL for traceability.
-   Display affiliate disclosure as required.
-   Do not invent commissions, affiliate relationships, coupon validity,
    or retailer guarantees.

------------------------------------------------------------------------

## 11. Admin Dashboard Integration

Add a **Deal Intelligence** section to the existing admin navigation.
Reuse the current design system, layout, authentication, roles, and
permission checks.

Suggested pages:

1.  Overview
2.  Live Discovery
3.  Discovery Sources
4.  Retailer Connectors
5.  Product Monitoring
6.  Price Anomalies
7.  Deal Candidates
8.  Verification Queue
9.  Published Deals
10. Historical Prices
11. Seller Intelligence
12. Detection Rules
13. Worker Health
14. Queue Monitoring
15. System Settings

### 11.1 Overview metrics

Show actual database/worker-derived metrics:

-   Active retailers.
-   Healthy and failed connectors.
-   Last successful scan per source.
-   Active workers.
-   Queue depth and failed jobs.
-   Products/listings discovered today.
-   Price changes detected.
-   Candidates created.
-   Critical anomalies.
-   Pending manual reviews.
-   Verified deals published.
-   Rejected candidates.
-   Expired or suppressed deals.
-   Discovery-to-verification latency.
-   Publication failures.

Do not show hardcoded demo numbers in production.

### 11.2 Candidate review

Administrators should be able to:

-   View candidate and product details.
-   Compare current price with historical observations.
-   Inspect retailer and seller details.
-   Inspect coupon/offer conditions.
-   View source evidence and verification results.
-   See why the system marked the deal uncertain.
-   Approve or reject.
-   Enter a reason for the decision.
-   View decision audit history.

Manual approval must still run final publication safety checks. An
administrator should not accidentally publish a candidate whose source
has become unavailable or whose price has materially changed without an
explicit warning/reverification step.

### 11.3 Connector administration

Administrators should be able to:

-   Enable/disable a connector.
-   Pause/resume scans.
-   View last scan and next scheduled scan.
-   View errors and health.
-   Run a permitted health check.
-   Configure categories and scan frequency within policy limits.
-   View per-domain rate limits.
-   Inspect scan checkpoints.
-   Review connector configuration changes and audit history.

------------------------------------------------------------------------

## 12. Post-Publication Monitoring

Publication is not the end of the workflow.

Monitor each published deal based on its risk, source capability, and
permitted refresh frequency.

### 12.1 Recheck conditions

-   Price change.
-   Product unavailable or out of stock.
-   Listing removed.
-   Seller changed.
-   Coupon expired.
-   Promotion terms changed.
-   Product variant changed.
-   Retailer corrected an erroneous price.
-   Deal expiry reached.
-   Source has become inaccessible for a sustained period.

### 12.2 Status handling

Map these conceptual states to the existing website status model:

-   DISCOVERED
-   SCREENING
-   PRICE_ANOMALY
-   PENDING_VERIFICATION
-   VERIFIED
-   REVIEW_REQUIRED
-   REJECTED
-   PENDING_PUBLICATION
-   PUBLISHED
-   PRICE_CHANGED
-   AVAILABILITY_CHANGED
-   EXPIRED
-   SUPPRESSED
-   PUBLICATION_FAILED

If the retailer cannot be reached, mark the observation stale or unknown
rather than claiming the item is unavailable. If a material price change
invalidates the published deal, update or suppress it and invalidate the
website cache promptly.

Keep publication and status history for audit and analysis.

------------------------------------------------------------------------

## 13. Suggested Database Extensions

**Do not create all these tables blindly.** First map them to the
existing Prisma schema and reuse equivalent models. The following is a
logical capability checklist.

  -----------------------------------------------------------------------
  Logical entity                      Purpose
  ----------------------------------- -----------------------------------
  Retailer                            Retailer master data

  RetailerConnector                   Connector configuration and health

  RetailerSource                      Permitted pages/feeds monitored

  ProductIdentifier                   GTIN, EAN, UPC, model, SKU

  ProductVariant                      Exact sellable product variant

  RetailerListing                     Retailer-specific listing linked to
                                      product/variant

  Seller                              Seller identity

  SellerHistory                       Seller changes and reliability
                                      evidence

  PriceObservation                    Append-only historical price data

  PriceReference                      Derived historical reference
                                      statistics

  DiscoveryEvent                      Source discovery event

  DiscoveryCheckpoint                 Incremental scan position

  CommunitySource                     Public community source
                                      configuration

  CommunitySignal                     Deal lead from a public source

  DealCandidate                       Internal deal evaluation workflow

  DealAnomaly                         Price or listing anomaly

  DealScore                           Trust and attractiveness scores

  DealVerification                    Verification runs and outcomes

  DealEvidence                        Evidence and source references

  DealStatusHistory                   Candidate/public deal state
                                      transitions

  DealPublication                     Idempotent publication record

  MonitoringSchedule                  Published listing monitoring
                                      schedule

  WorkerHealth                        Worker heartbeat and status

  ConnectorHealth                     Connector health history

  ProcessingJobLog                    Job execution diagnostics

  DetectionRule                       Versioned configurable detection
                                      rules

  CategoryMonitoringConfig            Category-specific scan and
                                      verification settings
  -----------------------------------------------------------------------

### 13.1 Data design requirements

-   Follow the existing primary-key convention.
-   Use foreign keys and appropriate delete behavior.
-   Use unique constraints for retailer listing IDs and idempotency
    keys.
-   Add indexes for product, retailer, listing, status, timestamps, and
    queue lookup patterns.
-   Use Decimal/numeric types for monetary values; avoid floating-point
    currency calculations.
-   Store timestamps in UTC.
-   Preserve source provenance.
-   Keep price observations append-only.
-   Use JSON only for genuinely variable source metadata or evidence
    payloads, not as a substitute for relational fields.
-   Consider table partitioning only after measuring actual volume.
-   Define retention and cleanup policies for raw page data and logs.

------------------------------------------------------------------------

## 14. Reliability, Security, and Compliance

### 14.1 Reliability

Implement:

-   Structured logs and correlation IDs.
-   Worker heartbeats.
-   Queue depth and latency metrics.
-   Connector success/failure rates.
-   Retry with exponential backoff and jitter.
-   Dead-letter handling.
-   Job timeouts.
-   Graceful worker shutdown.
-   Redis reconnect handling, if Redis is used.
-   Database connection-pool limits.
-   Per-retailer concurrency limits.
-   Idempotent jobs and publication.
-   Independent connector failure isolation.
-   Operational alerts for stalled queues and repeated failures.

### 14.2 Security

-   Keep retailer credentials and API keys in environment variables or a
    secrets manager.
-   Enforce admin authorization on all management/review endpoints.
-   Audit all manual approvals, rejections, configuration changes, and
    connector actions.
-   Sanitize scraped HTML before any display.
-   Validate and normalize all URLs.
-   Protect user-submitted URLs against SSRF: block localhost, private
    networks, link-local ranges, cloud metadata addresses, and unsafe
    redirects.
-   Do not execute scripts from scraped content.
-   Validate webhook signatures if webhooks are used.
-   Do not store unnecessary personal information from public sources.
-   Do not bypass access controls or anti-bot protections.

### 14.3 Compliance and access boundaries

For each source:

-   Review terms and permitted collection methods.
-   Respect robots policies where applicable.
-   Respect rate limits and source restrictions.
-   Use official APIs/feeds where available and authorized.
-   Do not access private groups or private messages without
    authorization.
-   Do not bypass CAPTCHA, bot detection, authentication, or paywalls.
-   Provide an admin kill switch for each connector.
-   Record source and collection method for auditability.

If a source cannot be accessed legitimately, document the blocker and
leave the connector disabled rather than attempting circumvention.

------------------------------------------------------------------------

## 15. Testing Strategy

Use deterministic fixtures and mocked source responses for routine
tests. Do not make normal CI tests depend on live retailer websites.

### 15.1 Unit tests

-   Currency and price normalization.
-   Coupon and offer calculations.
-   Product identity matching.
-   Variant mismatch detection.
-   Historical median/minimum calculations.
-   Fake MRP detection.
-   Price anomaly detection.
-   Trust and attractiveness scoring.
-   Duplicate candidate detection.
-   Idempotency.
-   Priority assignment.
-   Status transitions.
-   Publication eligibility.

### 15.2 Integration tests

-   Connector fixture parsing.
-   Pagination and checkpoint resume.
-   Redis/queue processing, if adopted.
-   Worker retries and dead-letter handling.
-   Database persistence.
-   Multiple source signals resolving to one product.
-   Verification and publication transaction.
-   Cache invalidation/outbox delivery.
-   Connector failure isolation.
-   Post-publication price and stock changes.

### 15.3 Required business scenarios

  -----------------------------------------------------------------------
  Scenario                            Expected result
  ----------------------------------- -----------------------------------
  Genuine product with strong         Verify and publish immediately
  discount                            

  TV listed at ₹285 against a ₹50,000 Critical anomaly; revalidate
  history                             urgently

  Inflated MRP with little real price Do not claim misleading discount
  reduction                           

  Wrong storage/RAM/TV size variant   Do not merge; review or reject

  Same deal discovered on retailer    Deduplicate and retain all evidence
  and community                       

  One retailer connector is down      Other connectors continue

  Retailer corrects price after       Update/suppress deal promptly
  publication                         

  No reliable price history and 95%   Do not assert genuine historical
  claimed discount                    discount; review or seek
                                      independent evidence

  Retailer page cannot be accessed    Mark unknown/stale; do not
                                      fabricate stock status

  Publishing job is retried           No duplicate public deal

  Notification service fails after    Website deal remains published
  publication                         
  -----------------------------------------------------------------------

### 15.4 Browser and end-to-end tests

-   Existing homepage still works.
-   Existing authentication and admin pages still work.
-   Deal Intelligence navigation respects roles.
-   Connector configuration works.
-   Candidate list and evidence pages work.
-   Manual approve/reject workflows work.
-   Verified candidate appears on the existing public website
    immediately.
-   Uncertain candidate remains private until approved.
-   Rejected candidate never appears publicly.
-   Price/availability changes update the public deal state.
-   Application continues to work on port `4123`.

------------------------------------------------------------------------

## 16. Implementation Milestones

Implement in controlled milestones. Antigravity must inspect the actual
project and adjust milestone details to avoid repeating completed work.

### M0 --- Repository and website data assessment

**Tasks** - Inspect Git state, documentation, application architecture,
schema, routes, and admin. - Identify current Product, Deal, Retailer,
Category, User, and Price models. - Trace homepage and category deal
queries. - Document API and cache behavior. - Identify current
background job infrastructure. - Produce a field mapping and gap
analysis.

**Exit criteria** - No code changes. - Existing data flow documented. -
Integration points and migration risks identified. - Baseline
build/tests recorded.

### M1 --- Data model and integration foundation

**Tasks** - Design candidate, listing, observation, evidence,
verification, and publication relationships. - Extend existing schema
with minimal migrations. - Add constraints and indexes. - Add
service-layer boundaries. - Add audit and status-history handling.

**Exit criteria** - Existing website data remains intact. - Migrations
apply and rollback strategy is documented. - Existing product/deal APIs
continue to work. - Tests cover new relationships and constraints.

### M2 --- Worker and queue foundation

**Tasks** - Establish separate worker runtime. - Configure queues and
scheduling. - Add idempotency, retries, concurrency limits, and health
reporting. - Add worker start/stop scripts and operational
documentation.

**Exit criteria** - Workers run independently from Next.js. - A test job
completes and records status. - Worker failure does not take down the
website.

### M3 --- First retailer connector

**Tasks** - Select one initial retailer based on permitted access and
feasibility. - Implement health check, listing discovery, product
lookup, parsing, normalization, and checkpoints. - Add fixtures and
connector tests. - Clearly document any authorization or access blocker.

**Exit criteria** - Connector parses representative fixtures
correctly. - No bypass of access restrictions. - Live status is only
marked operational after a permitted live test.

### M4 --- Product matching and price history

**Tasks** - Implement identifiers and variant matching. - Link listings
to existing product records. - Prevent duplicates. - Store append-only
price observations. - Calculate reference statistics.

**Exit criteria** - Existing product catalogue is reused. - Wrong
variants are not silently merged. - Price history and source provenance
are queryable.

### M5 --- Deterministic deal detection

**Tasks** - Implement discount and anomaly rules. - Add fake MRP
filtering. - Add candidate deduplication. - Add trust and attractiveness
scores. - Add configurable rules and category settings.

**Exit criteria** - Required fake-discount and price-glitch tests
pass. - No AI/LLM runtime dependency exists.

### M6 --- Verification and publishing integration

**Tasks** - Implement mandatory verification gates. - Implement
verified/uncertain/invalid outcomes. - Publish verified deals
immediately to the existing Deal model. - Route uncertain deals to
manual review. - Reject invalid deals. - Implement idempotent
publication and cache invalidation.

**Exit criteria** - Verified deal appears on existing website without
manual approval. - Uncertain deal is private until manual approval. -
Invalid deal never appears publicly. - Retried publication does not
create duplicates.

### M7 --- Admin Deal Intelligence

**Tasks** - Add dashboard pages and navigation. - Add connector controls
and health views. - Add candidate and evidence views. - Add manual
review workflow. - Add queue and worker monitoring. - Apply existing
permissions and audit rules.

**Exit criteria** - Admin workflows operate on real database/worker
data. - Unauthorized users cannot access management functions.

### M8 --- Post-publication monitoring

**Tasks** - Schedule listing rechecks. - Detect price, stock, seller,
and offer changes. - Update or suppress expired/invalid deals. - Track
stale source observations. - Preserve status and publication history.

**Exit criteria** - Published deals are monitored. - Material changes
are reflected on the public website. - Unreachable sources are not
falsely reported as unavailable.

### M9 --- Expand source coverage

**Tasks** - Add additional permitted retailer connectors. - Add public
community sources. - Add tracked-product monitoring. - Add source health
and rate-limit tuning. - Validate deduplication across sources.

**Exit criteria** - Each enabled source has fixture tests and documented
access method. - One source failure does not interrupt other sources. -
Community signals are independently verified before publication.

### M10 --- Production readiness

**Tasks** - Load and concurrency tests. - Security review. - Data
migration and backup/restore verification. - Worker restart/recovery
tests. - Monitoring and alerting. - Operational runbooks. - Production
configuration and secrets review. - Final end-to-end acceptance tests.

**Exit criteria** - All critical acceptance tests pass. - No unverified
deal can be publicly exposed. - Operations team can monitor, pause,
resume, and diagnose the system. - Live integrations are accurately
classified as operational or blocked.

------------------------------------------------------------------------

## 17. Deployment and Local Development

### Local development

-   Preserve the existing local project.
-   Use `http://localhost:4123` for the website.
-   Run the worker as a separate process using documented project
    scripts.
-   Use the existing database configuration.
-   Use Redis only if it is already present or is explicitly added after
    architecture assessment.
-   Provide clear environment-variable documentation.
-   Provide seed/fixture data for local testing without relying on live
    retailer scraping.

### Example process layout

``` text
MetaDeals4U repository
|
+-- Next.js website and admin
|      +-- Public deal pages
|      +-- Existing product catalogue
|      +-- Existing authentication
|      +-- Deal Intelligence admin
|
+-- Shared application services
|      +-- Product matching
|      +-- Price intelligence
|      +-- Verification
|      +-- Publishing
|
+-- Background workers
|      +-- Retailer discovery
|      +-- Community discovery
|      +-- Price monitoring
|      +-- Verification
|      +-- Publication
|
+-- Existing PostgreSQL database
|
+-- Redis / job queues (if adopted)
```

Do not create a second frontend, second product database, or second
public deal system.

------------------------------------------------------------------------

## 18. Acceptance Criteria

The project is complete only when all applicable criteria below are
demonstrated:

### Existing website integration

-   [ ] Existing homepage and navigation remain functional.
-   [ ] Existing authentication and admin security remain intact.
-   [ ] Existing product and deal records are preserved.
-   [ ] Scraper uses the existing canonical product/deal data model.
-   [ ] Existing public APIs and pages display published scraper deals.

### Discovery

-   [ ] Retailer connector framework is operational.
-   [ ] At least one permitted retailer connector is tested end-to-end.
-   [ ] Public community signals can be ingested through authorized
    means.
-   [ ] Existing tracked products can be monitored.
-   [ ] Checkpoints prevent unnecessary full rescans.
-   [ ] Duplicate discoveries are consolidated.

### Intelligence and verification

-   [ ] Product identity and variants are matched safely.
-   [ ] Price observations are retained historically.
-   [ ] Fake MRP/discounts are filtered.
-   [ ] Extreme price anomalies receive priority verification.
-   [ ] Verification evidence is retained.
-   [ ] No AI/LLM dependency is required.

### Publishing

-   [ ] Verified deals publish automatically and immediately.
-   [ ] Uncertain deals enter the manual review queue.
-   [ ] Invalid deals are rejected.
-   [ ] Public APIs never expose unverified candidates.
-   [ ] Publication is idempotent.
-   [ ] Website cache is invalidated after publication.
-   [ ] Notification failure cannot undo website publication.

### Monitoring and operations

-   [ ] Published deals are rechecked.
-   [ ] Invalidated or expired deals are updated/suppressed.
-   [ ] Worker and connector health is visible.
-   [ ] Retries, rate limits, and failure isolation work.
-   [ ] Admin actions are authorized and audited.
-   [ ] Security and source-access restrictions are respected.
-   [ ] Local website runs on port `4123`.

------------------------------------------------------------------------

## 19. Antigravity Execution Instructions

Antigravity should follow this sequence:

1.  Start with **M0 assessment only**.
2.  Read the actual repository and all project handover documents.
3.  Identify which existing features and milestones are already
    complete.
4.  Map the proposed scraper capabilities to the existing website schema
    and APIs.
5.  Produce a concrete implementation plan with file paths, migrations,
    services, routes, worker commands, and tests.
6.  Identify source-access/authorization blockers before implementing
    live connectors.
7.  Implement one milestone at a time.
8.  Run relevant tests and the existing full regression suite after each
    milestone.
9.  Preserve existing user changes and Git history.
10. Do not commit or push without explicit authorization.
11. Do not claim a retailer connector is live unless a permitted live
    integration test has passed.
12. Keep the website available on port `4123`.

### Required first deliverables

Before implementation, provide:

-   Repository assessment report.
-   Existing database schema summary.
-   Existing product/deal data-flow diagram.
-   Existing API and homepage integration map.
-   Proposed schema changes with existing-to-new field mapping.
-   Worker and queue design.
-   Retailer connector feasibility matrix.
-   Milestone plan identifying already completed work.
-   Risks, blockers, and test plan.

**Do not start M1 until the M0 assessment and integration map are
reviewed.**

------------------------------------------------------------------------

## 20. Final Architecture Decision

MetaDeals4U remains one integrated platform:

-   One existing public website.
-   One canonical product catalogue.
-   One canonical public deal model.
-   One shared database.
-   One admin and authentication system.
-   Additional scraper and intelligence services operating as background
    workers.
-   Internal candidate/evidence workflow separated from public deal
    visibility.

The objective is to make the existing MetaDeals4U website continuously
discover, evaluate, verify, publish, and monitor genuine deals---without
creating a parallel website or exposing unverified listings.

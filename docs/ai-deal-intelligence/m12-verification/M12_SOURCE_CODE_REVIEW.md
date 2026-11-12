# M12 Source Code Review: Automated Ingestion & Queue Infrastructure

**Review Role**: Independent Principal Architect & QA/Security Reviewer  
**Date**: November 8, 2026  
**Status**: AUDITED & VERIFIED  

---

## 1. Executive Summary
This document provides a line-by-line architectural and security review of the core files comprising **Milestone M12 – Automated Ingestion**:
- `src/server/ingestion/service.ts`
- `src/server/queue/connection.ts`
- `src/server/queue/producers/index.ts`
- `src/server/queue/workers/index.ts`
- `src/server/queue/scheduler/index.ts`
- `src/server/scraper/agent1-deal-hunter.ts`
- `src/server/scraper/agent2-publishing-engine.ts`
- `src/server/scraper/agent3-shadow-intelligence.ts`
- `prisma/schema.prisma` and Migration History

The review concludes that the automated ingestion pipeline correctly integrates upstream scrapers, enforces pricing sanity gates, records append-only price history, guarantees product variant isolation, and hands off candidate deals to Agent 1 via BullMQ discovery queues.

---

## 2. Ingestion Service Audit (`src/server/ingestion/service.ts`)

### 2.1 Connector Registry & Source Health Pre-flight
- **Line 26-30**: `IngestionService.registerConnector` accepts any typed `RetailerConnector` interface.
- **Line 39-44**: `SourceHealthManager.canExecute(sourceId)` is queried before invoking scrapers. If a circuit breaker has tripped (5 consecutive failures), the scraper execution is blocked immediately, preventing spamming of failing retailer endpoints.

### 2.2 Pricing Sanity & Bound Verification
- **Line 66-73**: Explicit pricing boundaries:
  - `sellingPrice <= 0 || mrp <= 0`: Rejects non-positive prices with `INVALID_PRICE`.
  - `sellingPrice >= mrp`: Rejects offers without discounts with `NO_DISCOUNT`.
  - Discount is calculated as `Math.round(((mrp - sellingPrice) / mrp) * 100)`.
- **Fault-Tolerance Isolation**: Each item in a scrape batch is processed within an individual `try/catch` block (Lines 55–124). A malformed offer or pricing error fails only the individual item, logging the failure, and does **not** terminate or abort the rest of the batch.

### 2.3 Scraping Network Error Classification
- **Line 127-142**: In `ingestSource()`, if the scraper fails or catches an exception, it inspects error types:
  - Socket timeouts, connection resets, CAPTCHA blocks, 403 Forbidden, 429 Rate Limits, and 5xx Server Errors are strictly marked as `ScrapeAvailability.UNKNOWN`.
  - They are **never** reported as `OUT_OF_STOCK`, preventing false-negative inventory de-listings.

### 2.4 Duplicate Candidate Detection & Append-Only History
- **Line 76-88**: Queries existing `DealCandidate` by `(sourcePlatform, externalId)`:
  - If candidate exists: Updates `sellingPrice`, `mrp`, `discount`, `title`, `url`, `stockStatus`, and updates `updatedAt`.
  - If candidate does not exist: Inserts new `DealCandidate` in `PENDING` state with unique identifier.
- **Line 92-104**: **Append-Only Price Observation**:
  - Every valid ingestion run unconditionally creates a new record in `PriceObservation` (`dealCandidateId`, `sellingPrice`, `mrp`, `sourcePlatform`, `observedAt`). Historical observations are never updated or deleted.

---

## 3. Queue & Worker Audit (`src/server/queue/`)

### 3.1 Connection & Redis Isolation (`src/server/queue/connection.ts`)
- Connects to dedicated Redis instance on port `6380` (`process.env.REDIS_URL`).
- `maxRetriesPerRequest: null` correctly configured as required by BullMQ.
- Shared connection factory provides independent instances for producers, workers, and schedulers to avoid head-of-line blocking.

### 3.2 Producer Deduplication (`src/server/queue/producers/index.ts`)
- Safe Job IDs: Sanitizes non-alphanumeric characters, replacing colons (`:`) and percentages (`%`) with underscores (`_`) to satisfy BullMQ 6.5.3 job ID requirements.
- Job Deduplication:
  - Source Scrape: `jobId: scrape_${sourceId}_${hourTimestamp}` prevents enqueuing duplicate scrapes within the same hourly bucket.
  - Candidate Discovery: `jobId: discover_${candidateId}_${Math.floor(Date.now() / 300000)}` deduplicates rapid evaluations within a 5-minute window.
  - Shadow Evaluation: Placed exclusively on `QUEUE_NAMES.SHADOW_INTELLIGENCE`, guaranteeing complete queue isolation from live deals.

### 3.3 Worker Isolation & Concurrency (`src/server/queue/workers/index.ts`)
- Dedicated worker classes with strict concurrency limits:
  - `SourceScrapeWorker`: Concurrency 2 (prevents scraper rate limiting).
  - `DealDiscoveryWorker`: Concurrency 5.
  - `DealLifecycleWorker`: Concurrency 5.
  - `ShadowIntelligenceWorker`: Concurrency 2.
- Exponential backoff: Failed jobs retry 3 times with exponential backoff (initial delay 5000ms).

### 3.4 Scheduler Resilience (`src/server/queue/scheduler/index.ts`)
- Cron schedules configured for:
  - Source check & scrape: Every hour (`0 * * * *`).
  - Stale candidate & lifecycle refresh: Every 15 minutes (`*/15 * * * *`).
  - Competitor shadow monitoring: Every 30 minutes (`*/30 * * * *`).
- `QueueScheduler.shutdownAll()` and `BackgroundWorkerManager.shutdownAll()` implement clean SIGTERM/SIGINT teardown, allowing running jobs to complete before closing connections.

---

## 4. Agent Isolation Verification
- **Agent 1 (`agent1-deal-hunter.ts`)**: Can only transition candidates to `AWAITING_APPROVAL` and generate `approvalToken`. It does not contain any publishing API call to Telegram channels or web feeds.
- **Agent 2 (`agent2-publishing-engine.ts`)**: Is not imported or invoked anywhere within `src/server/ingestion/service.ts`.
- **Agent 3 (`agent3-shadow-intelligence.ts`)**: Uses exclusively `ShadowCandidate` and `ShadowEvaluation` tables. Does not write to `Deal` or `DealCandidate`.

---

## 5. Review Verdict
**PASS**. The M12 source code is clean, robustly structured, adheres to the defined contracts, and contains zero live publishing hooks or bypass paths.


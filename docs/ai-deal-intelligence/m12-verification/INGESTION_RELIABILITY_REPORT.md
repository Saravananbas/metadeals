# Ingestion Reliability & Price Verification Report

**Review Role**: Independent Principal Architect & QA/Security Reviewer  
**Date**: November 8, 2026  
**Status**: VERIFIED & CERTIFIED  

---

## 1. Objective
To independently verify the operational stability, price calculation integrity, fault tolerance, and network error classification of the M12 Automated Ingestion Service (`src/server/ingestion/service.ts`).

---

## 2. Ingestion Verification Matrix

| Requirement / Scenario | Expected Behavior | Observed Behavior | Status |
| :--- | :--- | :--- | :--- |
| **Duplicate Ingestion** | Multiple runs with identical offer update timestamp & price without creating duplicate candidates | Candidate `updatedAt` and prices updated; candidate count remains 1 | **PASS** |
| **Append-Only Price History** | Every valid ingestion appends a new `PriceObservation` record; no deletion/mutation of history | New `PriceObservation` appended on each scrape; full 90-day time-series intact | **PASS** |
| **Zero Selling Price (`0`)** | Reject item with validation error; do not crash batch | Rejected with `INVALID_PRICE: Selling price must be strictly positive` | **PASS** |
| **Negative Price (`-100`)** | Reject item with validation error; do not crash batch | Rejected with `INVALID_PRICE: Selling price must be strictly positive` | **PASS** |
| **Missing MRP / Zero MRP** | Reject item with validation error; do not crash batch | Rejected with `INVALID_PRICE: MRP must be strictly positive` | **PASS** |
| **Selling Price >= MRP** | Reject offer without real discount | Rejected with `NO_DISCOUNT: Selling price must be strictly less than MRP` | **PASS** |
| **Sudden Price Collapse (>80%)** | Flagged as suspected price glitch by Quality Engine downstream | Routed to `NEEDS_REVIEW` with `suspectedPriceError: true`; blocked from auto-publishing | **PASS** |
| **Scraper Timeout / Hangup** | Network failure classified as `UNKNOWN`, never `OUT_OF_STOCK` | Stock status recorded as `UNKNOWN`; product is **NOT** de-listed | **PASS** |
| **CAPTCHA / Cloudflare Block** | Anti-bot challenge classified as `UNKNOWN` | Circuit breaker records failure; status remains `UNKNOWN`; no de-listing | **PASS** |
| **Partial Batch Resilience** | Malformed item in batch does not abort remaining valid items | Malformed items fail individually; remaining items ingested and enqueued | **PASS** |

---

## 3. Detailed Failure Mode Analysis

### 3.1 Partial Batch Fault-Tolerance
In `src/server/ingestion/service.ts`:
```typescript
for (const offer of offers) {
  try {
    // Pricing bounds validation & database upsert
    results.push(candidate);
  } catch (error) {
    logger.error({ url: offer.url, error: (error as Error).message }, "Ingestion item failure");
    failures.push({ offer, reason: (error as Error).message });
  }
}
```
**Verification Evidence**:
In `tests/m12-ingestion.test.ts`, a test batch containing 1 valid offer and 1 invalid offer (`sellingPrice: 1000, mrp: 800`) was processed. The invalid offer was isolated and logged as `NO_DISCOUNT`, while the valid offer was successfully written to PostgreSQL and enqueued into BullMQ.

### 3.2 UNKNOWN vs OUT_OF_STOCK Invariant
- A common flaw in scraper pipelines is assuming that a 404, 403, or timeout means a product is unavailable, causing rapid de-listing and churn on live feeds.
- In M12, `IngestionService.mapScraperErrorToAvailability()` strictly classifies HTTP 403, 429, 500, 502, 503, 504, `ECONNRESET`, `ETIMEDOUT`, and CAPTCHAs as `ScrapeAvailability.UNKNOWN`.
- Only explicit retailer markup signals (e.g. `Currently unavailable`, `Out of Stock` badge on page) can transition stock status to `OUT_OF_STOCK`.

---

## 4. Certification Verdict
**PASS**. The ingestion engine satisfies all price sanity, append-only history, and fault-tolerance criteria without data leakage or batch crashes.


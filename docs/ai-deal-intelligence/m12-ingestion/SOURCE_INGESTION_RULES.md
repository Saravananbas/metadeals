# Source Ingestion Rules & Circuit Breaker Policy (M12)

**Source Policy Engine**: `src/server/scraper/source-health.ts` & `src/server/ingestion/service.ts`

---

## 1. Connector Health Lifecycle

Connectors transition through 3 deterministic states:
1. **HEALTHY**: Operating within normal error tolerances. Consecutive failures = 0.
2. **DEGRADED**: Minor intermittent network errors (< 5 consecutive failures). Traffic continues with logging.
3. **SUSPENDED**: Circuit breaker tripped after **5 consecutive extraction failures**. Ingestion requests immediately rejected without opening network sockets.

---

## 2. Hard Ingestion Rules

1. **Classification of Network Failures**:
   - Any scraping timeout, socket hangup, HTTP 5xx, or Cloudflare/bot CAPTCHA block is classified as **UNKNOWN**.
   - **CRITICAL RULE**: Scraper failures must **NEVER** mark active deals or candidate listings as `OUT_OF_STOCK`.
2. **Pricing Bounds**:
   - Selling price must be strictly greater than 0 paise.
   - MRP must be strictly greater than 0 paise.
   - Selling price must be strictly less than MRP (non-zero discount).
   - Inversions (Selling Price >= MRP) are logged as errors and rejected from candidate creation.
3. **Reset & Recovery**:
   - A single successful batch execution resets `consecutiveFailures` to 0 and restores state to `HEALTHY`.
   - Administrators can manually invoke `sourceHealthManager.resetCircuitBreaker(sourceCode)` to force-clear a suspended connector.


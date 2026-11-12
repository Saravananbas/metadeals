# M03 Source Monitoring, Adapters & Health Report

**Milestone**: M03 — Source Monitoring, Adapters and Health Management  
**Status**: **`COMPLETE`**  
**Core Module**: `src/server/scraper/source-health.ts`  
**Tests**: `tests/m03-source-monitoring-health.test.ts` (3/3 Passed)

---

## 1. Capabilities Implemented

1. **Normalized Offer Contract (`NormalizedOfferContract`)**:
   - Universal contract capturing `sourceId`, `sourceType` (`RETAILER` vs `COMPETITOR`), brand, variant identifiers, MRP, selling price, coupon price, bank offers, delivery fees, and cryptographic snapshot references.
2. **Source Health & Circuit Breaker Engine (`SourceHealthManager`)**:
   - Tracks per-connector health state (`HEALTHY`, `DEGRADED`, `SUSPENDED`).
   - Automatically trips circuit breaker into `SUSPENDED` upon reaching 5 consecutive failures, guarding the system against ban loops or IP rate-limiting.
   - Provides administrative manual reset capability.
3. **Strict Network & Availability Classification**:
   - Guaranteed that scraper timeouts, network outages, or CAPTCHA triggers are recorded as `UNKNOWN` rather than misclassifying in-stock products as `OUT_OF_STOCK`.
   - Complete partition between RETAILER feeds (Agent 1) and COMPETITOR feeds (Agent 3).


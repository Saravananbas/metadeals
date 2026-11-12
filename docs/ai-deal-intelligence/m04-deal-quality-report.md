# M04 Historical Price Intelligence & Deal Quality Report

**Milestone**: M04 — Historical Price Intelligence and Deal Quality Engine  
**Status**: **`COMPLETE`**  
**Core Module**: `src/server/scraper/deal-quality-engine.ts`  
**Engine Version**: `1.0.0`  
**Tests**: `tests/m04-price-deal-quality-engine.test.ts` (3/3 Passed)

---

## 1. Capabilities Implemented

1. **Deterministic Independent Tri-Scoring**:
   - **Authenticity Confidence (0-100)**: Evaluates current price (25), 90d history (20), seller reputation (15), product/variant match (15), stock verification (10), coupon validity (10), source reliability (5).
   - **Deal Attractiveness (0-100)**: Evaluates savings against 90d average, 90d low, absolute rupee discount, cross-retailer competition, and demand.
   - **Commercial Priority (0-100)**: Calibrated strictly separate from user value (commission & basket size). Cannot inflate or override authenticity or attractiveness.
2. **Multi-Window Rolling Statistics**:
   - Computes average, median, min, max, count, and statistical coverage flags across 30, 90, 180, and 365-day periods.
3. **Hard Anomaly & Suspected Price Error Detection**:
   - Severe price drop (>80% off 90d median) on high-value items is automatically quarantined as `SUSPECTED_PRICE_ERROR`.
   - Never permitted automatic publishing authorization.


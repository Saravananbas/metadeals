# Price Observation & Historical Integrity Policy (M12)

**Module**: `src/server/scraper/price-history.ts` & `src/server/scraper/deal-quality-engine.ts`

---

## 1. Append-Only Integrity

- Every observed price for any candidate or deal is stored as an immutable, timestamped record in `PriceObservation`.
- Price observations are **NEVER updated or deleted**.
- Each observation records:
  - `merchantSlug`
  - `priceMinor` (in paise)
  - `mrpMinor` (in paise)
  - `sourceUrl`
  - `currency` (default "INR")
  - `candidateId` / `dealId`
  - `observedAt` (timestamp)

---

## 2. Statistical Baseline Calculations

The Deal Quality Engine consumes the append-only price history to compute rolling statistics:
- **30-Day Window**: Median, lowest observed, highest observed, count.
- **90-Day Window**: The authoritative price baseline for genuine discount evaluation.
- **Minimum Coverage Rule**: At least 3 distinct observations across the historical window are required before marking `hasSufficientCoverage = true`.
- **Anomaly Detection**: If the observed selling price is >75% below the 90-day median without precedent, the engine flags `isPriceErrorSuspected = true`, locking the candidate in `SUSPECTED_PRICE_ERROR`.


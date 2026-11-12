# Product Identity Validation & Variant Integrity (M12)

**Module**: `src/server/ingestion/service.ts` & `src/server/scraper/agent1-deal-hunter.ts`

---

## 1. Identity & Deduplication Principles

In e-commerce, material variants (e.g. 128GB vs 256GB phone, Blue vs Red) often share identical base product names but represent distinct economic items with different prices.

### Core Rules:
1. **Never Merge Distinct Variants**:
   - Products with distinct `externalId` (e.g. Amazon ASIN, Flipkart FSN) or distinct clean URLs are treated as separate candidate entities.
   - Fuzzy title matching is strictly prohibited from merging two listings that have different variant IDs or different colors/sizes.
2. **Deterministic Matching Key**:
   - Primary matching key: `(sourcePlatform, externalId)` (unique per retailer).
   - Fallback matching key: Normalized canonical `sourceUrl`.
3. **Price Movement Updating**:
   - If a re-ingested listing matches an existing candidate's key, the candidate's `observedPriceMinor` and `inStock` fields are updated.
   - A **new row** is appended to `PriceObservation` to capture the historical timestamp.


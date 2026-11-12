# Ingestion Architecture — MetaDeals4U (M12)

**Module Location**: `src/server/ingestion/service.ts`  
**Underlying Pipeline**: BullMQ Queues + PostgreSQL Schema + Agent 1 Quality Engine

---

## 1. End-to-End Ingestion Flow

```
[ Retailer Source Feeds (Amazon, Flipkart, Cuelinks V3) ]
                           │
                           ▼
[ Connector Registry (`connectorRegistry.get(code)`) ]
                           │
                           ▼
[ Source Health Check (`sourceHealthManager.canExecute`) ]
                           │ (Allowed: Circuit Breaker Closed)
                           ▼
[ Data Extraction (`connector.discoverListings()`) ]
    │
    ├─► If timeout / CAPTCHA / network fail:
    │      Classified as UNKNOWN (Never OUT_OF_STOCK)
    │      Increment connector failures in `SourceHealthRecord`
    │
    ▼ (Success: Normalized RetailerProductListing[])
[ Quality & Pricing Sanity Validation ]
    - Price > 0 and MRP > 0
    - Price < MRP strictly (Positive discount)
    - Product title >= 5 characters
                           │
                           ▼
[ Product Identity & Variant Deduplication ]
    - Match `(sourcePlatform, externalId)` or `sourceUrl`
    - If found: Update price/stock movement
    - If new: Insert into `DealCandidate` (Status: UNCERTAIN)
                           │
                           ▼
[ Append-Only Price Observation Record ]
    - Writes immutable observation into `PriceObservation`
                           │
                           ▼
[ Historical Observation Fetch (Up to 90 Days) ]
                           │
                           ▼
[ Agent 1 Quality & Authenticity Assessment ]
    - If Price Error Suspected: Held for review (`SUSPECTED_PRICE_ERROR`)
    - If Authenticity > 75 & In-Stock: Route to `AWAITING_APPROVAL`
                           │
                           ▼
[ Enqueue to `deal-discovery-queue` (BullMQ) ]
    - Awaiting human / mobile Telegram authorization
    - NEVER CALLS AGENT 2 PUBLISHER DIRECTLY
```

---

## 2. Ingestion Guarantees & Safety Perimeter

1. **Strictly Non-Publishing**: Ingestion produces `DealCandidate` rows and `PriceObservation` rows only. It has zero capability or code paths to publish into `Deal`.
2. **Cuelinks V3 Preservation**: Outbound tracking URLs and `/go/[dealId]` affiliate redirection links are completely untouched.
3. **No Variant Collapsing**: Distinct retailer `externalId` (e.g. ASINs, FSNs) or unique product URLs create separate candidate records.


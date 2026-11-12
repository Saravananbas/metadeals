# M02 – Product Identity and Intelligence Database Foundation

Read M01 audit first. Follow actual ORM and migration conventions. Extend existing entities rather than duplicating them.

## Objective
Establish additive data foundations for quality-first deal intelligence.

## Logical capabilities
- Canonical products.
- Product variants.
- Seller identities.
- Seller-specific product offers.
- Append-only price observations.
- Price anomaly evidence.
- Deal quality assessments.
- Source health records.
- Shadow candidates and evaluations.
- Publication authorization records.
- Deal lifecycle events.

## Product identity
Use GTIN/EAN, MPN, brand, model and variant attributes where available. Distinguish storage, size, colour, capacity, condition, region and other material variants. Never merge variants based on fuzzy name similarity alone. Support uncertain matches as review candidates.

## Price history
- Store every valid available observation; do not overwrite history.
- Prioritize 90-day analytics.
- Support 30/90/180/365-day windows.
- Preserve source, seller, product variant, timestamp, currency, extraction method and evidence.
- Distinguish MRP, selling price, coupon price, bank offer, delivery charge, cashback and effective price.
- Conditional discounts must not be represented as universally available prices.
- Store raw/evidence references safely, with retention and privacy controls.

## Governance
- Separate authorization records from publication jobs.
- Agent 3 shadow candidates must not have publishing authorization.
- Add constraints preventing suspected price errors from receiving automatic authorization.
- Preserve existing Deals, DealCandidate, PriceObservation and affiliate relationships.
- Use append-only audit/lifecycle events where appropriate.

## Database quality
- Use timezone-aware timestamps and NUMERIC/DECIMAL for money.
- Add foreign keys, indexes and unique/idempotency constraints.
- Avoid destructive renames/drops.
- Provide safe forward migration and rollback instructions.
- Do not insert fake production data.

## Tests
Migration up/down where supported, foreign keys, uniqueness, variant identity, append-only price history, authorization separation, shadow-mode restrictions and existing application regression tests.

## Acceptance
Additive migrations pass against development data; existing features remain compatible; schema and rollback report is complete.

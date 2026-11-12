# M08 – Agent 3 Registered Competitor Intelligence – SHADOW MODE ONLY

## Absolute restriction
Agent 3 must NOT publish deals during this milestone or any later milestone in this prompt pack.

It must not:
- Create publication authorizations.
- Enqueue Agent 2 publication jobs.
- Call publishing services.
- Create or update live Deals records.
- Change a live deal's visibility.
Enforce this at service/API authorization level, not just by hiding UI controls.

## Discovery scope
Only explicitly registered, enabled COMPETITOR sources. No unrestricted crawling. Respect access restrictions and terms. Do not bypass CAPTCHA, login or anti-bot protections.

## Workflow
1. Scan registered competitor sources.
2. Extract product/offer facts and source evidence.
3. Normalize product and variant.
4. Match canonical product identity.
5. Independently verify retailer price and availability where possible.
6. Record price observations with source and evidence type.
7. Calculate authenticity and attractiveness.
8. Detect duplicate, expired, unavailable, unverified and suspected price-error candidates.
9. Store shadow candidate only.
10. Produce source/category analytics and human evaluation queue.

## Shadow records
Store competitor source, original URL, discovery time, product/variant, observed competitor price, retailer verification URL/result, verified price, seller, confidence, attractiveness, anomaly class, evidence, duplicate linkage, potential eligibility and evaluation outcome.

## Human labels
- GENUINE
- FALSE_POSITIVE
- DUPLICATE
- PRICE_ERROR
- WRONG_VARIANT
- EXPIRED
- UNAVAILABLE
- UNVERIFIABLE

Store reviewer, timestamp and evidence.

## Analytics
Report total discoveries, unique candidates, duplicates, independently verified genuine deals, false positives, price errors, unverifiable candidates, overlap with Agent 1, incremental opportunities missed by Agent 1 and source/category precision.

Do not claim accuracy based only on model confidence. Use independently labelled outcomes and report sample sizes.

## Tests
Registered source enforcement, unregistered source rejection, no publishing authorization, no publishing queue, no live Deals writes, product matching, duplicate handling, price error classification and shadow evaluation.

## Acceptance
Agent 3 runs independently in shadow mode and has zero effective publishing capability. This restriction must remain in place after M08.

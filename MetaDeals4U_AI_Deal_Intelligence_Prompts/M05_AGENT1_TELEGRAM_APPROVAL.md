# M05 – Agent 1 Retailer Deal Hunter and Telegram Approval

Implement Agent 1 using registered RETAILER sources and shared M03/M04 services.

## Workflow
1. Scan enabled retailer sources.
2. Extract product, variant, seller, price and offer.
3. Match canonical product/variant.
4. Record price observation.
5. Verify price, availability and offer conditions.
6. Calculate authenticity and attractiveness.
7. Classify deal and detect anomalies/duplicates.
8. Persist candidate and evidence.
9. Route according to policy.
10. Notify authorized administrator via Telegram where appropriate.

## Routing
- Authenticity >75 and all mandatory checks pass and classification is not suspected price error: AWAITING_APPROVAL.
- Authenticity <=75 or insufficient evidence: REVIEW_REQUIRED.
- SUSPECTED_PRICE_ERROR: alert + dedicated manual investigation; never automatic publishing.
- Fake discount: reject.
- Wrong variant: review/reject.
- Duplicate: link to canonical candidate.
- Confirmed unavailable: do not publish.

The threshold is a routing threshold, not proof of probability or a substitute for mandatory checks.

## Telegram
Support deal notification with product/variant, seller, current price, MRP, 90-day history summary and coverage, payable price/conditions, source URL, confidence, attractiveness, anomaly warnings and evidence.

Actions: Approve, Reject, Hold, Reverify. Include rejection reasons such as fake discount, wrong variant, poor seller, duplicate, expired and unverifiable.

## Security
- Verify Telegram webhook secret.
- Maintain explicit admin Telegram user ID allowlist.
- Verify callback freshness and candidate state.
- Make callbacks idempotent and replay-safe.
- Never trust callback payload as authorization.
- Persist approval/rejection and audit details.
- Keep secrets server-side.

## Publishing boundary
Agent 1 never publishes directly. On valid approval it may create an Agent 2 job referencing the persisted approval. Agent 2 independently verifies it.

Suspected price errors require a dedicated manual investigation/approval process and must never be auto-published.

## Tests
Discovery, threshold boundaries, price error routing, unauthorized user, stale/replayed callback, duplicate callback, reject/hold, approval persistence and authorized job creation.

## Acceptance
End-to-end retailer scan → candidate → Telegram → authorized approval → persisted authorization → Agent 2 job. Do not publish in this milestone.

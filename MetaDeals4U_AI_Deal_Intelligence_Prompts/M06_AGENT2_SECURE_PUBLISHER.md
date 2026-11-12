# M06 – Agent 2 Central Authorized Publishing Engine

Agent 2 is the ONLY service allowed to create/update live published Deals records for discovered candidates.

## Accepted authorization types
- MANUAL_APPROVAL: persisted valid human approval.
- AUTO_PUBLISH_POLICY: persisted policy evaluation, but this type must remain disabled for Agent 3 throughout this project because Agent 3 is in shadow mode.

## Mandatory checks immediately before publishing
- Authorization exists, is valid and references this candidate.
- Candidate state permits publication.
- Product and variant are resolved.
- Current price and availability are freshly verified.
- Seller and offer conditions are understood.
- No duplicate or active equivalent deal exists.
- No suspected price error.
- Global and per-agent kill switches permit publishing.
- Affiliate eligibility and URL conversion are valid where required.

Never trust client-supplied `approved=true`, agent claims or callback payloads. Verify authorization from persistent server-side records.

## Integration
Reuse existing Deals model, publishing service, Cuelinks V3 conversion, original URL storage, `/go/[dealId]`, click attribution and existing admin deal manager. Cuelinks V3 remains the only affiliate monetization provider. Do not create a second redirect or affiliate service.

## Reliability
Use existing queue conventions. Implement idempotency, transaction-safe state transitions, job locks, retries, dead-letter/quarantine handling and audit records. Retrying must not create duplicate Deals or affiliate links.

## Safety
- Fail closed if authorization or price verification is unavailable.
- Do not publish suspected price errors.
- Respect kill switch at the final publication boundary.
- Agent 3 must not be able to invoke a publishing path during shadow mode.

## Tests
Valid/invalid approval, missing authorization, wrong candidate, expired/revoked approval, price change, unavailable item, suspected error, duplicate, Cuelinks failure/retry, idempotency, kill switch and existing deal-management regression.

## Acceptance
Agent 1 approved deal publishes through the existing website and Cuelinks infrastructure with server-side authorization. Agent 3 remains unable to publish.

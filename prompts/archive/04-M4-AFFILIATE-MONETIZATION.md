# M4 — Affiliate Monetization Engine

## Objective

Build a provider-based affiliate integration layer that can convert merchant URLs into affiliate URLs where the provider/account/campaign supports it, track outbound clicks, and import/report provider transactions where supported.

## Provider architecture

Inspect current project architecture and implement provider adapters, not one generic assumption for every network.

Potential providers:
- Cuelinks
- Amazon Associates / Creators API
- Flipkart Affiliate (subject to current program/API availability and account eligibility)

Before implementing a live adapter:
- Verify current official provider documentation and account eligibility.
- Document supported operations and limitations.
- Do not assume every provider exposes link conversion, product search, transaction reporting or sub-ID support.
- Use mock adapters until credentials and live-test approval are supplied.

## Requirements

1. Secure provider/account configuration on the server.
2. Store credentials only in environment/secret management.
3. Generate affiliate URLs where supported.
4. Allow authorized manual affiliate URL entry as fallback.
5. Store original URL, affiliate URL, provider, status and timestamps.
6. Validate destination domains and prevent open redirects.
7. Create internal redirect route such as `/go/[dealId]`.
8. Resolve the destination from trusted database data, never arbitrary user-supplied redirect parameters.
9. Record click timestamp, deal, provider and available referrer/channel attribution with data minimization.
10. Support provider-permitted sub-ID tracking only when documented.
11. Import transactions/commission reports only through documented supported methods.
12. Distinguish clicks, reported orders, pending commission, approved commission and rejected commission.
13. Never calculate confirmed commission from clicks alone.
14. Provide admin visibility into link status and provider errors.

## Reliability and safety

- Idempotent imports.
- Retry transient errors with bounded backoff.
- Respect provider rate limits and terms.
- Log redacted errors; never log secrets.
- Mock all external calls in automated tests.
- No live purchases or real production link tests without approval.

## Tests

URL conversion, unsupported provider, inactive campaign, manual fallback, invalid destination, redirect, click logging, duplicate transaction import and status transitions.

## Out of scope

No social publishing or customer messaging in this module.

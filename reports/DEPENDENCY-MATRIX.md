# Module Dependency Matrix

Legend: **HARD** = must be complete before implementation; **DECISION** = explicit
owner/provider approval; **DATA** = source records/events must exist first;
**INDEPENDENT** = safe planning or read-only work can proceed now.

| Module | Required predecessor/dependency | Owner/provider decision | Safe work now | Release gate |
|---|---|---|---|---|
| M1.5 Homepage | Existing Next.js app and approved visual reference | Artwork/contrast decisions only for exact-match follow-up | M1.5 is already complete; preserve it | Responsive and interaction acceptance at all four target widths |
| M2.5 Auth/admin | Existing identity tables and Prisma database | **RESOLVED: owner approved local credentials, mandatory TOTP, database sessions, role matrix and one-time CLI bootstrap** | Implemented local auth/admin foundation; initial account remains unprovisioned | Additive migration applied locally; lint/typecheck/unit and DB lifecycle tests pass; no production account or email provider |
| M3 Deal management | **HARD: M2.5 server-side authorization** plus explicit M3 authorization | Data retention, media policy, categories/merchant ownership, publish lifecycle | Additive schema review/design only | Reviewed additive migration; authorized CRUD/archive; validation, expiry, audit; data-preservation and integration tests |
| M4 Affiliate | **HARD: M3 trusted deal/merchant records**; M2.5 for admin setup | **DECISION: provider eligibility, terms, available APIs/reporting and credentials** | Provider-neutral requirements; official docs review after provider selection | Destination allowlist; safe redirect; attribution tests; provider capability claims backed by official evidence; no click/purchase conflation |
| M5 Publishing | **HARD: M2.5 + M3 published content** | **DECISION: destinations, consent/opt-in, retention, approval and live activation** | Mock message-format and idempotency design | Mock destinations; persisted consent/history; retry/idempotency and failure tests; no live sends without explicit approval |
| M6 Analytics/SEO/production | M2.5 for protected dashboards; M3 deal state; M4 click/import data; M5 delivery history for channel reporting | **DECISION: public domain, verified content, indexing/launch approval, privacy/retention** | Audit headers, accessibility/performance and dependency graph; preserve noindex | Truthful event sources; accurate metadata/schema/sitemap; staging remains noindex; complete security, accessibility, performance and launch checks |
| M7 Shared API/mobile | **HARD: implemented services from M2.5/M3**; M4/M5 endpoints only if verified and required | **DECISION: mobile auth/token policy and public API limits** | Contract principles and design-token inventory | Versioned contracts from real services; auth, pagination, validation, errors, rate limits, OpenAPI and contract/security tests |

## Dependency graph

```text
M1.5 (complete)

M2.5 local identity/authorization foundation (implemented; initial admin unprovisioned)
  └── M3 persisted deals + authorized administration
        ├── M4 verified affiliate adapter + trusted redirects
        ├── M5 approved publishing + consent + idempotent delivery
        ├── M6 deal analytics/SEO and admin reporting
        └── M7 public deal/search/category API
              ├── may consume M4 outbound-link capability
              └── may consume M5 notification preferences only after consent

M6 channel-delivery analytics additionally depends on M5 history.
M6 click/conversion reporting depends on M4 verified click/provider records.
```

M6's independent security/accessibility/performance inventory and M7's
contract-principle documentation can be done without implementation. They do
not make the dependent modules ready or justify fabricated data/services.

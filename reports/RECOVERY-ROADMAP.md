# Prioritized Recovery Roadmap

This roadmap is updated after M2.5. Complexity is a relative engineering
estimate (S/M/L/XL), not a calendar promise. No M3 or later feature is
authorized by the M2.5 implementation approval.

| Priority | Module/work | Decisions/dependencies | Main implementation tasks | Complexity | Acceptance criteria |
|---|---|---|---|---|---|
| P0 | Preserve baseline and finish decisions | Owner approvals for M2.5; port 4123 | Preserve M1.5 and working changes; document local auth and operational limits | S | **COMPLETE**; M2.5 security policy explicitly approved; no user changes lost |
| P1 | M2.5 Authentication and authorization | Owner-approved local credentials and bootstrap policy | Argon2id, mandatory TOTP, opaque DB sessions, role checks, CLI bootstrap/reset, admin portal, audit and rate limits | L | **IMPLEMENTED / LOCAL VALIDATION PASS**; additive migration applied locally; initial admin remains unprovisioned |
| P2 | M3 Deal management | M2.5 complete; explicit M3 authorization; additive schema review | Model merchants/categories/deals/media/status; repository/service validation; expiry; authorized admin workflows; media validation/private storage strategy | XL | Existing identity rows preserved; reviewed migration and rollback plan; CRUD/archive and publish-state tests; demo fallback remains clear until verified content is loaded |
| P3 | M4 Affiliate | M3 trusted destination records; provider documentation and account approval | Provider-neutral interface; only verified adapters; allowlisted outbound destinations; click attribution; manual URL path; import/report reconciliation if supported | L | Host allowlisting and redirect abuse tests; clicks separated from sales/commission; provider claims documented and verified; mock tests pass with no live credentials |
| P4 | M5 Distribution | M2.5/M3; consent, destination, policy and retention decisions | Approval lifecycle; queue/worker; mock Telegram/official WhatsApp adapters; idempotency, retries, history and opt-out | XL | Mock-only delivery and retry suites pass; per-destination deduplication; consent enforced; no real messages without separate approval |
| P5 | M6 Analytics/SEO/launch readiness | M3 records; M4 click/report data; M5 history for channels; production domain/content/launch approval | Privacy-minimized events and aggregation; accurate metadata/OG/canonical/sitemap; structured data only from visible verified deal fields; audit, accessibility/performance and production checklist; dependency fix review | L | No fabricated metrics/schema; staging noindex test; production indexing explicitly gated; security/a11y/performance tests and full runbook reviewed; never claim launch-ready prematurely |
| P6 | M7 Shared API/mobile readiness | Stable M2.5/M3 services; verified M4/M5 capabilities; mobile token decision | Versioned API routes, schemas, cursor pagination, consistent errors, auth/rate limits, OpenAPI and contract tests; extract tokens only where actually shared | L | Public/admin DTO separation; authz, validation, pagination and contract tests; deep-link fallback plan; no Expo app until separately approved |

## Safe independent work before M3 approval

- Keep the working application and port 4123 configuration intact.
- Run static quality checks and read-only dependency/security inventory.
- Prepare threat model, migration review template, retention/consent questions,
  API style and production checklist.
- Perform accessibility and performance audits on the completed homepage without
  changing approved visual tokens absent approval.
- Review the vulnerable dependency tree and identify compatible update options;
  do not apply a forced breaking downgrade.
- Keep noindex enabled; do not generate fake analytics, deal content, conversions
  or message outcomes.

## Stop conditions

Stop an implementation step if it requires unapproved identity, real credentials,
destructive schema/data actions, unverified provider behavior, live messaging,
production deployment, or public indexing. Record the blocker and continue only
with independent work.

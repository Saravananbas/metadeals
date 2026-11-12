# M8 Master Progress

Last updated: 2026-11-09

## Overall status

**Stage:** Phase 1 audit complete; Phase 2 shared deterministic extraction runtime in progress.  
**M8 completion:** implementation is in progress; no phase is accepted complete beyond the audit.  
**Release gate:** Security and migration validation required before any configuration activation or bulk onboarding.
**User acceptance target:** at least 80% of the verified merchant inventory must pass repeatable URL-fetch tests for required deal fields; do not claim this until the full inventory has evidence.

## Milestones

Completed work is removed from this active task table. Phase 1 audit is complete and documented in `ARCHITECTURE_AUDIT.md`.

Latest completed slice: active Bata directory lookup/safe-fetch gate, shared parser-fallback extraction, persisted required-field coverage/provenance telemetry, AJIO deterministic adapter rules, and shared adapter use in HTML Review. Extraction results with missing required title, image, price, MRP, merchant mapping, or category mapping report PARTIAL_SUCCESS. Review no longer guesses prices from arbitrary page text or manufactures MRP. The extraction runtime is still in progress because database-configured rules and broader merchant coverage are not implemented. Thirty-two targeted tests passed; typecheck and focused source-file ESLint passed. Docker Desktop confirmed the existing app container restarted earlier; current host HTTP readiness and live database verification are not established by this session.

| Open task | Status | Next evidence / acceptance condition |
| --- | --- | --- |
| Shared deterministic extraction engine | IN PROGRESS — parser fallback, coverage telemetry, AJIO adapter and Review reuse delivered | Shared runtime fills missing adapter fields from JSON-LD, embedded product JSON, Open Graph and standard metadata; AJIO has explicit page rules for title, brand, labelled sale price/MRP, product code, commodity and product images. HTML Review uses the same adapter/fallback path as Fetch. Extraction logs record required-field coverage, provenance, merchant/category mapping, and gallery size. Remaining: database-driven CSS/JSON-path rules, configured priorities, field-specific retries and richer validation states. |
| Merchant coupon configuration, versions and rollback | NOT STARTED | Extend the planned merchant config schema with coupon rules and history; reuse existing registry, no second framework. |
| Deterministic coupon discovery and normalization | NOT STARTED | Extract public, permitted offers into typed records; preserve unknown conditions as null and use no AI/LLM. |
| Coupon evidence and validation lifecycle | NOT STARTED | Store DISCOVERED/VERIFIED/UNVERIFIED/EXPIRED/INVALID/RESTRICTED/UNKNOWN with evidence; never mark a code working merely because it appears on-page. |
| Transparent coupon/bank price calculations | PARTIAL FOUNDATION | Reuse `PriceObservationRecord.couponPricePaise` and `bankOfferPaise`; define separate normal/coupon/bank prices and prohibit unsupported stacking/double-counting. |
| Coupon discovery monitoring and product-preview integration | NOT STARTED | Extend existing Merchant Intelligence and preview/admin workflows with real metrics; do not create a separate dashboard or scrape framework. |
| Additive config/rule/version/test/log schema | NOT STARTED | PostgreSQL and MariaDB parity, disposable migration validation, authorization and rollback coverage. |
| Existing merchant page extraction configuration UI | NOT STARTED | Manage configs, mappings, test URLs/results, versions, activation/deactivation and rollback. |
| Deterministic rule discovery worker | NOT STARTED | Propose/test pending rules from permitted sources only; no CAPTCHA/access-control bypass. |
| Normalized product data and validation | PARTIAL FOUNDATION | Add field states/provenance, price and variant conflict checks, image deduplication, and publication gates without inventing values. |
| Real-data extraction dashboard | NOT STARTED | Metrics sourced from database execution/configuration records, never sample values. |
| Performance controls and isolated browser worker | NOT STARTED | Rate/concurrency limits, bounded resource use, idempotency/retries and process isolation; only add browser automation if permitted and needed. |
| Extraction regression suite | IN PROGRESS | Add focused security, strategy, fallback, config, concurrency, price, image and integration tests; run relevant regressions. |
| 15-merchant pilot (five URLs each) | GATED | After engine/security gates pass, target at least 12/15 merchants with at least 4/5 URLs each yielding the required deal fields (title, image, selling price, MRP, merchant, category and subcategory); record optional-field coverage separately. This pilot does not prove the full-inventory target. |
| Bulk onboarding of directory merchants | GATED | Start only after pilot acceptance; classify each merchant by evidence-based status. Current live merchant count is unverified. |
| M8 completion report | NOT STARTED | Report delivered architecture, actual URL tests, field coverage, security/performance results and remaining blockers. |

## Immediate next actions

1. Expand the shared runtime to support safe, database-configured selectors/paths, API/feed sources and field-level validation states; keep authorization and publication gates intact.
2. Inspect whether the planned extraction configuration schema can safely include coupon rules, conditions, validation history and discovery logs; add only missing additive models.
3. Continue with configuration UI and deterministic discovery only after engine/security gates pass.

## Known constraints

- Do not use LLMs in any product extraction or rule discovery path.
- Do not create a second merchant registry, scraper framework, or product schema.
- Preserve all existing uncommitted files.
- Do not apply changes to Hostinger/production.
- Docker Engine currently cannot be accessed from this session; live database count, migration status, container tests, and live URL tests are unverified.
- Latest focused extraction/security suite passed 31 tests; `npm run typecheck` and focused production-source ESLint passed after the shared fallback engine slice.
- Do not mass-activate or mark inaccessible merchants as validated.

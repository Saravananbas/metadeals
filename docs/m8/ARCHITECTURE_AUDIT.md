# M8 Universal Merchant Extraction Engine — Architecture Audit

Audit date: 2026-11-09  
Repository: `D:\Metadeals`  
Branch observed: `copilot/overnight-roadmap-2026-11-02`

## Executive summary

MetaDeals4U already has a deterministic product-extraction subsystem, a merchant website directory, product/catalog models, scraper connectors, a Redis/BullMQ foundation, and unit/integration tests. It is not yet a database-driven universal merchant extraction engine. Extraction support is selected by a static domain allowlist and a small code-defined adapter registry. There are no per-merchant extraction rule records, rule versions, test URL/result records, or a rule discovery worker. Playwright is not declared as an application dependency and no browser worker implementation was found.

The current merchant registry and extraction support are separate. `MerchantWebsiteDirectory` stores merchant domains, while `validateProductUrl` separately consults a static extraction allowlist. Thus an active directory entry for `www.bata.com` can appear in admin merchant selection while product extraction still rejects the domain as unsupported. The directory is not currently consulted by URL validation or adapter selection. This explains the error in the user’s screenshot; it is not evidence that Bata is missing from the directory.

The M8 user-provided target of 179 merchant records was not independently verified. Historical screenshots in this conversation show 182–185 directory entries, but screenshots are not a database inventory. Docker Engine was unavailable during this audit, so the current database count and migration state remain unverified.

## Existing architecture

| Concern | Current implementation | M8 assessment |
| --- | --- | --- |
| Merchant website directory | `MerchantWebsiteDirectory` in `prisma/schema.prisma`; admin UI at `/admin/merchant-websites`; CRUD/list service in `src/server/merchants/directory-service.ts`; XLSX import scripts upsert records by domain. | Suitable source for database-driven merchant configuration, but it has no extraction configuration relation today. Live record count was not verified. |
| Operational merchants | Separate `Merchant` model in `prisma/schema.prisma`; `Deal` and `PurchaseOption` reference it. Admin deal workflows can sync a directory row to an operational merchant. | Preserve for existing deal foreign keys. Do not add a third registry. M8 needs an explicit directory-to-operational mapping strategy. |
| Categories | `Category` model with parent/child hierarchy. | Existing taxonomy can receive inferred product categories; extraction output must identify a leaf when evidence supports it and leave ambiguous values for review. |
| Product catalog | `ProductMaster`, `ProductVariant`, `ProductOffer`, `PriceObservationRecord`, `DealCandidate`, and `PriceObservation` models. | Reuse these for identity, variants, offer/price history, and candidate lifecycle. Avoid another product schema. |
| Extraction API | Admin catch-all API exposes `product-extraction` and `product-extraction/inspect`. Main path calls `ProductExtractionService`; inspect path parses HTML/metadata directly. | Two entry paths must share validation, field extraction, and provenance behavior. |
| Extraction runtime | `src/server/product-extraction/core/service.ts`, `core/registry.ts`, `core/normalizer.ts`, adapter base parsers, and retailer adapters. Uses deterministic code; no LLM/provider call was found in the product-extraction pipeline. | Reusable base exists, but runtime strategies and priorities are code-defined rather than database-driven. |
| Current adapters | Amazon India, Flipkart, Myntra, Croma, and generic structured-data adapter. Generic handling still depends on the static domain allowlist. | Supports selected special cases and JSON-LD/Open Graph/embedded data; does not support arbitrary active directory merchants automatically. |
| Structured parsers | `src/server/product-extraction/adapters/base.ts` parses JSON-LD, Open Graph, standard metadata, and selected embedded application JSON. | Good deterministic fallbacks to retain and normalize behind one engine. |
| Extraction provenance | `FieldProvenance<T>` contains value, source, confidence, optional observed time and note. Extraction output includes diagnostics and warnings. | Partial foundation. Required M8 validation states, selector/JSON-path provenance, and configuration version are not represented consistently. |
| Extraction logs | `ProductExtractionLog` records retailer, URL, overall status, source method, error code, JSON summary, and timestamp. | No per-field attempt/result history, configuration version, test run, or execution detail table. |
| Scraper connectors | `ConnectorRegistry` currently registers Cuelinks feed, Amazon, and Flipkart connectors. Amazon/Flipkart connectors return fixtures unless their permitted APIs are configured; Cuelinks uses the existing client. | Preserve Cuelinks V3 and approved affiliate sources. Connectors are separate from product-page extraction and should not be duplicated. |
| Redis/BullMQ | Queue names, producers, workers, and a scheduler exist under `src/server/queue`. The worker callbacks currently log/return placeholder results rather than performing source extraction or rule discovery. | Extend these workers for discovery/testing after queue payloads, persistence, rate limits, retries, and observability are specified. |
| Browser automation | No Playwright/Puppeteer application dependency or worker source was found. `package.json` contains no Playwright runtime dependency. | Not implemented. A browser worker must be isolated from the web app and apply strict network/resource restrictions before use. |
| Admin extraction UI | Deal Manager contains the product extraction preview and a separate HTML review mode. Merchant directory UI is the existing merchant management page. | Add configuration/test/history sections to the existing merchant page; do not create a parallel merchant interface. |
| Tests | `tests/product-extraction.test.ts` covers URL validation, adapter routing, parser fixtures, taxonomy matching, and SSRF hostname cases. Integration scripts exercise product extraction and browser workflows. | Existing tests are useful but do not cover database rules, strategy fallback, version activation/rollback, full merchant pilots, or browser-worker isolation. |

## Extraction flow observed

1. `/api/v1/admin/product-extraction` calls `ProductExtractionService.extractProduct`.
2. `validateProductUrl` enforces HTTPS, blocks credentials/custom ports and selected private/loopback host forms, then checks the static `domain-allowlist.ts`.
3. `AdapterRegistry` selects a code-defined retailer adapter.
4. The service checks adapter authorization and calls `safeFetchText` for HTML where allowed.
5. The adapter parses retailer-specific or structured metadata into a normalized object.
6. Optional image import uses a separate public-image fetcher and media storage pipeline.
7. `matchCategoryAndMerchant` loads categories, operational merchants, and active directory entries from PostgreSQL; it matches merchant identity/domain and scores categories using deterministic terms.
8. The service builds suggested form values, diagnostics, and writes `ProductExtractionLog`.

This flow has no configuration-rule runtime and does not try a per-field sequence of database-configured strategies. The direct HTML inspect endpoint has additional parsing logic and should be consolidated with the shared runtime.

## Bata unsupported-domain error

The specific error `Retailer domain "www.bata.com" is not supported` is returned by `validateProductUrl` when neither the static extraction allowlist nor the allowed-domain registry recognizes the host. The Merchant Website Directory is not consulted at that point. Directory membership currently supports merchant selection/synchronization, but does not authorize product extraction. The screenshot can therefore show Bata selected while an earlier product extraction request still reports that it is unsupported.

M8 status after focused implementation: the extraction path now resolves active directory entries with exact/label-boundary matching and routes an otherwise-unconfigured directory merchant through generic structured-data extraction as partial/manual review. The direct inspect path now uses the shared safe fetch. Six focused M8 tests and 21 existing extraction tests pass. This is unit-test evidence only; live PostgreSQL lookup and retailer access remain unverified.

## Security findings and gates

### Baseline audit findings and remaining gates

- At audit time, `safeFetchText` did not pin DNS and direct inspect followed redirects unchecked. The current shared fetch now resolves and pins a public address per hop and applies HTTPS, merchant-domain, credentials, and port checks on redirects. Unit tests cover approved cross-subdomain redirects and private-address rejection; actual DNS/rebinding behavior against live networks is not verified.
- Before broad activation, expand security coverage for DNS rebinding, all private/reserved IPv4/IPv6 ranges, response-size limits, timeout behavior and redirect-limit behavior.
- Database-stored selectors, XPath, JSON paths, and test URLs must be treated as untrusted configuration. Only a narrow selector grammar and bounded parsers should run; no eval, SQL, arbitrary script, or page JavaScript execution in the API process.
- Browser rendering is absent. When added, it must run in an isolated worker/container with bounded CPU/memory/time, blocked private/link-local/metadata networks, controlled subresources, per-merchant concurrency/rate limits, and no access to app/database credentials.
- Directory `ACTIVE`/`VERIFIED` is administrative status, not evidence that automated extraction is authorized or validated. M8 needs independent configuration authorization and test status.
- Existing exact field provenance omits explicit validation state and extraction-rule version; retain evidence and do not calculate missing price/discount values as if directly observed.

### AI extraction check

A source search of `src/server/product-extraction`, the admin product-extraction route, and Deal Manager found no OpenAI, OpenRouter, Gemini, Claude, Anthropic, or LLM invocation. The current extraction implementation is deterministic. The M8 rule discovery and runtime must keep this property; unrelated AI Deal Intelligence code is outside the extraction pipeline and must not be wired into it.

## Coupon intelligence extension findings

- There is no standalone coupon/offer discovery registry or normalized coupon-condition/history model in the current Prisma schema.
- Existing reusable fields include `Deal.couponCode`, extraction-time `ProductPricing.couponDiscount` and `bankOffers`, and `PriceObservationRecord.couponPricePaise` / `bankOfferPaise`. These represent partial data only; they do not capture coupon type, eligibility, validity, evidence, status history, or stacking compatibility.
- `CuelinksClient` already retrieves affiliate offers/coupon codes through its existing integration. Preserve and reuse that authorized feed path; do not replace it with a separate scraper framework.
- The coupon extension must be integrated with the same merchant configuration/runtime and publish preview. Keep ordinary sale price, coupon-adjusted price and conditional bank/payment prices distinct. Unknown terms stay null and coupon presence alone is not proof of validity.

## Runtime verification limits

- `docker compose ps` failed because access to the Docker Desktop Linux Engine named pipe was denied.
- The current Postgres/MariaDB merchant counts and migration status were not queried.
- Current live extraction success rates and representative URL accessibility were not measured.
- No claim is made that 179 merchants, 15 pilot merchants, or any merchant configurations are validated.

## M8 implementation direction

1. Keep `MerchantWebsiteDirectory` as the configuration owner and preserve the operational `Merchant` table for existing deal references; add a deterministic mapping where needed rather than creating a new merchant registry.
2. Make both extraction entry points call one shared orchestration service.
3. Resolve an active merchant by exact normalized domain/valid subdomain boundary from the directory. A known merchant without a permitted or activated configuration should remain manual-review only.
4. Add additive models for extraction configuration, field rules, versions, test URLs/results, and field execution logs; define clear foreign keys and migration parity for PostgreSQL/MariaDB.
5. Implement a restricted deterministic interpreter with field-specific priority/fallback and provenance, then validate JSON-LD, metadata, embedded JSON, approved APIs/feeds, and safe CSS/XPath rules.
6. Fix outbound fetch security and test redirect, DNS, IP-range, response-size, timeout, and concurrency boundaries before adding a browser worker.
7. Add configuration management to the existing Merchant Website Directory page and test/activation/rollback workflow.
8. Run a 15-merchant, five-URL-per-merchant pilot only on permitted and accessible URLs. Do not bulk-activate untested rules or report inaccessible merchants as successes.
9. Bulk onboarding remains gated by measured pilot quality and the verified live merchant inventory.

## Repository preservation note

The working tree already contains extensive pre-existing modified and untracked files. No M8 implementation source, package manifest, schema, migration, or database files were changed before this audit was written. Later M8 edits are limited to the audited extraction/security scope; unrelated work must remain untouched.

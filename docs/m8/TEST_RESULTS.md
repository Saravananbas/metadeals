# M8 Test Results

Last updated: 2026-11-09

## M8-specific validation

M8 Bata lookup/safe-fetch and shared extraction-engine tests were run on 2026-11-09. The latest extraction run also covers AJIO-specific deterministic parsing. Coupon-specific tests have not been implemented. After adding required-field coverage logging and partial-success classification, the extraction test set and typecheck were rerun successfully.

## Existing validation observed from the current development thread

| Check | Result | Scope/limits |
| --- | --- | --- |
| `tests/m8-merchant-fetch.test.ts` | PASS, 6 tests | Active Bata/subdomain resolution; inactive, unknown, deceptive and insecure URL rejection; redirect host boundaries; per-hop pinned resolver use; private metadata redirect rejection; private IPv4/IPv6 literal rejection. DB is mocked; live DNS not tested. |
| `tests/product-extraction-engine.test.ts` | PASS, 4 tests | Strategy priority and provenance, adapter/API precedence, restricted-field preservation, URL-heuristic replacement, medium-confidence brand inference, gallery image deduplication/HTTPS restriction. |
| `tests/product-extraction.test.ts` | PASS, 21 tests | Existing adapter, parser, URL/SSRF hostname, and taxonomy regressions. |
| `tests/product-extraction.test.ts` latest run | PASS, includes AJIO rule fixture | AJIO title, brand, labelled price/MRP, product code, commodity and image parsing fixture. |
| Focused ESLint | PASS | Deal Manager, admin catch-all route, and product extraction normalizer during the preceding UI fix. |
| `npm run typecheck` (2026-11-09) | PASS | Prisma client and Next route types generated; `tsc --noEmit` exited successfully after M8 changes. |
| Focused ESLint (M8 production source, 2026-11-09) | PASS | Safe fetch, fetch policy, domain allowlist, URL validator and directory matcher. Test files are ignored by repository ESLint configuration. |
| Focused ESLint (extraction engine and related sources, 2026-11-09) | PASS | Shared engine, service integration, parser, normalized types and security helpers. |
| Targeted extraction run (all three files, 2026-11-09) | PASS, 31 tests total | 6 merchant/security + 4 engine + 21 existing extraction tests. |
| `npm run typecheck` after required-field coverage change | PASS | Prisma client and Next route types generated; TypeScript check exited successfully. |
| Latest `npm run typecheck` after AJIO and Review changes | PASS | Prisma client and Next route types generated; TypeScript check exited successfully. |
| Latest targeted extraction test run | PASS, 32 tests total | `tests/product-extraction.test.ts`, `tests/product-extraction-engine.test.ts`, and `tests/m8-merchant-fetch.test.ts`. |
| Latest focused ESLint | PASS | Admin API route and AJIO/registry/domain source files; test file is ignored by repository ESLint configuration. |
| AJIO user-provided HTML fixture | PASS | Parsed the supplied AJIO ProductGroup JSON-LD fields, variant highPrice, and product-specific image URLs; no scripts are executed. |
| Full supplied AJIO source attachment | PASS | Direct local parser run returned title, Indie Picks brand, description, ₹832 price, ₹4,897 MRP, Women > Ethnic Wear > Kurta Suit Sets, SKU 702772571003, and 10 gallery images. This validates HTML parsing only; the server's live AJIO request still receives HTTP 403. |
| Pasted HTML review request boundary | PASS, 33 targeted tests total | `/product-extraction/inspect` has a route-specific 1 MB limit; default 16 KiB request limit remains unchanged for other callers; oversize payload is rejected. |
| Typecheck after HTML review changes | PASS | `npm run typecheck` completed successfully. |
| Focused ESLint after HTML review changes | PASS | Admin API route, bounded JSON reader, AJIO adapter and extraction service. |
| Docker app restart after HTML review changes | PASS | Only `metadeals4u-app-1` restarted; reported `running healthy`. |
| Safe-fetch diagnostic refinement | PASS | Product requests now use a clearly identified MetaDeals product-fetcher user agent and report upstream HTTP status codes. URL allowlisting, HTTPS, redirect boundaries and DNS pinning remain enforced. |
| Existing Docker app restart | PASS | Restarted only `metadeals4u-app-1`; Docker reports `running healthy`. Postgres and Redis were not restarted. |
| Live AJIO product fetch from this session | FAIL / SOURCE REJECTED | Owner screenshot from `/admin/deals` confirms upstream HTTP 403. The AJIO adapter receives no product HTML, so the title, photos, description and prices remain unavailable. This confirms the adapter fixture pass is not a live integration pass. Direct outbound DNS from this session also fails. Do not bypass access controls; require an authorized merchant/affiliate product feed or manual review for these fields. |
| Focused ESLint (`src/server/product-extraction/core/service.ts`) | PASS | No lint errors. |
| Docker app restart | PASS in Docker Desktop UI | Existing `app-1` restarted; Postgres and Redis remained running. |
| Host HTTP readiness (`127.0.0.1:4123`) | NOT VERIFIED | Host sandbox denied socket access; Docker UI showed `app-1` running with port 4123 mapped. |
| Current PostgreSQL/MariaDB connectivity and migration state | NOT VERIFIED | Docker access unavailable. |
| Current merchant inventory count | NOT VERIFIED | No live directory query was possible. |
| 15-merchant × 5-URL pilot | NOT RUN | M8 engine/configuration gates have not been implemented. |
| Playwright/browser-worker isolation | NOT VERIFIED / NOT IMPLEMENTED | No application Playwright dependency or worker found. |

## Required M8 test gates

- Database configuration CRUD, versioning, activation/deactivation, rollback, and audit authorization.
- Safe strategy order and field-specific fallback with provenance.
- Active/inactive/unknown merchant resolution and exact host boundary tests: PASS in unit tests; live database behavior NOT VERIFIED.
- Bata domain resolves from the active merchant directory and no longer produces the false unsupported result: PASS in unit tests; live database behavior NOT VERIFIED.
- Coupon extraction/normalization, evidence-based status, price separation, duplicate handling and no-stacking-without-evidence tests.
- Redirect, DNS rebinding, private IPv4/IPv6, link-local, localhost, and metadata-address protections.
- HTML response size, image size, parser timeouts, concurrency, rate limiting, idempotency, retries, and worker crash recovery.
- Price normalization, discount recalculation, price conflicts, variant handling, and missing-field behavior.
- PostgreSQL and MariaDB disposable migration parity.
- 15 merchants × 5 permitted URLs pilot with evidence per field; failures remain failures.
- Existing deal management, Cuelinks V3, affiliate attribution, and admin publishing regressions.

Do not mark a gate PASS without fresh execution evidence.

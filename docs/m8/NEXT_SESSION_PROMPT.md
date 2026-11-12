# M8 Continuation Prompt

Continue MetaDeals4U M8 — Universal Merchant Extraction Engine — in `D:\Metadeals`.

Before coding:

1. Read the project `AGENTS.md` instructions and relevant Next.js 16 guides from `node_modules/next/dist/docs/` before changing Next code.
2. Read `docs/m8/ARCHITECTURE_AUDIT.md`, `MASTER_PROGRESS.md`, `SESSION_HANDOFF.md`, `TEST_RESULTS.md`, and this file.
3. Inspect the actual Git status, current source, database/container state, and existing rule work. The repository has extensive pre-existing uncommitted changes; preserve all unrelated modifications and untracked files.
4. Verify every previous claim from source/tests. Do not assume Docker or the database is available.

Mission:

- Implement one deterministic product-extraction engine and one authoritative merchant configuration registry by extending existing structures.
- No LLM/API calls in extraction, rule discovery, selector identification, page interpretation, or missing-field recovery.
- Keep Cuelinks V3, existing affiliate tracking, deals, catalog and scraper modules intact.
- Respect retailer permission, robots/access restrictions; never bypass CAPTCHA or bot protection.
- Protect SSRF, redirects, DNS rebinding, private/local/metadata IPs, hostile HTML, oversized responses, and browser-worker resources.
- Include the M8 rule-based Coupon Intelligence extension: no AI/LLM, use the same merchant registry/configuration/workers/dashboard, preserve eligibility evidence, and keep coupon/bank prices separate without unsupported stacking.
- Keep Agent 3 shadow-only and preserve all publishing authorization restrictions.
- Do not deploy, push, or modify Hostinger/production.
- Treat the user's goal of at least 80% merchant websites returning complete required deal fields as a measured acceptance target. Do not claim success without field-level test evidence across the verified inventory.

Resume at the Bata bug: `validateProductUrl` uses a static extraction allowlist and does not consult the Merchant Website Directory. Implement safe active-directory resolution without loose suffix matching, make the generic structured-data adapter available for eligible active entries, and remove unchecked redirect fetching in the direct HTML inspect endpoint. Add regression tests before proceeding.

Then proceed through M8 in gated increments: shared engine; additive PostgreSQL/MariaDB config/rule/version/test/log schema including coupon rules and evidence history; existing merchant page UI; deterministic product and coupon discovery; transparent offer pricing; 15-merchant × five-URL pilot; only then consider bulk onboarding; normalized field provenance/validation; real-data dashboard; isolated browser worker if needed; regression suite and completion report.

Run tests after each implementation slice. Validate additive migrations on disposable databases first. Applying migrations to local Docker development is allowed only if Docker is running and the operation remains additive; do not touch production. Update all five `docs/m8` checkpoints as work progresses. Never claim the requested 179 merchants or any pilot records are validated without live evidence.

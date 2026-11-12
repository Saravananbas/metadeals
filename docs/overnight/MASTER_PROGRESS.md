# MetaDeals4U Master Progress

Last updated: 2026-11-11

## Overall status

**In progress — stabilization phase.** The project is not production-ready. Local container build, lint, typecheck, and 144 disposable-container tests pass. Production admin/affiliate workflows, remote CI, real worker/scheduler operations, and controlled performance profiling remain incomplete or unverified.

## Current stage

Phase 2–3: local Docker/runtime verification and confirmed bug remediation. See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the deduplicated scope and gates.

## Latest runtime/deployment progress (2026-11-11)

- User-selected direction is managed Node.js hosting without an additional VPS; no Hostinger account or environment was accessed.
- `npm run dev` now starts the web app directly in Windows on port 4123 with Next.js Webpack. Docker Desktop UI confirmed only the Compose `app-1` web container was stopped; PostgreSQL, Redis and Python extractor remain running. Container/image/volume data was not deleted.
- `npm run start` now respects `PORT`; `npm run start:local` keeps the local production port at 4123. README startup steps now match this workflow.
- Both Prisma schemas validate. Typecheck, lint and production build pass. Standalone `npm test` reports 144 passed and 18 failed because database/Redis test environment variables are absent; Docker integration tests could not run because CLI access to Docker's named pipe is denied.
- The first production build failed with Windows `EPERM` while the app container was concurrently using the repository. After stopping that container, a production build completed successfully; shared `.next` contention is likely but not proven.
- The local Node process reports Next.js Ready and remains running. Health/home HTTP checks are not verified because local socket access from the execution sandbox is denied and Windows browser automation stopped on URL safety detection.
- Managed-host readiness is still blocked by MariaDB workflow/data rehearsal, Redis-backed security and queues, Python extraction, and durable media configuration. Do not deploy.

## Latest extraction progress (2026-11-11)

- The existing Python-only MRP/category hint parser was replaced as the primary URL extraction path with the deterministic engine supplied from `D:\extraction`. Its source is vendored under `python-extractor/engine`; only Python source was copied, not its SQLite database, source archives, diagnostics, tests or caches.
- A bounded loopback HTTP service returns the engine's canonical product schema. The existing admin API validates the retailer and final redirect domain, preserves the Amazon authorization gate, maps the canonical result to the existing TypeScript response, and continues merchant/category matching and image import in the application.
- No Fetch/preview UI files were edited. TypeScript typecheck and Python syntax parsing pass. Next.js remains running on 4123 and the Python API is running on 127.0.0.1:8765. Live retailer extraction has not yet been verified from the browser.
- Hostinger managed Node-only hosting cannot run this Python/browser service by itself; extraction must remain unavailable there until a supported Python/browser runtime is approved and secured.

## Completed or verified

- Added a read-only Deal Intelligence UI using persisted database records for deal candidates, publication authorization states, Agent 3 shadow candidates, source-health records, live deal counts, price observations and scraper jobs. Missing worker heartbeat, AI cost, Telegram delivery, and detailed Agent 2 stage timing are shown as unavailable. The page applies authenticated `operations:read` authorization and does not expose Agent 3 publishing actions.
- Added admin navigation to the intelligence page and query-driven links to existing approval, published, price history, and connector tabs.
- After these UI changes, `npm run typecheck` and focused ESLint passed. Existing browser session reconfirmed the local homepage and detail modal; the protected admin page has not been visually verified.

- Preserved the existing branch `copilot/overnight-roadmap-2026-11-02`; no staging, commit, push, deployment, database reset, or persistent-database migration.
- Compose-managed development service `metadeals4u-app-1` is healthy on `127.0.0.1:4123`; readiness returns 200 with PostgreSQL and Redis up. Compose Watch is active for source sync. The earlier standalone `metadeals4u-app-dev` container is stopped and retained as a rollback artifact; no data service was stopped or recreated.
- Fixed dev-container startup: `/app/.next` is now writable by the non-root `node` user.
- Verified login origin guard accepts same-origin requests: malformed body returned 400 validation instead of the prior origin rejection.
- Verified a published local product image returns 200 `image/webp`; source image file exists and the Compose dev service mounts `.local/media` read-only.
- Verified `/go/[dealId]` returns a 302 using a prefetch request (no affiliate click should be recorded by this path).
- PostgreSQL and MariaDB Prisma clients generated; both schemas validate.
- PostgreSQL additive migration set applied successfully to the disposable Docker test database only.
- Docker test suite: 144 passed, 0 failed, 0 skipped; includes guest comments integration and M12.1 security coverage against disposable PostgreSQL/Redis.
- TypeScript `tsc --noEmit` passed.
- Full ESLint passed with `--max-warnings=0`.
- Production Docker runner image built successfully with optimized Next.js compilation and static generation.
- MariaDB additive migrations applied to disposable MariaDB; Prisma migration diff reported no schema difference. No persistent database was migrated.
- Compose app command no longer runs `db:deploy` on normal development startup; disposable test profile still migrates only its own database.
- Runtime check: Node 24.14.1, npm 11.11.0, Next 16.4.3, Prisma 7.10.1. Container health checks pass; app has no CPU/memory cap.
- Read-only latency profiling found warmed data services around 4–55 ms; homepage HTTP took 105–238 ms in an eight-request sample. Cold route compilation appears in dev logs.
- Removed a confirmed sequential data-fetch waterfall from the admin account overview: account and audit endpoints now load concurrently while preserving partial account results if the audit request fails. Focused ESLint and full TypeScript checks passed after this change; end-to-end authenticated timing still needs browser verification.
- The final production image build completed before the account-overview adjustment; rebuild after Docker CLI access is restored.
- GitHub inspection confirmed the current local branch is not published; remote default `main` has no CI workflow and remains the older M0 project state. No push/deploy was made.
- Local CI workflow was tightened to require a moderate-level dependency audit, strict lint, and matching MariaDB validation credentials; YAML parsing passes. Audit/Actions execution remains unverified.
- Fixed the moderate `minimatch` advisory with a narrowly scoped override (`@typescript-eslint/typescript-estree` only) to patched `minimatch@11.0.1`; no forced downgrade or major dependency upgrade. Docker npm installation reported zero vulnerabilities, including the production runner dependency install.
- Production runner image build re-ran to completion in Docker (`metadeals4u:stabilization-check`); optimized Next.js build, TypeScript, static generation, and image export all completed successfully.
- Docker CLI calls intermittently return permission denied for the Docker Desktop named pipe, while the already-running Compose Watch process remains live and its health-check logs continue returning 200. Recheck before any container operation; do not restart services based on this transient observation.
- Comment UI/API and additive PostgreSQL/MariaDB migration exist; migration has not been applied to the persistent local DB.
- Google Cloud deployment comparison: trial credit is valid for 90 days; no provider provisioning authorized.

## Outstanding high-priority items

1. Test public catalog/search/category/detail and actual admin workflows on port 4123; collect controlled cold/warm timings and fix demonstrated bottlenecks.
2. Verify authentication, authorization, affiliate click attribution, and retailer redirect end-to-end without production services.
3. Keep public comments blocked on persistent local DB until separate migration approval; disposable integration coverage passes.
4. Implement real worker/scheduler handlers and a separate runtime only after safe job semantics are confirmed. Existing consumers return placeholder results and the scheduler uses sample identifiers; do not report operational health.
5. Publish the reviewed branch only after the owner authorizes pushing; then verify remote GitHub Actions and branch protections. The local workflow is not remote CI; no CD deployment is authorized.
6. Recheck Docker Desktop CLI access, then verify authenticated admin routes/production-mode latency. Confirm GitHub Actions' audit step remotely after the branch is published.
7. Build the Deal Intelligence dashboard only after security/runtime gates and actual telemetry sources are confirmed.
8. Full user/profile/community submission, notification, legal draft, affiliate analytics, and native mobile API work remain in the consolidated plan.
9. Remaining requested UI workflows need authenticated browser verification. Current Docker CLI cannot access the Docker Desktop named pipe, and persistent local migrations remain prohibited; gallery/comment end-to-end checks must wait for disposable test DB/container access.

## Current boundaries

- Do not access Hostinger or provision Google Cloud.
- Google Cloud's $300 Free Trial credit lasts 90 days, not 3–6 months; its always-free offerings do not provide the complete existing PostgreSQL/Redis/worker stack as an always-on free deployment.
- Do not write to persistent local databases or any hosted DB.
- Do not expose `.env` values in logs/reports.
- Preserve all existing user changes and untracked files.

## User task ledger

See [USER_TASK_TRACKER.md](USER_TASK_TRACKER.md) for a consolidated table of every request and its current status. Latest verified local work: extraction preview reduced to two columns; merchant choices load all Merchant Websites pages; publishing maps selected merchant; public and mobile deal payloads carry exact-domain directory logos to deal cards. Current static checks pass. Browser/disposable-DB validation remains open.


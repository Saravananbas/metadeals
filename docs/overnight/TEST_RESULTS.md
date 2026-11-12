# Test and Validation Results

Last updated: 2026-11-11

## 2026-11-11 deterministic Python extraction integration

| Check | Result | Evidence / limits |
|---|---|---|
| TypeScript | PASS | `npx tsc --noEmit` completed successfully after the Python-engine bridge changes. |
| Focused ESLint | PASS | Changed extraction service and bridge passed `npx eslint ... --max-warnings=0`. |
| Python syntax | PASS | Python AST parsed all 24 source files under `python-extractor`; this does not validate live retailer extraction. |
| Python API startup | PASS (process startup only) | Process remains running from `python python-extractor\\app.py`, bound to loopback port 8765. HTTP health and retailer calls were not verified. |
| Existing Fetch/preview UI | UNCHANGED | No changes were made to `DealManager.tsx` or its CSS by this integration. |
| Live extraction/browser workflow | NOT VERIFIED | Owner should test a known URL on localhost:4123; no retailer URL was fetched in this session. |
| Hostinger managed Node runtime | NOT READY | This deployment target does not provide the Python/Playwright service automatically. Do not enable extraction in deployment until a secured supported runtime is available. |

## 2026-11-11 direct Node runtime and managed-host preparation

| Check | Result | Evidence / limits |
|---|---|---|
| PostgreSQL Prisma schema | PASS | `npm run db:validate` with disposable placeholder URL; schema parses and validates. No database connection or migration was performed. |
| MariaDB Prisma schema | PASS | `npm run db:validate` with disposable placeholder URL and `DATABASE_PROVIDER=mysql`; schema parses and validates. No database connection or migration was performed. |
| TypeScript | PASS | `npm run typecheck` completed successfully. |
| ESLint | PASS | `npm run lint` completed with `--max-warnings=0`. |
| Existing Node test suite outside Docker | PARTIAL / FAIL | 144 passed and 18 failed; failures are in database/Redis-dependent agent, queue, ingestion and security tests because `DATABASE_URL`/`REDIS_URL` were not available to the standalone process. The Docker test path could not run because Docker CLI access is denied. |
| Direct Node development startup | PASS (process startup only) | `npm run dev` reports Next.js 16.4.3 Webpack ready at `http://localhost:4123`; process remained alive on the last poll. HTTP/browser response was not verified. |
| Next.js Turbopack on Windows | FAIL (workaround applied) | Turbopack exited with access denied creating a junction under `.next/dev/node_modules/pino`. Next.js installed CLI guide documents `--webpack`; `dev` and `dev:host` now use it. Do not change Windows security settings. |
| Optimized production build | PASS | `npm run build` completed, including static generation of 29 pages and route tracing, after stopping the app container. A previous attempt while the app container was active failed creating `.next/server/app/_global-error.segments/_global-error` with EPERM; contention is suspected, not proven. |
| Docker Desktop state | PASS (UI observation) | Stopped only Compose `app-1`; PostgreSQL, Redis and `product-extractor-1` remained running. `app-dev` was already stopped. No container or volume was deleted. Docker CLI still fails on named-pipe access. |
| Readiness and homepage HTTP | NOT VERIFIED | `Invoke-WebRequest` from the execution sandbox was denied socket access; Computer Use ended because it could not safely determine Chrome's current URL. |
| Hostinger deployment | NOT DONE | No account, credentials, environment, repository remote, or hosted database was accessed. |

## Completed

| Check | Result | Evidence / limits |
|---|---|---|
| Docker app readiness | PASS | `GET /api/health/ready` returned 200; DB and Redis both up. |
| Admin same-origin guard | PASS (guard path) | Same-origin POST with invalid `{}` returned 400 field validation, not 403 origin rejection. Successful credential login was not attempted. |
| Homepage | PASS | `GET /` returned 200. |
| Product media | PASS | Public local media endpoint returned 200 `image/webp` (24,270 bytes). |
| Affiliate route | PASS (prefetch) | `/go/<published deal id>` returned 302 with `Purpose: prefetch`; attribution should be skipped. Did not follow retailer redirect. |
| Prisma PostgreSQL schema | PASS | `prisma validate` succeeded. |
| Prisma MariaDB schema | PASS | `prisma validate --schema prisma/schema.mariadb.prisma` succeeded. |
| Prisma clients | PASS | PostgreSQL and MariaDB clients generated. |
| PostgreSQL migrations | PASS (disposable only) | `npm run test:docker`; all 13 migrations applied to ephemeral PostgreSQL test service, including comments migration. |
| Docker unit/integration/security suite | PASS | 144 passed, 0 failed, 0 skipped; includes public guest-comments integration. |
| TypeScript | PASS | `node node_modules/typescript/bin/tsc --noEmit`, exit code 0. |
| Full ESLint | PASS | `npm run lint`, configured with `--max-warnings=0`. |
| Production Docker build | PASS | `docker build --target runner --build-arg DATABASE_PROVIDER=postgresql ...`; optimized Next.js build completed. |
| MariaDB disposable migrations | PASS | Five migrations applied in disposable MariaDB; Prisma migration diff reported no difference. |
| Local runtime readiness | PASS | Compose-managed `metadeals4u-app-1` returned 200; PostgreSQL and Redis checks were up. Compose Watch is active; app restart policy is `unless-stopped`. |
| Runtime versions | PASS | Host Node v24.14.1, npm 11.11.0, Next 16.4.3, Prisma 7.10.1. |
| Container resource configuration | PASS (local) | Existing app container healthy, no configured CPU/memory cap; Docker reported about 1.05 GiB of 7.66 GiB in use during measurements. PostgreSQL/Redis health checks pass. |
| Local CI workflow syntax | PASS (syntax only) | Parsed `.github/workflows/ci.yml` with the installed `js-yaml` module after updating audit, strict lint, and MariaDB validation credentials. GitHub Actions execution is not verified. |
| Dependency audit | PASS (local container install) | After a scoped override to patched `minimatch@11.0.1` for the vulnerable ESLint transitive dependency, Docker npm installation reported 0 vulnerabilities; production runner `npm ci --omit=dev` also reported 0. The original moderate advisory was `GHSA-g3hv-75wg-m249`. Remote Actions audit remains unverified. |
| Production image build | PASS (before final client change) | `docker build --target runner --build-arg DATABASE_PROVIDER=postgresql -t metadeals4u:stabilization-check .` completed with exit code 0, including optimized Next.js build, TypeScript, static generation, and final image export. It predates the subsequent admin overview parallel-fetch adjustment. |
| Admin overview parallel-fetch adjustment | PASS (static checks) | Focused ESLint and full `tsc --noEmit --incremental false` passed after changing the independent account and audit loads to run concurrently. Browser timing and authenticated workflow are still unverified. The Docker integration suite and production image build were not rerun after this small client-only change because direct Docker CLI access became unavailable. |
| Deal UI and intelligence dashboard static validation | PASS | `npm run typecheck` passed after adding the server-authorized, database-backed `/admin/intelligence` page and query-driven scraper tabs. Focused ESLint over AdminNav, intelligence page, scraper page/dashboard, DealManager, DealCard, DealGallery and DealCommentsDialog passed with zero warnings. This does not replace protected browser workflow or disposable DB migration checks. |
| Local browser UI availability | PASS (limited) | Local homepage and deal detail modal were reachable in the existing browser session. The admin intelligence page could not be visually checked without an authenticated admin browser session. |
| Current Docker CLI availability | BLOCKED | Latest Docker CLI call was denied access to Docker Desktop named pipe `npipe:////./pipe/dockerDesktopLinuxEngine`; no container operations were performed. |

## Failed then fixed

- First full Docker test run: 142 pass, 1 fail. `tests/design-tokens.test.ts` rejected literal colors in the comments dialog CSS. Replaced those literals with shared theme tokens. The full suite then passed 144/144, including comments integration.
- First local development-container start failed with `EACCES` creating `/app/.next/dev`. Fixed ownership/creation in the Docker dev stage; subsequent container is healthy.

## Not yet verified

- MariaDB migration application/parity on a disposable MariaDB service.
- Actual successful admin login, protected tab navigation, and authenticated API latency.
- Normal user end-to-end navigation, search, categories, details, comments against a migrated disposable database, and guest posting.
- Retailer redirect with real browser navigation (only prefetch 302 checked).
- Click attribution persistence on a real click.
- Physical process restart guarantees for replay protection, kill switch, and authorization state beyond the existing test suite's Redis/database multi-instance/state-recovery tests.
- Remote GitHub Actions checks; local workflow file is untracked and has not been pushed.
- Remote GitHub Actions audit execution remains unverified; local Docker npm install and production dependency install reported zero vulnerabilities after the scoped patch.
- GitHub Actions/CD on the remote repository: NOT ESTABLISHED. The current local branch is not on GitHub; GitHub's default `main` lacks the local `.github/workflows/ci.yml` and still contains an older M0 README. No push was performed.
- CD/deployment; intentionally not established or authorized.
- Before/after application performance profiles; only status/log timings exist, not a controlled benchmark.
- Successful credential-based admin sign-in and authenticated admin-tab workflow remain unverified.
- Native Android/iOS client runtime; API/mobile compatibility remains a design and validation requirement.
- Visual verification of authenticated extraction, merchant directory/logo mapping, comments, gallery carousel, admin intelligence page, and deep-linked scraper tabs.

## Migration boundary

No migration was applied to persistent local PostgreSQL or any hosted database. The comment route expects the additive `DealComment` table; local comment read/write is therefore pending explicit migration approval.

## Worker safety finding

`BackgroundWorkerManager` consumer handlers currently return placeholder success objects, and `TaskScheduler` schedules hardcoded sample source/deal identifiers and a sample competitor URL. No worker/scheduler service is running. Treat background processing and its health metrics as NOT READY; do not expose them as operationally healthy or enable scheduled publication.

## Local development latency sample (read-only)

Measured from inside the existing `metadeals4u-app-dev` container on 2026-11-09; these are local development observations, not production or browser measurements:

- Homepage HTTP: 8 requests returned 200 in 105–238 ms after prior warm-up; each HTML response was 137,886 bytes.
- Homepage data service: first call 252 ms; subsequent calls 7–55 ms for 12 deals.
- Merchant directory service: first call 238 ms; subsequent calls 4–15 ms for 25 of 184 rows.
- Protected admin page requests without a session redirected in 122–465 ms. This does not measure the authenticated page/data path.
- Admin merchant API without a session returned 401 in 10–16 ms warm (109 ms first request including Next compilation); this does not measure the authenticated query path.
- Development logs showed `/admin/cuelinks` being compiled on first access. The observed few-second cold compilation behavior is a development-mode cost, not proof of production latency.

Conclusion: sampled database reads are not the main warm-path bottleneck. Do not claim the authenticated admin performance issue is resolved; it still needs a credentialed browser workflow and production-mode profile. The heavily user-modified catch-all admin route was left untouched during this measurement pass.

## Latest deal UI and dashboard validation (2026-11-09)

- Targeted 
pm run typecheck: PASS after the directory-backed merchant UI and public/mobile merchant-logo payload changes.
- Focused ESLint over DealManager, deal repository, web/mobile/detail API routes, presentation/types, Homepage and DealCard with --max-warnings=0: PASS.
- Browser visual/interactive validation of the protected admin dashboard and extraction/edit screens: NOT VERIFIED because no authenticated admin browser session was available.
- Directory mapping/logo enrichment and carousel/gallery interaction: NOT VERIFIED end to end; Docker Desktop CLI is currently inaccessible and no persistent DB migrations were applied.
- Multi-image model/import/API/UI implementation is present in source. Migration validation is restricted to disposable PostgreSQL/MariaDB databases.


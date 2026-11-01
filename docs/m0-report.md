# M0 delivery report

Validated on 1 November 2026 (Asia/Calcutta). Scope: new application foundation only.
M1 homepage implementation requires the owner's next approval.

## Technology versions

| Technology | Version / configuration |
| --- | --- |
| Node / npm used | 24.14.1 / 11.11.0 |
| Next.js / React | 16.4.3 App Router / 19.3.1 |
| TypeScript | 5.9.3, strict |
| Tailwind / PostCSS | 4.3.3 / 8.5.32 |
| shadcn/ui | Local source + new-york components.json; Radix Slot 1.5.0, CVA 0.7.1 |
| ESLint / Next config | 9.39.5 / 16.4.3 |
| Prisma / PostgreSQL adapter | 7.10.1 / 7.10.1 |
| PostgreSQL | 17.11, Docker image pinned by digest |
| Auth.js | Stable next-auth 4.24.15, Prisma adapter 1.0.7 |
| Redis / ioredis / BullMQ | 7.4.12 / 6.0.0 / 6.5.3 |
| AWS S3 SDK | @aws-sdk/client-s3 3.1161.0 |
| Validation / logging | Zod 4.6.7 / Pino 10.4.0 |

Exact dependency graph is committed in package-lock.json. shadcn/ui is source-owned
component code, not a versioned runtime UI package.

## Database configuration

Local PostgreSQL: `127.0.0.1:55432`, database/user `metadeals`, random password in ignored
`.env`. Local Redis: `127.0.0.1:6380`, authenticated, persistent, noeviction. Port 5433
was already occupied, so only this project's configuration was changed to 55432.
No existing service or data was removed.

Migration `20261101180931_init_identity` creates User, Account, Session and
VerificationToken with indexes and foreign keys. Applied successfully; schema is
up to date. No seed data or business module tables exist. PostgreSQL and Redis
remain running locally; `npm run infra:stop` stops them without deleting volumes.

## Files created

All project files are new. No previous website source was read or reused.

```text
.env.example                         credential-free configuration template
.gitignore, .npmrc, .nvmrc            repository/package/runtime conventions
README.md                            setup and operational instructions
package.json, package-lock.json      exact dependencies and scripts
tsconfig.json                        strict TypeScript + @/* alias
eslint.config.mjs                    Next/TypeScript lint rules
postcss.config.mjs                   Tailwind PostCSS integration
next.config.ts                       security headers and server configuration
components.json                      shadcn configuration
compose.yaml                         digest-pinned local PostgreSQL and Redis
prisma.config.ts                     Prisma CLI configuration
prisma/schema.prisma                 identity persistence foundation
prisma/migrations/migration_lock.toml
prisma/migrations/20261101180931_init_identity/migration.sql
scripts/setup-env.mjs                 non-overwriting local secret setup
scripts/smoke.mjs                     production HTTP integration checks
src/app/layout.tsx                   root layout and noindex metadata
src/app/page.tsx                     explicit M0 placeholder, not final homepage
src/app/globals.css                  Tailwind and brand tokens
src/app/error.tsx                    route error boundary
src/app/global-error.tsx             root error boundary
src/app/not-found.tsx                accessible 404 response
src/app/api/health/route.ts           uncached liveness
src/app/api/health/ready/route.ts     dependency readiness and correlation IDs
src/components/ui/button.tsx         reusable shadcn-style button
src/config/env-schema.ts             independently testable environment schemas
src/config/env.ts                    server-only validated accessors
src/features/health/service.ts       dependency-injected service
src/lib/utils.ts                     safe shared class-name helper
src/server/auth/options.ts           disabled-until-configured Auth.js options
src/server/db/client.ts              pooled Prisma singleton
src/server/logging/logger.ts         structured redacted logger
src/server/queue/connection.ts        producer/worker connection configuration
src/server/redis/client.ts           bounded readiness probe client
src/server/storage/client.ts         lazy S3-compatible client
src/instrumentation.ts               sanitized server error logging
tests/env.test.ts                    configuration validation tests
tests/health.test.ts                 readiness success/failure tests
docs/architecture.md                 layering, boundaries and future module design
docs/design-reference.md             approved M1 visual requirements
docs/reference/homepage-approved.png original user-supplied reference
docs/m0-report.md                    this report
```

Generated, ignored local files: `.env`, `next-env.d.ts`, `src/generated/prisma/`,
`.next/`, `node_modules/`, TypeScript incremental cache. `.env` was confirmed ignored.

## Commands executed

- Environment checks: Node/npm/Git/Docker versions, Git author configuration,
  workspace/AGENTS inspection, npm package metadata and peer dependency checks.
- `npx --yes create-next-app@16.4.3 . ...`: generator rejected uppercase folder name;
  no project was generated. Standard App Router files were then initialized directly
  in the required directory with lowercase package name `metadeals4u`.
- `npm install` for exact-pinned runtime packages and `npm install -D` for tooling
  (full resolved versions are in package.json/lockfile).
- `npm run env:setup`.
- `npm run infra:up`; after the occupied-port correction, `docker compose up -d --wait`.
- `npm run db:generate`.
- `npm run db:migrate -- --name init_identity`.
- `npm run db:validate` and `npm run db:status`.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `npm run test:smoke`.
- `npm audit --json`, `npm audit --omit=dev`.
- Docker version/digest checks; `git init -b main`, staging/secret-exclusion checks
  and initial commit.

## Final verification

| Check | Result |
| --- | --- |
| ESLint, zero warnings permitted | PASS |
| Strict TypeScript + Next route types | PASS |
| Unit tests | PASS, 8/8 |
| Prisma schema validation | PASS |
| Initial migration | PASS, applied to local PostgreSQL |
| Migration status | PASS, up to date |
| Optimized production build | PASS |
| Production HTTP smoke checks | PASS |
| Runtime dependency audit | PASS, zero vulnerabilities |
| Full dependency audit | 16 moderate development-tool findings remain |

The first lint/type-check run exposed an anonymous PostCSS export warning, an
unknown error type guard and an overly narrow environment-test input type. These
were corrected before the final passing run.

HTTP smoke checks cover the root response, security headers, uncached liveness,
real database/Redis readiness, 404 behavior, absence of an auth endpoint, and
sanitized 503 responses for unreachable dependencies while liveness remains 200.
Temporary test servers were stopped automatically.

## Limitations and next milestone

- Full audit reports 16 moderate findings propagated through development lint
  dependencies from minimatch advisory GHSA-g3hv-75wg-m249. No production dependency
  findings. npm's suggested old major downgrades were not applied; a cross-major
  minimatch override would change plugin APIs and has not been asserted safe.
- ESLint 9 is deprecated upstream, but the installed stable React lint plugin still
  declares peers only through ESLint 9. The compatible version is pinned; revisit
  when the stable plugin chain supports ESLint 10. No peer checks were bypassed.
- Auth.js configuration is prepared, but no login flow or authorization policy is
  active. The chosen stable v4 line is in maintenance mode; v5 remains beta in the
  consulted documentation. Reassess before the authentication milestone.
- S3 requires real credentials and a bucket; no live storage operation was tested.
- BullMQ connection configuration exists; no worker/job lifecycle is implemented or tested.
- No deployment was performed. Production TLS, rate limits, backups and operational
  policies remain deployment prerequisites documented in the architecture.
- The approved mockup is retained. Homepage UI and desktop/mobile visual comparison
  are deferred to M1, as required by the instruction to stop after M0.

For local development now: `cd D:\Metadeals` then `npm run dev`.
For a fresh checkout, follow the complete sequence in README.md.

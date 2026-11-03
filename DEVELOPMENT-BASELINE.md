# MetaDeals4U Development Baseline

**Inspected:** 2 November 2026  
**Repository:** `D:\Metadeals`  
**Starting commit:** `c500823` (`main`)  
**Execution branch:** `copilot/overnight-roadmap-2026-11-02`

## Repository and preserved work

This is the existing MetaDeals4U application, not an empty repository. It is a
Next.js App Router application with existing homepage functionality, infrastructure
configuration and one committed identity-schema migration. The branch was created
without changing the worktree.

Pre-existing M1.5 changes were present before this roadmap task and have been
preserved: edits to the visual acceptance and brand-color documentation, homepage
glass CSS and semantic color tokens, responsive measurements, and four new
responsive screenshots. These changes remain uncommitted; no prior work was reset
or cleaned. The prior continuation's temporary deletion of six tracked capture
files was reversed from their clean `HEAD` versions after recognizing that they
predated this task.

The Git history contains commits `c500823` and `de6c182`; the starting branch was
`main`. No new commit has been made.

## Runtime and project tooling

- Node.js `v24.14.1`; npm `11.11.0`.
- Package manager: npm, with `package-lock.json`; `npm ci` is the documented setup.
- Next.js `16.4.3`, React `19.3.1`, TypeScript `5.9.3`, Tailwind CSS `4.3.3`.
- Prisma `7.10.1`, PostgreSQL adapter `@prisma/adapter-pg`, PostgreSQL 17 in the
  local Compose configuration.
- Existing scripts: `lint`, `typecheck`, `test`, `test:smoke`, `build`,
  `db:generate`, `db:validate`, `db:migrate`, `db:deploy`, `db:status`,
  `infra:up`, `infra:stop`, and `env:setup`.
- Tests live in `tests/`; current suites cover deals/filtering/pricing, design
  tokens, environment validation and health services.

## Architecture and integration state

- `src/app` contains the homepage and health routes; public deal data comes from
  `src/features/deals/service.ts`, which currently returns clearly disclosed demo
  data. Search, category/store filtering, featured/latest views and browser-local
  wishlists are implemented.
- `prisma/schema.prisma` contains only Auth.js identity tables: `User`, `Account`,
  `Session`, and `VerificationToken`. One migration,
  `20261101180931_init_identity`, is committed; no deal, role, affiliate, click,
  publishing or analytics models exist.
- `next-auth@4.24.15` and the Prisma adapter are configured for database sessions,
  but `getAuthOptions()` has no providers and no Auth.js route or sign-in UI is
  exposed. The `User` model has no role or initial-admin policy.
- Redis and BullMQ dependencies plus connection configuration exist, but no
  application queues or workers are implemented.
- An S3-compatible client and environment schema exist; no upload workflow exists.
- No admin routes, deal-management routes, affiliate routes, publishing routes,
  analytics endpoints or versioned mobile API exist.
- `.env.example` documents PostgreSQL, Redis, NextAuth, logging and S3 variable
  names. `.env` is ignored; its values were not inspected.
- No live external provider credentials, production deployment, affiliate calls or
  message publishing were performed during baseline inspection.

## Baseline checks and local dependencies

- `npm run db:validate`: PASS; Prisma schema is valid.
- `npm run db:status`: PASS; the one committed migration is applied to the local
  database. This was a read-only status check.
- Docker inspection: the project's local PostgreSQL and Redis containers reported
  healthy. Other unrelated containers were present and were not touched.
- The previous M1.5 acceptance report recorded lint, TypeScript, 18 tests,
  production build, smoke checks and responsive browser validation as passing
  before this continuation. They are re-run for M1.5 before its new completion
  report; these prior results are not treated as fresh module validation.

## Initial risk assessment

1. **Authentication is a security-critical prerequisite.** There is no configured
   identity provider or approved initial-admin provisioning policy. Do not invent
   credentials, enable an insecure development login or grant an implicit admin
   role. M2.5 must be blocked if that decision remains unavailable; deal-management
   and subsequent dependent modules must not bypass that boundary.
2. The uncommitted homepage refinement uses the earlier pink/lavender glass
   treatment. The checked-in `prompts/image-1.png` and complete M1.5 prompt specify
   a cooler, light-blue visual direction; reconcile the in-scope M1.5 styling
   against that reference without overwriting unrelated user work.
3. Keep all external integrations mocked. Do not deploy, index, message, purchase,
   or run destructive database commands.

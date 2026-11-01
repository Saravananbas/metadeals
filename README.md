# MetaDeals4U

M0 foundation for a new Indian deals discovery and affiliate marketing application.
This repository is independent of the existing website. No old source or production
data has been imported. The root page is an explicitly temporary foundation screen;
the approved homepage is **M1**, not implemented in this milestone.

## Requirements

- Node.js 24 LTS (24.14.1 used for validation), npm 11.
- Docker Desktop running Linux containers, or your own PostgreSQL and Redis services.
- Available localhost ports 3000 (app), 55432 (PostgreSQL), 6380 (Redis).

## Run locally (PowerShell)

```powershell
cd D:\Metadeals
npm ci
npm run env:setup
npm run infra:up
npm run db:deploy
npm run db:generate
npm run dev
```

Open http://localhost:3000. `env:setup` creates an ignored `.env` with random local
database/Redis passwords and an auth secret; it never overwrites an existing file.
These are local development secrets, not external API credentials. S3 fields remain
empty until actual provider credentials are supplied. Do not commit `.env`.

If using existing infrastructure, edit `.env` and skip `infra:up`. Keep passwords
URL-encoded in connection strings. Changing local Docker passwords after initial
database creation does not rotate the database account; manage rotation explicitly.
Do not delete volumes to resolve configuration problems without reviewing data loss.

## Checks and production build

```powershell
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run db:status
npm run build
npm run start
```

With local PostgreSQL and Redis running, `npm run test:smoke` starts temporary
production servers on ports 3105/3106, checks real HTTP health behavior and dependency
failure handling, then stops both test servers. Run it after `npm run build`.

Generation and static compilation do not require live database, Redis, auth or S3
credentials. Runtime dependency access validates its own configuration and fails
closed. `db:deploy` requires a valid database connection.

## Health APIs

- `GET /api/health`: liveness, 200 while the application can respond.
- `GET /api/health/ready`: live PostgreSQL `SELECT 1` and Redis `PING`; 200 only
  when both respond, otherwise 503. Returns generic status, no error details or secrets.
- Both endpoints disable caching. Readiness returns a correlation ID.
- S3, auth and future workers are not readiness dependencies in M0 because they
  are not enabled. Readiness verifies connectivity, not migration state; run
  `npm run db:status` separately before rollout.

## Database and migrations

Prisma uses PostgreSQL via `@prisma/adapter-pg`. The initial migration creates only
Auth.js identity tables: `User`, `Account`, `Session`, `VerificationToken`.
There are no seeded users, deals, stores or affiliate records.

```powershell
# Development only: after an intentional schema change
npm run db:migrate -- --name describe_change
# Deploy reviewed, committed migrations in staging/production
npm run db:deploy
```

Never run `migrate reset` or `db push` against production. Use a separate migration
credential with DDL permissions and a restricted runtime role in production.
The Docker database owner is for local development only.

## Infrastructure boundaries

- **Auth.js:** stable `next-auth` v4 is configured with the Prisma adapter and
  database sessions. No provider, sign-in UI or auth route is enabled. A real
  identity provider, authorization policy and HTTPS URL are prerequisites for activation.
- **Redis/BullMQ:** connection configuration only; no jobs, queues or workers are
  started. Future workers run in a separate process, not in a Next.js request.
- **S3:** lazy server-only client; no uploads, public bucket or synthetic credentials.
- **UI:** Tailwind v4, shadcn-compatible local Button and `components.json`.
  Use the shadcn CLI later to add components as needed, not an entire component library.

## Layout

```text
src/
  app/                   App Router pages, boundaries and HTTP routes
  components/ui/         Reusable shadcn-style UI primitives
  config/                Environment schemas and server-only accessors
  features/health/       Dependency-injected health service
  lib/                   Browser-safe shared helpers
  server/
    auth/                Auth.js options (not yet exposed)
    db/                  Prisma singleton and PostgreSQL adapter
    logging/             Structured, redacted logging
    queue/               BullMQ connection configuration
    redis/               Bounded readiness connection
    storage/             S3-compatible client
  generated/prisma/      Generated client, ignored by Git
  instrumentation.ts     Sanitized server error reporting
prisma/                  Schema and committed migrations
scripts/                 Non-destructive local environment setup
tests/                   Environment and health service tests
docs/                    Architecture, M0 validation, approved design reference
```

See [architecture](docs/architecture.md), [design reference](docs/design-reference.md)
and [M0 validation report](docs/m0-report.md).

## Operational notes

`npm run infra:stop` stops only this project's local services and retains volumes.
The local Compose project uses localhost-only ports and authenticated Redis with
`noeviction`, appropriate for future BullMQ use. Production needs managed TLS,
private networking, backups/restore drills, secret rotation, monitoring, rate limits
and resource sizing. M0 is a foundation, not a claim of production deployment readiness.

Logs are JSON on stdout. Do not log raw errors, credentials, session tokens,
request bodies or query strings. Health failures and Next.js unhandled request
errors use safe structured metadata. Public error pages never display raw errors.

Security headers include clickjacking protection, nosniff, referrer and permissions
policies, and a baseline CSP. A nonce-based script CSP and HTTPS/HSTS policy must
be designed with the final hosting environment before launch. The app is noindex
until an approved public release. No remote image hosts are allowed yet; whitelist
the actual image-storage domain in M1 instead of using a wildcard.

# MetaDeals4U

MetaDeals4U is an existing Next.js 16 App Router application using React,
TypeScript, Prisma, PostgreSQL/MariaDB, Redis/BullMQ, deal extraction, affiliate
tracking, and admin tooling. The repository is under active stabilization; do not
assume every integration or background worker is production-ready. See
`docs/overnight/DEVELOPMENT_PLAN.md` for current scope and gates.

## Requirements

- Node.js 24 LTS (24.14.1 used for validation), npm 11.
- A local MariaDB/MySQL or PostgreSQL server (no Docker). Redis is optional.
- Available localhost port 4123 (app).

## Run locally (PowerShell)

```powershell
cd D:\Metadeals
npm ci
npm run env:setup
npm run db:deploy
npm run db:generate:all
npm run dev
```

`npm run dev` starts the in-repository Python extraction service on loopback,
waits for it to become healthy, then starts Next.js as a regular host process on
http://localhost:4123. Docker is not used. See `docs/STAGING-DEPLOY.md` for hosting.

The deterministic product extraction engine and its private API are included
under `python-extractor/`; the existing MetaDeals extraction UI consumes the
engine's canonical product output. Install the Python dependencies and browser
once before the first development run:

```powershell
python -m pip install -r python-extractor\requirements.txt
python -m playwright install chromium
```

The integrated development launcher binds the service to `127.0.0.1:8765` and
sets the private extractor endpoint for Next.js. The server validates product
URLs and maps canonical Python results into the existing extraction response.
The current Fetch UI is unchanged. A managed Node-only deployment still needs a
supported way to run this Python engine; do not enable extraction there until
that runtime and its browser dependencies are available.

Open http://localhost:4123. `env:setup` creates an ignored `.env` with random local
database/Redis passwords and independent auth secrets. If `.env` already exists,
it preserves existing secrets and custom settings, appends missing M2.5 auth
settings, and updates old default localhost app URLs to port 4123. Run it
again after updating the project if an older `.env` is missing auth settings.
These are local development secrets, not external API credentials. S3 fields
remain empty until actual provider credentials are supplied. Do not commit
`.env`.

If using existing infrastructure, edit `.env`. Keep passwords
URL-encoded in connection strings.
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

`npm run start` honors the hosting platform's `PORT` environment variable (and
defaults to port 3000). Use `npm run start:local` to run a production build on
localhost:4123.

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
- S3 and future workers are not readiness dependencies. Auth relies on PostgreSQL;
  readiness verifies connectivity, not migration state. Run `npm run db:status`
  separately before rollout.

## Database and migrations

Prisma uses PostgreSQL via `@prisma/adapter-pg`. The initial migration creates the
identity tables; the additive M2.5 migration adds credential/role/MFA fields and
session, setup-token, rate-limit, recovery-code, bootstrap and audit tables. The
local migration is applied. No user account, deal, store or affiliate record is
seeded.

```powershell
# Development only: after an intentional schema change
npm run db:migrate -- --name describe_change
# Deploy reviewed, committed migrations in staging/production
npm run db:deploy
```

Never run `migrate reset` or `db push` against production. Use a separate migration
credential with DDL permissions and a restricted runtime role in production.
The Docker database owner is for local development only.

## M2.5 authentication and administration

The admin portal is at `/admin/login`. It uses Argon2id passwords, mandatory
TOTP, one-time recovery codes, HMAC-hashed opaque database sessions, server-side
role checks and transactional audit events. Sessions expire after 60 minutes
idle or 12 hours absolutely. No admin account was created during development.

The first SUPER_ADMIN is provisioned only when the owner is ready. Ensure the
local auth settings exist (`npm run env:setup`), ensure the migration is applied,
then temporarily enable bootstrap in PowerShell and run the CLI:

```powershell
$env:AUTH_BOOTSTRAP_ENABLED = "true"
npm run auth:bootstrap
Remove-Item Env:AUTH_BOOTSTRAP_ENABLED
```

Type the approved email exactly when prompted. The CLI prints a one-time
30-minute setup link; deliver it privately, complete MFA enrollment, save the
recovery codes and leave `AUTH_BOOTSTRAP_ENABLED=false` in `.env`. Bootstrap is
disabled by default and rejected in production. PowerShell uses `$env:NAME = "value"` syntax; `NAME=value` is not valid PowerShell.

Once set up, you can sign in repeatedly with the same account. Each authenticator
time-step code is single-use for replay protection; use the current code and wait
for the next 30-second code before another test login. Do not disable or bypass
authentication for browser testing. The integration test exercises the auth
lifecycle using temporary local database records without requiring a test bypass
or creating a permanent account.

No email transport is configured. An authorized local operator can issue a
reset link for an active account with a verified email:

```powershell
npm run auth:reset-link -- user@example.com
```

Confirm the private delivery channel, deliver the one-time link privately, and
do not place it in logs or shared channels. The password-reset page directs users
to a Super Admin instead of claiming to send an email. Admin account creation
requires an explicit verified-email attestation and displays the setup URL for
secure delivery. Existing `.env` values are preserved by `env:setup`; only
missing M2.5 settings are appended.

Run the local auth lifecycle integration test only against the project database
on port 55432; it creates and removes uniquely named test records:

```powershell
$env:AUTH_INTEGRATION_TESTS = "1"
npm run test:auth:integration
Remove-Item Env:AUTH_INTEGRATION_TESTS
```

The existing NextAuth options file is dormant. Its provider-less scaffolding is
not mounted as an auth route and is not the active credential/session path.

## Infrastructure boundaries

- **Auth:** M2.5 uses local credentials and custom opaque database sessions to
  meet the database-only session policy. No automated email delivery, OAuth,
  mobile token API or customer sign-in is enabled.
- **Redis/BullMQ:** the app uses Redis for readiness, comment throttling, shared
  security state, and queue infrastructure. Worker code exists, but several
  handlers and scheduler inputs are placeholders; do not treat the workers as
  production-ready or enable automated publishing.
- **Managed Node.js hosting:** the web process can run without a Docker container,
  but this application is not deployment-ready on a host without Redis and a
  supported database. MariaDB schema/migrations are present and validate locally;
  migration parity, data migration, runtime workflows, external media storage,
  and worker/security behavior still need a controlled rehearsal. No hosted
  environment has been changed by this project setup.
- **Python extraction:** an optional Python sidecar is used only when the app can
  reach the configured internal extractor. A managed Node-only host cannot run
  that sidecar; extraction must be verified without it or the feature must remain
  disabled there.
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
    auth/                Credential/MFA/session services and dormant NextAuth options
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

See [architecture](docs/architecture.md), [design reference](docs/design-reference.md),
[M0 validation report](docs/m0-report.md), and [M1 homepage report](docs/m1-report.md).

For the acceptance pass, see [M1 visual assessment and screenshots](docs/m1-visual-acceptance.md),
[official color integration](docs/brand-color-integration.md), and
[multi-platform architecture impact](docs/multiplatform-impact.md). The supplied
Brand Color System v1.0 is the sole UI color source, with matching Tailwind aliases
and dark tokens retained but not enabled. Native apps and monorepo migration remain
future, separately approved work.

## M1 homepage

The homepage includes the reference header, purple hero, search, trending chips,
horizontal categories, six-column desktop deal grid, three promotional banners,
benefits strip and footer. Search/category/store filters, featured/latest views,
demo deal previews and browser-local saved deals work without authentication.
Desktop/tablet/mobile checks are recorded in the M1 report.

`src/features/deals/service.ts` is the server-side source boundary. It currently
uses `demo-data.ts` and does not read or write business data in PostgreSQL. Sample
prices, reviews, product imagery and promotions are explicitly unverified. Retailer
links open searches/listings after disclosure, not guaranteed live offers. Saved
deals use local storage only; customer sign-in, live bank offers and alerts remain
disabled.
No new dependency, schema migration, worker or external API was added for M1.

## Operational notes

Production needs managed TLS,
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

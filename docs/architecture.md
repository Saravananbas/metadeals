# Architecture — MetaDeals4U

## Decision and scope

This is the existing application in `D:\Metadeals`; do not recreate or replace it.
M0 established runtime, infrastructure boundaries, configuration, the identity
migration, operability and validation. M1/M1.5 implemented the approved responsive
homepage using disclosed demo data. The current audited state and recovery
dependencies are recorded in `reports/REPOSITORY-AUDIT-AND-RECOVERY-PLAN.md`.

## Runtime and version policy

Next.js App Router on the Node.js runtime, React Server Components by default,
TypeScript strict mode, Tailwind v4 and local shadcn UI source. Dependencies are
exact-pinned in package.json, and package-lock.json is committed for `npm ci`.
The standard local development and production start commands use port 4123.
Use Node 24 LTS. Stable Prisma 7 is pinned rather than the npm latest release
candidate. NextAuth.js 4.24.15 declares Next 16/React 19 peer compatibility; the
provider-less NextAuth options scaffold remains unmounted. M2.5 uses a separate
local credential flow because its database-only session policy is not compatible
with NextAuth v4 Credentials sessions.

Sources consulted:
- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://next-auth.js.org/configuration/initialization
- https://authjs.dev/getting-started/integrations
- https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- https://ui.shadcn.com/docs/installation/manual

## Dependency direction

```text
App Router / API handlers
       |            |
       v            v
UI components   Feature services (business rules and interfaces)
                    |
                    v
             Server infrastructure adapters
             Prisma / Redis / S3 / external APIs
```

UI imports browser-safe helpers, never database or secret configuration. Server
adapters import `server-only`, causing client-boundary violations to fail at build.
Feature services accept dependencies and can be tested without external accounts.
Routes handle request/response semantics; services own use cases; repositories
will own feature-specific queries when those features are implemented.

Avoid a generic repository framework. Add a feature folder only when there is real
functionality; use `components`, `service.ts`, `schema.ts`, `repository.ts`, and
tests as needed. Shared code moves into shared folders only when actually reused.

## Persistence

PostgreSQL is the source of truth. Prisma schema, generated client and reviewed
SQL migrations define the contract. Prisma CLI reads `.env`; application adapters
read validated environment groups on first use. The pool is reused per process,
limited to 10 connections, with bounded connect/query timeouts. Scale pool sizes
against database capacity before increasing application replicas.

The initial identity tables remain unchanged. The additive M2.5 migration adds
credential/role/MFA fields and `AuthSession`, `RecoveryCode`, `AuthToken`,
`AuthRateLimit`, `BootstrapState` and `AuditEvent`. Auth sessions and recovery
records cascade with their user; token creator/audit actor references use
set-null semantics. The local migration is applied; no account was seeded.

## Infrastructure

- Redis: authenticated, local persistence enabled, noeviction policy. API probes
  use bounded retries and disconnect afterwards.
- BullMQ: separate producer/worker connection options. Workers must tolerate
  reconnects; HTTP producers must fail promptly. Future jobs need idempotency,
  retry/backoff, deduplication, dead-letter monitoring and graceful shutdown.
- S3: server-side SDK factory, validated credentials, explicit endpoint/region/bucket
  and path-style support. Future uploads require authorization, size/type validation,
  signed URLs and a private bucket policy. No public upload endpoint exists.
- Auth: local email/password with Argon2id, mandatory TOTP, one-time recovery
  codes, hashed opaque database sessions and server-side role checks. The
  initial SUPER_ADMIN is provisioned only through the disabled-by-default local
  CLI workflow. No email transport, OAuth, customer sign-in or mobile token API
  is enabled. The existing NextAuth options remain dormant.

## Future module boundaries (design only)

| Module | Planned responsibility |
| --- | --- |
| Deals | Catalog, categories/stores, price/expiry validation, publication state |
| Affiliates | Network adapters and server-side link generation with allowed destinations |
| Tracking | Redirect validation, click events, privacy and abuse controls |
| Publishing | BullMQ orchestration, idempotency and delivery status |
| Telegram / WhatsApp | Provider-specific adapters and verified webhooks |
| Analytics | Aggregated clicks/conversions and commission reconciliation |
| Admin | Authorized management UI and auditable mutations |

These modules have no implementation, API, fake credentials or placeholder data.
Their schemas will be approved with their respective milestones.

## Reliability and security

Liveness is independent of dependencies; readiness probes PostgreSQL and Redis.
Readiness failures return 503 with no raw errors. Next instrumentation logs safe
route templates and error digests; API readiness logs request IDs and generic
dependency states. Never serialize provider response bodies or secrets to logs.
Pino redaction is defense in depth, not permission to log arbitrary objects.

Public routes expose no business data or mutation capabilities. Default headers
restrict framing and browser capabilities. Environment secrets remain server-side,
and there are no NEXT_PUBLIC secrets. `.env` is ignored and excluded from commits.
Local setup uses exclusive creation, so existing configuration is never overwritten.
TLS, access controls, abuse controls, strict CSP, backups and observability must be
validated with production deployment; Compose is not a production hosting recipe.

## Verification strategy

Lint, strict type-check, production compilation and focused service/configuration
tests are required. M2.5 additionally validates the additive migration, exercises
the auth lifecycle against a local PostgreSQL database using temporary cleaned-up
records, and checks server-side permission policy. M1/M1.5 visual validation is
documented in the homepage acceptance report.

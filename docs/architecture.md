# Architecture — M0

## Decision and scope

New application in `D:\Metadeals`, created at the owner's explicit request.
M0 establishes runtime, infrastructure boundaries, configuration, migrations,
operability and validation. M1 requires separate approval. The attached homepage
is the visual source of truth for M1; this milestone does not implement its sections.

## Runtime and version policy

Next.js App Router on the Node.js runtime, React Server Components by default,
TypeScript strict mode, Tailwind v4 and local shadcn UI source. Dependencies are
exact-pinned in package.json, and package-lock.json is committed for `npm ci`.
Use Node 24 LTS. Stable Prisma 7 is pinned rather than the npm latest release
candidate. NextAuth.js 4.24.15 declares Next 16/React 19 peer compatibility; the
Auth.js v5 documentation still describes beta, so M0 does not adopt it.

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

M0 tables: User (unique nullable email), Account (unique provider/providerAccountId),
Session (unique session token), VerificationToken (unique token and identifier/token).
Accounts and sessions reference User and cascade on deletion. No registration,
identity provisioning, login endpoints, role assignment or administration exists yet.

## Infrastructure

- Redis: authenticated, local persistence enabled, noeviction policy. API probes
  use bounded retries and disconnect afterwards.
- BullMQ: separate producer/worker connection options. Workers must tolerate
  reconnects; HTTP producers must fail promptly. Future jobs need idempotency,
  retry/backoff, deduplication, dead-letter monitoring and graceful shutdown.
- S3: server-side SDK factory, validated credentials, explicit endpoint/region/bucket
  and path-style support. Future uploads require authorization, size/type validation,
  signed URLs and a private bucket policy. No public upload endpoint exists.
- Auth: stable NextAuth Prisma adapter with database sessions; providers intentionally
  empty and no route exported. Before activation, establish provider, roles and
  server-side permission checks. A signed-in user must not implicitly be an admin.

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
tests are required for M0. Exercise health routes against real local PostgreSQL and
Redis, verify migration status, and check failure responses. No homepage visual
comparison is claimed until M1 implements the approved design.

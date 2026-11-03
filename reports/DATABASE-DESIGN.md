# Database Design — Forensic Baseline and Safe Evolution

**Status:** M2.5 auth schema is implemented and applied locally; future business
schema remains conceptual and outside the current authorization.

## Verified current database

- Provider: PostgreSQL through Prisma 7 and `@prisma/adapter-pg`.
- Schema: `prisma/schema.prisma`.
- Migration history: `20261101180931_init_identity` and
  `20261102043311_m25_credentials_mfa_admin`.
- Checks on 2 November 2026:
  - `npm run db:validate`: schema valid.
  - `npm run db:status`: both local migrations applied.
  - `npm run db:deploy`: applied the additive auth migration to the configured
    local database; no destructive DDL or seed was performed.
- `.env` and database credentials were not read or printed.

## Existing models and relationships

| Model | Current purpose and constraints |
|---|---|
| `User` | Existing identity/profile plus role, status, Argon2id password hash, encrypted TOTP secret, TOTP enrollment and last accepted time step. Email remains unique and nullable for adapter compatibility. |
| `Account` | Provider account; unique `(provider, providerAccountId)`, indexed `userId`, cascades on user deletion. |
| `Session` | Dormant NextAuth session model, unique token and expiry, indexed `userId`, cascades on user deletion. |
| `VerificationToken` | Unique token and unique `(identifier, token)`. |
| `AuthSession` | HMAC-hashed opaque token, inactivity/absolute expiration and privacy-minimized request metadata; cascades with user. |
| `RecoveryCode` | HMAC-hashed one-time MFA recovery codes; cascades with user. |
| `AuthToken` | Hashed one-time setup/bootstrap/reset token; optional target/creator references; stores temporary encrypted enrollment data until setup completes. |
| `AuthRateLimit` | HMAC-derived subject bucket, failure count, lock expiry and update indexes. |
| `BootstrapState` | Single-use initial-admin provisioning completion state. |
| `AuditEvent` | Actor/action/target/outcome/request metadata and JSON details; actor is nulled on user deletion. |

There are no deal, product, merchant, category, media, affiliate, click, order,
commission, publication, destination, consent, notification, analytics-event or
wishlist tables. No user account was created.

## Safe evolution constraints

1. Preserve all existing identity records. Any future schema work must be
   additive and reviewed against actual database state before deployment.
2. Do not replace or rename the dormant NextAuth identity models/columns without
   a separately approved migration plan and tested data migration.
3. Generate and review SQL migrations; use `prisma migrate deploy` only against
   an intended environment after backup/restore and rollback planning. Never use
   reset/drop or production `db push`.
4. Separate runtime DML privileges from migration DDL privileges in production.
5. Decide deletion/retention semantics before introducing foreign-key cascades
   for business, audit, consent or analytics data.
6. Store only necessary personal data; define retention, access and audit rules
   for subscriber consent and analytics before collection.
7. Do not persist affiliate orders/commission unless the provider's official
   report contract, status semantics and idempotency key are verified.

## Conceptual domain proposal (not schema approval)

After M3 is explicitly authorized, design a versioned additive schema around:

- **Merchant and Category:** stable identifiers, normalized slug/name, active
  state, unique constraints and explicit ordering.
- **Deal/Product:** verified source information, currency/price fields with
  explicit precision, start/expiry and publication states, canonical slug, and
  timestamps. Keep source/verification provenance to distinguish confirmed data
  from imported or user-entered values.
- **Media:** private object key, MIME/size/dimensions and moderation state; never
  trust a client-supplied public URL as upload proof.
- **Role assignment and AuditLog:** M2.5 has a minimal role enum and
  `AuditEvent`; business-domain audit requirements need their own reviewed
  retention strategy.
- **Affiliate link/click:** trusted destination relation, provider and tracking
  identifiers only where verified, deduplicated event identifier, source/channel,
  timestamp and privacy-minimized attribution.
- **Publication/consent:** publication record per deal/destination, idempotency
  key, status/attempt timestamps; consent evidence, channel, purpose, scope,
  timestamp, revocation and retention.
- **Analytics:** event facts separated from derived aggregates; avoid retaining
  raw IP or user identifiers unless an approved purpose and retention period
  require them.

Before migration design, decide ownership, deletion, uniqueness, indexes,
availability history and status transitions. This proposal is deliberately not
DDL and must not be interpreted as a committed model.

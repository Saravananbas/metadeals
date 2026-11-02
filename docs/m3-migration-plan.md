# M3 schema and migration plan

Prepared before schema changes on 2026-11-02. Current database: local PostgreSQL,
`metadeals`, public schema; both identity migrations applied. Existing row counts:
User 1, Account 0, Session 0, VerificationToken 0, AuthSession 1, RecoveryCode 10,
AuthToken 3, AuthRateLimit 0, BootstrapState 1, AuditEvent 5. No business tables.

## Additive design

- Category and Merchant: stable IDs, unique slugs, names, timestamps; merchant HTTPS website.
- Media: generated storage key, provider, MIME type, byte size, dimensions, alt text,
  uploader relation and timestamp. Uploads are decoded/re-encoded raster images;
  local development storage sits outside public, production uses existing S3 client.
- Deal: stable ID and unique slug, title/brand/description, required category/merchant/media,
  integer MRP and price in paise, INR, optional sourced rating/review count, original
  HTTPS product URL and optional manually entered HTTPS affiliate URL; publication
  status, publishedAt, startsAt, expiresAt, featured/trending, creator/updater,
  timestamps and optimistic version. No client-supplied derived discount field.
- Status enum: DRAFT, PENDING_REVIEW, PUBLISHED, EXPIRED, ARCHIVED.
- Reuse AuditEvent for transactional changes with a bounded before/after snapshot.
  Published deals are archived, never hard-deleted. DELETE is allowed only for
  never-published drafts and requires existing deal:archive permission.
- Restrict deletion of referenced category, merchant, media and author records.
- Add price/rating/date/currency CHECK constraints and public-list/category/store indexes.

## Application behavior

Autonomous authorization adds subcategories (self-referencing Category.parentId,
cycle validation), multiple merchant purchase options (unique deal/merchant), and
bounded CSV/Excel imports validated atomically as drafts. No offer data is seeded.

Thin versioned /api/v1 public and admin routes call shared business services and
Prisma access. Reuse M2.5 authenticated sessions, same-origin mutation protection
and exact role matrix. Editor access to deal admin must not expose account admin.
Publication requires a saved-version preview acknowledgment, valid media and dates.
Scheduling uses publishedAt/startsAt visibility predicates (no worker required);
expiry is enforced on every public read even if stored status remains PUBLISHED.
Lists are bounded and paginated. No demo offers are imported or silently used when
the database is empty/unavailable. Public cards hide absent ratings and label sources.

## Execution and safety

1. Make a private local pg_dump backup; keep it ignored and out of source control.
2. Record schema/identity row fingerprints without exposing account data or secrets.
3. Generate SQL using Prisma migrate diff; inspect for additive CREATE/ALTER only.
4. Apply the single reviewed migration with prisma migrate deploy (never reset/db push).
5. Verify existing identity data fingerprints and migration status. Keep backup.
6. Test service CRUD inside a rollback-only transaction against this local database;
   never clear real tables. Run unit, lint, type, production build and HTTP checks.

No affiliate network, messaging, production deployment, unrelated model migration
or repository restructuring is included. Recovery is forward-fix first; restore
of a backup is an operator-approved operation, not an automatic rollback.

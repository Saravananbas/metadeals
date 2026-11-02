# M2.5 — Authentication, Authorization and Admin Foundation

## Status

**Implemented and validated on the local development database.** This module is
limited to authentication/admin foundations; M3 deal management was not started.
No initial administrator was provisioned during development.

- Branch: `copilot/overnight-roadmap-2026-11-02`
- Starting commit: `c500823`
- No commit was created.
- Local port: `4123`
- Database change: additive M2.5 migration applied to the configured local
  PostgreSQL database only.

## Approved decisions implemented

- Local email/password accounts using Argon2id.
- Mandatory TOTP MFA for every active admin account; single-use recovery codes.
- Hashed opaque database-backed sessions with a 60-minute inactivity timeout
  and 12-hour absolute lifetime.
- Server-side SUPER_ADMIN / ADMIN / EDITOR permission checks.
- CLI-only, one-time initial SUPER_ADMIN bootstrap for the approved address.
- Verified-email password reset through an operator-assisted, one-time CLI link.
- Account lifecycle and auth events recorded in `AuditEvent`.
- No SMTP, affiliate, WhatsApp, Telegram, production, or mobile integration.

## Implementation

### Data and persistence

`prisma/schema.prisma` now has role/status/token enums and auth models for
sessions, recovery codes, setup/reset tokens, rate limits, bootstrap state and
audit events. The migration
`prisma/migrations/20261102043311_m25_credentials_mfa_admin/migration.sql` is
additive: it adds identity fields/tables/indexes/foreign keys and does not drop
or rewrite existing identity tables.

`npm run db:deploy` applied this reviewed migration to the configured local
database (`127.0.0.1:55432`). `npm run db:status` reports both migrations
applied. No reset, drop, seed, production connection, or existing-user mutation
was performed. The bootstrap CLI was not run and no admin account was created.

### Authentication and sessions

- `src/server/auth/crypto.ts`: Argon2id hashing, password policy, random
  bearer-token creation/HMAC hashing, RFC 6238 TOTP, AES-256-GCM secret
  encryption, and HMAC-hashed recovery codes.
- `src/server/auth/service.ts`: login, TOTP replay protection, recovery-code
  consumption, setup/enrollment, bootstrap, password reset and account
  lifecycle operations.
- `src/server/auth/session.ts`: HttpOnly host-only session cookie and database
  session validation/sliding idle expiration. Production cookies are Secure.
- `src/server/auth/request.ts` and `http.ts`: same-origin checks, bounded JSON
  bodies and privacy-minimized request metadata.
- TOTP step acceptance is atomic; reused time steps and recovery codes are
  rejected. Password reset invalidates all existing sessions and prior reset
  tokens.

### Authorization and audit

The permission matrix in `src/server/auth/permissions.ts` grants access
server-side only. ADMIN cannot manage roles/security or create higher-privilege
accounts; role/status changes cannot target the actor; the last active
SUPER_ADMIN cannot be removed. Sensitive account transitions are serialized,
revoke relevant sessions and are audited transactionally.

Auth and admin handlers are under `src/app/api/auth/` and
`src/app/api/admin/`. The admin portal is at `/admin`; deal/affiliate/publishing
controls are intentionally absent.

### Account provisioning and recovery

- Initial administrator setup uses `npm run auth:bootstrap`, requires typing
  the approved address, is disabled by default and in production, and issues
  only a 30-minute one-time setup token. After bootstrap, disable the local
  flag. The command was not run.
- Authorized account creation requires an explicit verified-email attestation.
  The admin portal displays the one-time setup URL for delivery through a
  private channel. Expired/pending setup links can be reissued; prior tokens
  are revoked.
- There is no email transport. A Super Admin can use
  `npm run auth:reset-link -- <verified-email>` to create a one-time reset link
  for private, operator-assisted delivery. The website does not claim that an
  email was sent.

## Files changed

| Area | Files |
|---|---|
| Auth core | `src/server/auth/crypto.ts`, `service.ts`, `session.ts`, `session-policy.ts`, `permissions.ts`, `authorization.ts`, `request.ts`, `http.ts`, `audit.ts` |
| Auth/admin API | `src/app/api/auth/**`, `src/app/api/admin/**` |
| Admin UI | `src/app/admin/**`, `src/app/layout.tsx` |
| Persistence/config | `prisma/schema.prisma`, `prisma/migrations/20261102043311_m25_credentials_mfa_admin/migration.sql`, `src/config/env-schema.ts`, `src/config/env.ts`, `src/server/db/client.ts`, `.env.example`, `scripts/setup-env.mjs` |
| Operations | `scripts/bootstrap-super-admin.ts`, `scripts/manual-password-reset.ts`, `scripts/auth-integration-test.ts`, `scripts/smoke.mjs`, `package.json`, `package-lock.json`, `README.md` |
| Tests/reports | `tests/auth.test.ts`, `tests/env.test.ts`, this report, `reports/MASTER-EXECUTION-SUMMARY.md`, `reports/KNOWN-ISSUES.md`, `reports/SECURITY-DECISIONS.md` and related architecture/API/dependency reports |

Generated Prisma client files were refreshed by `prisma generate`. Previously
existing M1.5, port-4123, environment-generated and other user changes were
preserved.

## Validation

| Check | Result | Evidence |
|---|---|---|
| Prisma schema validation | PASS | `npm run db:validate` |
| Local migration deployment/status | PASS | `npm run db:deploy`; both migrations applied by `npm run db:status` |
| TypeScript | PASS | `npm run typecheck` |
| ESLint | PASS | `npm run lint`, zero warnings |
| Automated tests | PASS | `npm test`, 24/24 |
| Auth database integration | PASS | `npm run test:auth:integration` against local PostgreSQL; temporary user/session/token/audit/rate-limit rows cleaned up |
| Production dependency audit | PASS | `npm audit --omit=dev`, 0 vulnerabilities |
| Full dependency audit | KNOWN ISSUE | `npm audit` reports 16 moderate `minimatch` findings in dev tooling; no forced downgrade |
| Production build | PASS | `npm run build` |
| Production smoke | PASS | `npm run test:smoke`; updated the obsolete M0 assertion to verify the implemented unauthenticated session response. |
| Browser checks | See final execution summary | No production login or real admin account was created |

The auth database integration test exercised setup, TOTP enrollment, TOTP
replay rejection, one-time recovery login, hashed database session creation,
recovery-code reuse rejection, verified-email reset, session revocation and
one-time reset consumption. It is explicitly gated to local PostgreSQL at
`127.0.0.1:55432` and cleans only its uniquely generated test records.

## Security boundaries and remaining limitations

- The initial SUPER_ADMIN still needs to be provisioned by the authorized owner
  using the documented local CLI procedure.
- Existing `.env` files are never overwritten by `env:setup`; append independently
  generated auth secrets manually when an older `.env` predates M2.5.
- Email delivery is not configured. Invite/reset links must be delivered through
  a private, operator-approved channel.
- The app-level IP bucket uses proxy IP headers. Production must run behind a
  trusted proxy that strips/replaces incoming forwarding headers; email-based
  throttling remains in force as a second bucket.
- The previous NextAuth options scaffold remains unmounted and is not the active
  authentication path. No NextAuth API route exists.
- CSP/HSTS production hardening, data retention and operational incident
  response remain launch prerequisites (K-010).
- No mobile bearer-token contract, business/deal APIs, affiliate actions,
  live messaging, deployment, or public indexing was added.

## Next milestone

M2.5 is complete for this local foundation. Stop here for review; do not begin M3
or any later module until the user explicitly approves the next milestone.

# Authentication and authorization (as found in source, 13 Nov 2026)

## Principals
Anonymous visitors; customers (`Customer`, next-auth credentials plus Google/Apple); forum members (`ForumProfile`); staff (`User`: SUPER_ADMIN, ADMIN, EDITOR); machine callers (cron, Telegram webhook).

## Staff sign-in
- Password: argon2id (64 MiB, time cost 3). Policy: 8 to 128 characters plus a blocklist. A dummy hash equalises timing for unknown emails; all failures return one generic message.
- MFA: authenticator-app TOTP is mandatory. Secret encrypted at rest (AES-256-GCM, key `AUTH_TOTP_ENCRYPTION_KEY`). A used time-step cannot be replayed. Ten recovery codes, HMAC-hashed, single use.
- Session: random 32-byte token stored as an HMAC; cookie `__Host-metadeals-session` in production (HttpOnly, Secure, SameSite=Lax). Inactivity timeout 60 minutes and absolute 12 hours, enforced on the server on every request; the live role and status are re-read from the database each time. Login replaces the session. Password reset and role/suspension changes delete sessions.
- Lockout: database counters per email, network and pair; five failures then exponential delay up to 15 minutes; generic errors.
- Provisioning: no default password. The first super admin is created by a local command; bootstrap is blocked in production at env-parse time and after the first admin exists. Password reset is operator-issued only (no public reset request).
- `AUTH_DISABLED_DEV` is ignored when `NODE_ENV=production`. **Risk:** the guard is only `NODE_ENV`; never set it outside local development.
- Optional IP allow-list (`ADMIN_ALLOWED_IPS`) in `src/proxy.ts` for `/admin`, admin APIs and admin sign-in routes.

## Staff authorization
Roles map to permissions in `src/server/auth/permissions.ts` (unknown role denies). EDITOR: deal:create, deal:edit, deal:publish. ADMIN adds merchant, category, affiliate, operations, forum and some account permissions. SUPER_ADMIN has all, and only a super admin changes roles; nobody changes their own role or removes the last super admin.
The admin API is one router gated on `deal:edit`; individual branches add finer permissions. **After this audit** merchant-websites writes, category delete, scraper ingest/scan, Cuelinks and the kill switch carry their own checks. Branches still relying on `deal:edit` alone: media upload, product extraction and imports (deal-authoring support), scraper review (EDITOR holds `deal:publish`).

## Customer authentication
Email-code sign-up (6 digits, 10 minutes, 5 tries, hashed), password hashing as above, Google/Apple linking only with a provider-verified email. JWT session 24 hours; disabled accounts are rejected on every session read. Customer identity comes only from the session, never from the request body. State-changing routes check the request origin.

## Known gaps
Customer JWTs cannot be revoked before expiry except by disabling the account. Customer login lockout can be triggered by anyone (held). Row-level security is not available on MariaDB.

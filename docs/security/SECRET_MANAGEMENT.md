# Secret management

Variable names only; never values.

## Where secrets live
- **Production/staging:** Hostinger hPanel, Environment variables. Next.js bakes some values at build, so redeploy after changes.
- **Local:** `.env` (ignored). **Downloads from hosting:** `staging/` (ignored). **Backups** of the working folder contain these files: keep private.
- **Never** in Git: `.gitignore` covers `.env`, `.env.*` (except `.env.example`), `staging/`, `.local/`, key files. `tests/security-regression.test.ts` fails if a secret-like file is tracked or key material appears in a tracked file.

## Inventory (server only)
`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `AUTH_SESSION_SECRET`, `AUTH_TOTP_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`, `APPLE_CLIENT_SECRET`, `RESEND_API_KEY`, `SMTP_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ANALYTICS_CRON_SECRET`, `CUELINKS_API_KEY`, `AMAZON_PAAPI_*`, `FLIPKART_AFFILIATE_*`, `WHATSAPP_API_TOKEN`, `YOUTUBE_DATA_API_KEY`, `S3_*` keys.
Public (`NEXT_PUBLIC_`): `APP_URL`, `APP_ENV` only. **Never put a secret in a `NEXT_PUBLIC_` variable.**
Configuration flags (not secret): `ADMIN_ALLOWED_IPS`, `TRUSTED_PROXY_HOPS`, `COMMUNITY_ENABLED`, `MESSAGES_ENABLED`, `COMMUNITY_*`, `CUELINKS_REDIRECT_MODE`.

## Rules
1. Auth secrets must be distinct and strong; production start-up refuses weak or shared ones (`src/config/env.ts`).
2. `AUTH_DISABLED_DEV` and `AUTH_BOOTSTRAP_ENABLED` must never be set in production.
3. Do not log secrets; logging redaction covers common names including nested fields. Keep logs private.
4. Rotate on suspicion of exposure. Held rotations are listed in `HOLD_FOR_OWNER_APPROVAL.md`.
5. Start-up validation covers database, Redis, storage and auth secrets only; third-party keys and webhook/cron secrets are not validated at boot (the cron and webhook routes fail closed when theirs is missing).

## Scanning
Tracked files and 36 commits were scanned (key patterns, secret-like file names, connection strings with passwords): nothing real found. CI does not yet run a secret scanner; `tests/security-regression.test.ts` is the in-repo check.

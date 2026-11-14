# Release gate execution (13 Nov 2026)

Scope: close every release-gate item that can be closed safely without the owner. Staging is not production. **Production deployment stays on hold. Not approved for production.**

## What was executed today

| Item | Result | Evidence |
|---|---|---|
| 12 Redis-dependent tests | **7 of 8 now run and PASS.** The Docker Redis (`redis:7.4-alpine`, 127.0.0.1:6380) was already running; the earlier failures were only a missing `REDIS_URL` in that shell. `m11-queue-scheduler`, `m12-ingestion`, `m12.1-security-hardening` = 17 of 17 pass (replay protection, shared kill switch, atomic publish claim, crash recovery). | Local run, `.env` Redis. Note: this run used the dev database `metadeals` (not the disposable one), which the ingestion tests write test rows into. |
| 12 The 8th test | **Still NOT RUN.** `public-comments.integration.test.ts` needs a PostgreSQL client and a `metadeals_test` Postgres role; the app now generates a MariaDB client. Not counted as passed. | Test file skip condition (`postgresql://metadeals_test:`). Needs a Postgres test profile built on purpose; the Docker Postgres container exists but has no such role/database. |
| 5 CSP, anonymous checks | Staging still sends the enforcing policy plus the host's `upgrade-insecure-requests`; `/api/health/ready` = database up, redis up. | `curl -I`, 13 Nov 2026 |
| 9 WordPress production site | Investigated read-only (see below). | `curl` of public pages |

## What cannot be done without the owner (put on hold, not skipped)

| Item | Why it is blocked | What I need |
|---|---|---|
| 5 Signed-in, admin, Google/Apple completion, YouTube | Needs sign-in. I will not use or ask for real Google/Apple passwords or authenticator secrets. No staging deal has a YouTube video. | See "Test accounts" |
| 7 EDITOR vs ADMIN on staging | Staff sign-in needs TOTP; creating staff accounts and enrolling TOTP is an account-creation/credential action | See "Test accounts" |
| 8 Customer A vs B on staging | Sign-up sends an emailed code | Two mailboxes you control |
| 10 Hostinger daily backup restore | The Hostinger integration cannot list or restore backups and cannot create a scratch database from a backup. hPanel is a manual action. | Owner, in hPanel (steps below) |
| 1-4, 11 | Credential rotation, DB permissions, hosting rules, legal decision | Owner approval |

### Test accounts to create (documented, nothing created)
Create these on **staging only**, with throw-away passwords you choose and never paste into chat:
1. `qa-editor@<your domain or +alias>`: role EDITOR (staff).
2. `qa-admin@<...>`: role ADMIN (staff).
3. `qa-customer-a@<...>` and `qa-customer-b@<...>`: customers, both email-verified.
Staff accounts are made by a SUPER_ADMIN in the admin portal (staff area) and each enrols its own authenticator app. When ready, tell me "accounts ready"; I will then run the role/isolation checks through the browser **only if you sign in yourself in the pane** (I do not type passwords or TOTP codes). The automated route tests (`tests/admin-roles-routes.test.ts`) already cover the same permission table with real session records.

### Hostinger backup restore (owner steps, hPanel)
1. hPanel > Websites > staging site > Backups > Databases: pick the latest daily backup of the staging database and choose **restore to a new/scratch database** (do not choose "restore over current").
2. If hPanel only offers restore-in-place, **stop**; take a manual export first and tell me.
3. Give me the scratch database name; I will compare table count (59), row counts and foreign keys with `BACKUP_RESTORE_PROCEDURE.md`.

## Owner actions reassessed

| Action | Status now | Change |
|---|---|---|
| Rotate staging DB password and cron secret | Open | Do together with the restricted user, one window; redeploy after. |
| Least-privilege runtime user | Open | Still unknown whether the plan allows per-privilege grants; if not, rotate the password and accept the risk in writing. |
| Remote MySQL rules (3) | Open | Remove last. |
| Production `ADMIN_ALLOWED_IPS` | Open | Needs production to exist and an outside-network test. |
| Retention and deletion policy | Open | Legal decision. |

## Production WordPress site: findings and plan (read-only, nothing changed)
Found: `https://metadeals4u.in` is WordPress 6.8.12, theme Astra, Elementor (4.3.6) with Elementor Pro, ElementsKit, Royal Elementor Addons, Element Pack Lite, WP Statistics, WP ULike and an affiliate plugin (`amazingaffiliates`), PHP 8.2, LiteSpeed cache, title "Home - Meta Deals For You". `www` redirects to the apex. The REST path `/wp-json/` returns 404 (pretty permalinks off or blocked); `?rest_route=` is advertised.

Risks: deploying the Next.js app to this domain **replaces the site and its URLs**; the WordPress database holds content, possibly leads/comments (unknown); the affiliate plugin may carry live tracking links.

Safe plan (nothing executed):
1. **Do not deploy to the apex.** Production Node app goes to a new Hostinger website entry or the staging site is promoted under a different subdomain first.
2. Inventory (owner or me via Hostinger list calls): WordPress DB tables, uploads size, forms/comments/users, any inbound links and search rankings.
3. Take a full backup (files + DB) and export it off-host before any change.
4. Decide: (A) keep WordPress as a marketing page at `/` and serve the app on `app.metadeals4u.in`; or (B) replace WordPress fully: map every indexed WordPress URL to a 301 redirect target in the new site, switch DNS/site in a maintenance window, keep the WordPress copy for 30 days.
5. Production environment (new DB, secrets, OAuth redirect URIs, Cuelinks, `ADMIN_ALLOWED_IPS`) prepared and tested on a staging-like host first.
Recommendation: option A until after launch.

## Release gate status
Open: item 5 untested pages; items 7, 8 (staging accounts); item 10 (hPanel restore); item 12 (one Postgres test not run); items 1 to 4 and 11 (owner); production domain decision; legal review. **Production readiness: NOT claimed.**

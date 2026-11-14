# Items on hold for owner approval or input (13 Nov 2026)

Each item: **what**, **why**, **impact**, **risk**, **exact proposed action**, **rollback**, **downtime**, **decision needed**.

## 1. Unblock the staging backup and migrations (input needed, not an approval)
- **What:** the database refuses the staging password stored in `staging/env` (and the cron secret in `staging/analytics-cron-secret.txt` is refused by the staging probe). Both look rotated or changed.
- **Why:** without a working staging credential no backup, restore test or Prisma migration can run on staging; deploying the new code before the migrations would break the community pages.
- **Impact / risk:** none until used; low. The credential is used only on this PC, never printed.
- **Proposed action:** you update `staging/env` (`DATABASE_URL`) and `staging/analytics-cron-secret.txt` with the current values (or tell me they were not rotated so I can look elsewhere). I then: take a timestamped backup with `mariadb-dump`, verify it, restore it into a temporary LOCAL database, compare tables, indexes, foreign keys and representative rows, apply the six migrations with `prisma migrate deploy` through the existing Remote MySQL rule for this PC, check `migrate status`, run the tests, and only then deploy the build.
- **Rollback:** restore from that backup into a scratch database and compare; the migrations are additive (new tables and nullable or defaulted columns), so the old build also keeps working until the new build is deployed.
- **Downtime:** none expected on staging (additive migrations, then one redeploy).
- **Decision:** confirm the updated files are in place.

## 2. Rotate staging database password and cron secret
- **What / why:** earlier exposure in screenshots and a terminal (see `INFRASTRUCTURE_RUNBOOKS.md` sections 10 and 11). The local copies being out of date suggests this may already be done: confirm.
- **Impact:** staging only. **Risk:** low. **Action:** change in hPanel, update the staging environment variables, redeploy. **Rollback:** previous value is not kept; keep the new one in your password manager. **Downtime:** about 2 minutes while the app restarts.
- **Decision:** was it done? If not, approve doing it together with item 3.

## 3. Restricted runtime database user (and a separate migration user)
- **What / why:** the staging DB user has every privilege including DROP and EVENT; the app needs only SELECT, INSERT, UPDATE, DELETE (proved locally).
- **Impact:** limits damage from an injection flaw. **Risk:** medium (a wrong grant breaks the site). **Action:** in hPanel create a second user for staging with only those four privileges, switch `DATABASE_URL` after the migrations, keep the full-privilege user for migrations only. Check first whether the plan allows per-privilege grants. **Rollback:** switch `DATABASE_URL` back. **Downtime:** about 2 minutes. **Decision:** approve, after item 1.

## 4. Remove the three Remote MySQL rules (last)
- **What / why:** they expose the staging database to three addresses; one is this PC and is needed for item 1. **Risk:** low. **Action:** delete the rules once item 1 is finished. **Rollback:** re-add a rule. **Downtime:** none. **Decision:** approve after the migrations are done.

## 5. Anything on production (`metadeals4u.in`)
- Production database migrations, production deployment, DNS changes, production OAuth redirect URIs, production secrets, production `ADMIN_ALLOWED_IPS`, replacing or moving the WordPress site (plan in `RELEASE_GATE_EXECUTION_2026-11-13.md`).
- **Why on hold:** production does not run this app; the WordPress site has its own database and traffic. **Risk:** high (replaces a live site; an IP rule can lock admins out). **Action proposed:** keep WordPress on the main domain and put the app on a subdomain first; prepare a separate production database, environment and OAuth clients; test the admin IP rule from an outside network before enabling it. **Rollback:** keep the WordPress copy and DNS records for 30 days. **Downtime:** none for the subdomain plan; a short window for a replacement. **Decision:** choose the plan (subdomain first is recommended).

## 6. Data retention and customer deletion policy
- Legal/business decision (`DATA_RETENTION_AND_DELETION_PROPOSAL.md`). **Risk:** medium (privacy law). **Decision:** option A, B or C and the retention periods.

## 7. Email and mobile push notifications
- External provider and cost (an email service for notices, APNs and FCM for push). **Why on hold:** paid or external services need your approval. Notices are in-app only today. **Decision:** which providers, and when (a separate phase).

## 8. Nonce-based CSP
- Architectural decision: needs every page rendered per request and a full re-test; would remove `'unsafe-inline'` from scripts. **Decision:** schedule it after launch or approve it now as a separate task.

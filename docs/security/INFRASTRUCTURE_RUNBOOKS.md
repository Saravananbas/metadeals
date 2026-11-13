# Infrastructure runbooks (items 8 to 14)

Nothing in this file has been run on Hostinger. Each section says what was verified locally, what is prepared, and what only the owner can do. "Staging" and "production" are always kept apart.

## 8. Least-privilege database user
**Verified locally (disposable MariaDB `metadeals_test`, not staging):** a user with only `SELECT, INSERT, UPDATE, DELETE` was created. `CREATE TABLE` and `DROP TABLE` were refused. The whole test suite was then run as that user: 200 of 208 tests passed, 1 was skipped (needs Docker Postgres/Redis), and 7 failed because they need Redis (not installed on this PC). The brand-colour rule failed in that first run and was fixed afterwards. No test failed for lack of privileges. **Conclusion: the application needs no DDL rights at run time.**

**Prepared for staging (owner steps in hPanel):**
1. hPanel, Databases, Management: create a second database user, for example `<db>_rt`, with a new strong password (you choose it; do not paste it in chat).
2. Give it access to the staging database. If hPanel offers privilege checkboxes, tick only: SELECT, INSERT, UPDATE, DELETE. If it only offers "All privileges", ask Hostinger support whether per-privilege grants are possible on this plan. **If they are not, this item cannot be fully done on this plan; record that as an accepted risk.**
3. Keep the current user for migrations only.
4. Put the new user in `DATABASE_URL` (Environment variables), host `127.0.0.1`, redeploy.
5. Verify (phpMyAdmin SQL tab, signed in as the new user): `SHOW GRANTS;` lists only the four privileges; `CREATE TABLE zz_test (id int);` is refused.
6. Verify the site: homepage, sign-in, a deal page, admin sign-in.
7. For future migrations: add one Remote MySQL rule for your current address (item 9) only for the duration of the migration, run `npm run db:deploy` from your PC with the migration user's `DATABASE_URL`, then delete the rule again. (Alternative without Remote MySQL: paste the migration SQL into phpMyAdmin as the migration user.)
**Rollback:** put the previous `DATABASE_URL` back and redeploy.

## 9. Remove unnecessary Remote MySQL access
1. hPanel, Databases, Remote MySQL: list the rules. Delete every rule except one you need right now.
2. Order: do this **last**, after item 8 and any pending migration. Migrations run through these rules.
3. Verify: from your PC, `npx prisma migrate status` against the staging URL should now fail to connect.
**Live Hostinger access is needed to list the current rules; I could not read them (the Hostinger tool was disconnected).**

## 10. Staging database password: exposure and rotation
**Exposure verified (from this project's own history):** the staging database password was printed once to a terminal by an early checker script (noted and reported at the time). It is not in Git (scanned: no real credential in tracked files or 36 commits), and it differs from every test password in the repository (compared by hash, nothing printed). It was never posted in chat by name. **Treat it as exposed to anyone who can read that terminal history or session log.**
**Rotation procedure (owner approval needed; not performed):**
1. hPanel, Databases: change the password of the user in use (or, better, create the runtime user in item 8 and retire the old one after the switch).
2. Update `DATABASE_URL` in Environment variables with the new password (no quotes), redeploy.
3. Update `D:\Metadeals\staging\env` if you keep a copy; delete older copies of the old password.
4. Verify the homepage and admin sign-in. If either fails, the URL is wrong: re-check the user name, host `127.0.0.1`, and special characters in the password (use only letters and digits to avoid URL-encoding trouble).

## 11. Staging cron secret: exposure and rotation
**Exposure verified:** the secret value appeared in two screenshots shared with the assistant and in a local file `staging/analytics-cron-secret.txt` (Git ignores `staging/`). **Treat it as exposed to this conversation.** Risk is low: it only lets someone run the nightly rollup (sum visits, delete records older than 90 days).
**Rotation procedure (not performed):**
1. Generate a new value: run `node -e "console.log(require('crypto').randomBytes(30).toString('base64url'))"` on your PC and keep it private.
2. Environment variables: set `ANALYTICS_CRON_SECRET` to it, redeploy.
3. hPanel, Cron Jobs: edit the job so the `x-cron-secret:` header uses the same value.
4. Test: press View Output after the next run, or send the request once; expect `{"ok":true…}`. A 401 means the two values differ.
5. Delete the old `staging/analytics-cron-secret.txt`.

## 12. ADMIN_ALLOWED_IPS for production (safe configuration)
1. **Recovery first.** Before enabling, make sure you can edit environment variables from hPanel on a network that is NOT behind the allow-list (phone data). That is your recovery path: clearing the variable and redeploying removes the lock.
2. Value format: comma separated, IPv4 or IPv6, ranges allowed. Example: `124.123.129.131,2406:b400:3a:1a46::/64`. Use the `/64` form for IPv6 because the last half rotates.
3. Add a second trusted location (office or relative) so one changed address cannot lock you out.
4. Set `TRUSTED_PROXY_HOPS=1` unless Hostinger proves otherwise (section 13).
5. Deploy to **staging first**, run the section 13 checks, then production.
6. Re-check when your ISP changes your address (router restart, new plan).

## 13. Hostinger reverse-proxy behaviour: verification steps
What the code does: it takes the client address from the **last** `x-forwarded-for` entry (`TRUSTED_PROXY_HOPS` from the right), validates the format, and never uses the first entry. This is only correct if Hostinger's proxy **appends** the real address or **overwrites** the header.
**Not verified live: needs Hostinger access I did not have.** Steps (use the staging site):
1. Deploy this branch (it includes `/api/admin/network-check`, readable by ADMIN and SUPER_ADMIN only).
2. From an allowed network, sign in to `/admin/login`, then open `https://staging.metadeals4u.in/api/admin/network-check`. It shows `forwardedForEntries`, `clientIpUsed`, `protocolSeenByProxy`, `host`.
3. Read it: `clientIpUsed` must be YOUR public address (the one whatismyipaddress.com shows).
4. **Spoofing test:** in the browser console of the signed-in tab, run `fetch('/api/admin/network-check',{headers:{'X-Forwarded-For':'1.2.3.4'}}).then(r=>r.json()).then(console.log)`. Expected: the list still ends with your real address and `clientIpUsed` is still your real address. If `clientIpUsed` becomes `1.2.3.4`, the proxy passes the header through unchanged: set `TRUSTED_PROXY_HOPS` so the real hop is selected, or stop relying on the header.
5. **HTTPS detection:** `protocolSeenByProxy` should be `https`. The app itself does not branch on it; cookies use `__Host-` and `Secure` when `NEXTAUTH_URL` is https (enforced in production).
6. **Allow-list correctness:** from a phone on mobile data open `/admin/login`: expected "Page is not available" (HTTP 404). From the allowed network it loads.
7. Record the date and results in `PRODUCTION_SECURITY_CHECKLIST.md`.
After confirming on staging, repeat steps 2 to 6 on production once it exists.

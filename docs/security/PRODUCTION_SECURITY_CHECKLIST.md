# Production security checklist

Tick only what has been verified. "Verified" means tested or observed, not assumed.

## Done in code (this branch, not yet deployed)
- [x] Script injection in deal structured data closed (unit test)
- [x] Generic API errors (unit test)
- [x] One trusted client-address rule everywhere (unit tests)
- [x] Admin permission gaps closed (source checks + review)
- [x] Upload size must be declared
- [x] Suspended members cannot change identity
- [x] Secret scan test in the test suite
- [x] Report-Only CSP

## Before going live (owner / staging)
- [ ] Deploy this branch to staging
- [ ] From a phone on mobile data: `/admin/login` shows "Page is not available"; from your network it loads
- [ ] `ADMIN_ALLOWED_IPS` set in production; `TRUSTED_PROXY_HOPS=1` confirmed correct
- [ ] Sign in as an EDITOR on staging: merchant directory edit, category delete, scraper scan, Cuelinks stats all return 403
- [ ] Sign in as an ADMIN: the same actions work
- [ ] Two customer accounts on a disposable database: A cannot open B's submission, profile edit or message thread
- [ ] Avatar and submission image upload works on staging (the 411 rule depends on Hostinger sending the length)
- [ ] CSP Report-Only: browse every page with the console open, fix violations, then enforce (hold item 1)
- [ ] Runtime database user without DDL rights (hold item 2)
- [ ] Remote MySQL rules removed (hold item 3)
- [ ] Staging database password changed; cron secret replaced if desired (hold items 4, 5)
- [ ] Daily backup restored into a scratch database once, date recorded
- [ ] `AUTH_DISABLED_DEV` and `AUTH_BOOTSTRAP_ENABLED` absent in production
- [ ] HTTPS only; HSTS present in the production response
- [ ] `ANALYTICS_CRON_SECRET` set and the cron job shows `{"ok":true…}`
- [ ] GitHub: branch protection, secret scanning and push protection enabled in repository settings; CI runs `npm test` security file
- [ ] Legal review of Privacy, Terms, Cookie and Disclaimer pages
- [ ] Decide held items 6 to 11 and 15

## Known unverified areas
Hostinger header behaviour, database grants, backup restore, frontend bundle built by Hostinger, Python extractor (not deployed), scraper workers.

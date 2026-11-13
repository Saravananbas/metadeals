# Staging deployment checklist

Scope: `staging.metadeals4u.in` only. **Production is not deployed and this checklist does not touch it.** Do not push to the production branch.

## A. Before deploying: staging contains no production data or production secrets
Today there is no production site, so there is no production customer data. Confirm that stays true:
- [ ] Staging database `u113628361_staging` holds only: deals and merchants copied from the local development database, and test or demo customers. Check in phpMyAdmin: `SELECT COUNT(*), MIN(createdAt), MAX(createdAt) FROM Customer;` and `SELECT email FROM Customer LIMIT 20;` (open in phpMyAdmin, do not paste emails in chat). Every email must be yours or a test address. Delete any real customer sign-ups only after you decide how to handle them.
- [ ] Environment variables on staging are staging values. Review the key names (values are masked): `CUELINKS_API_KEY` and `CUELINKS_PUB_ID` are **real affiliate credentials** used on staging in wrap mode (decide: keep, or switch staging to a separate Cuelinks test account). `GOOGLE_*`, `APPLE_*` OAuth credentials use the staging callback URLs. `YOUTUBE_DATA_API_KEY` and SMTP/Resend keys are real service keys with quota or cost.
- [ ] `AUTH_DISABLED_DEV`, `AUTH_BOOTSTRAP_ENABLED` are **not set**.
- [ ] `NODE_ENV` is production (Hostinger sets it for Next builds); `NEXTAUTH_URL` is `https://staging.metadeals4u.in`.
- [ ] `ADMIN_ALLOWED_IPS` is set; `TRUSTED_PROXY_HOPS=1`; `CSP_MODE` is empty (report-only) for the first deploy. **`CSP_MODE` is read at build time**: set it before the build you want it in, and redeploy after changing it.
- [ ] `TELEGRAM_CALLBACK_SECRET` is set to a value different from `TELEGRAM_WEBHOOK_SECRET` if Telegram posting is ever enabled (approvals are refused otherwise).
- [ ] `COMMUNITY_ENABLED` and `MESSAGES_ENABLED` as intended (messages have no screens yet: keep it off).

## B. Deploy
1. `git checkout security/cloudflare-audit` (already pushed) and run `node scripts/package-staging.mjs`.
2. Deploy `D:\Metadeals-staging-pkg` (the Hostinger build limits Next to 2 workers via `next.config.ts`).
3. Wait for the build to finish; confirm `/api/health/ready` is 200.
4. Migrations: **none are new in this security work.** The five earlier migrations are already applied on staging.

## C. Verify on staging (evidence for the approval list)
- [ ] Home page, a deal page, `/privacy`, `/terms`, `/cookies`, `/disclaimer` load; deal images and merchant logos show.
- [ ] Browser console on home, deal, `/account` (sign-in page), `/community`, `/post-deal`: look for `Content Security Policy` report lines. A clean console means the policy is ready to enforce (section D).
- [ ] Customer sign-up and sign-in with email, and with Google and Apple (full-page redirects; these are not tested locally).
- [ ] A deal with YouTube reviews opens and the video plays (CSP `frame-src`).
- [ ] Avatar upload and a submission with an image upload (Hostinger must send the upload size; the app refuses uploads without it).
- [ ] Buy Now on a deal in wrap mode redirects through Cuelinks to the store; two quick clicks create one click row, a click 15 seconds later creates another.
- [ ] Guest comment named "Admin" is refused; a normal name shows with a "Guest" tag.
- [ ] EDITOR account: merchant directory edit, category delete, scraper scan, Cuelinks stats return 403. ADMIN account: the same work.
- [ ] Two customer accounts: A cannot open B's submission by id (404).
- [ ] Admin lock: mobile data shows "Page is not available"; allowed network loads. Run the section 13 checks of `INFRASTRUCTURE_RUNBOOKS.md`.
- [ ] Cron job output shows `{"ok":true…}`.

## D. Enforce the CSP on staging only
1. Set `CSP_MODE=enforce` in staging Environment variables, redeploy.
2. Repeat the console checks in C. Any blocked item means the policy needs that source added (`next.config.ts`).
3. Only then consider the same setting for production.

## E. Production (not now)
Requires: all of C and D clean on staging, the owner approval items in `HOLD_FOR_OWNER_APPROVAL.md`, and a restored backup test.

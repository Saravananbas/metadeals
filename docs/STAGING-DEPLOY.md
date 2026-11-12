# Staging deploy (Hostinger Business, staging.metadeals4u.in)

No Docker, Python, or Redis on this plan.

1. hPanel > Node.js app: Node 22.x, npm, Next.js preset, start command `npm start`.
2. Environment: copy values from `.env.staging` (set `MEDIA_DIR` to an absolute path outside the app folder; leave `REDIS_URL` unset).
3. Build: `npm ci && npm run build` (build locally and upload if hPanel runs out of memory).
4. Database: `DATABASE_PROVIDER=mysql`; apply `prisma/migrations_mariadb` with `npm run db:deploy` (MariaDB config) - only after you approve touching the staging DB.
5. Extraction: the in-app Node pipeline only. Missing fields are typed or pasted manually; images can be uploaded or pasted (Ctrl+V).
6. Verify: `/api/health`, `/api/health/ready`, an admin image paste, a `/go/<dealId>` redirect.

Open: `CUELINKS_REDIRECT_MODE=direct` means no commission; switch to wrap when ready. Admin login is only bypassed when `NODE_ENV` is not production.

## Analytics rollup cron
Set `ANALYTICS_CRON_SECRET` (24+ characters) in hPanel and redeploy. Add an hPanel cron job (daily, e.g. 02:30) running:
`curl -s -X POST -H "x-cron-secret: <secret>" https://staging.metadeals4u.in/api/cron/analytics-rollup`
It sums raw visits into daily totals and deletes raw rows older than 90 days.

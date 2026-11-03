# Test and Validation Results

## M2.5 final validation

| Check | Result | Command / evidence |
|---|---|---|
| ESLint | PASS | `npm run lint`; exit code 0, zero warnings. |
| TypeScript | PASS | `npm run typecheck`; Prisma generation, Next route types and `tsc --noEmit` passed. |
| Unit tests | PASS | `npm test`; 24 passed, 0 failed. |
| Prisma schema | PASS | `npm run db:validate`; valid. |
| Migration status | PASS | `npm run db:status`; two migrations found, database schema current. |
| Auth database integration | PASS | `$env:AUTH_INTEGRATION_TESTS = "1"; npm run test:auth:integration`; local PostgreSQL only. |
| Production build | PASS | `npm run build`; optimized build and TypeScript checks passed. |
| Production smoke | PASS | `npm run test:smoke`; homepage/assets, image optimization, headers, liveness, DB/Redis readiness, 404, unauthenticated auth session and sanitized failure response. |
| Browser checks | PASS, scoped | Admin login renders; homepage has no document overflow at 1536/768/390/320 and uses 6/3/2/2 deal columns. No authenticated-admin test because no account was provisioned. |
| Production dependency audit | PASS | `npm audit --omit=dev`; zero vulnerabilities. |
| Full dependency audit | KNOWN ISSUE | `npm audit` has 16 moderate `minimatch` findings in dev tooling. A forced fix proposing ESLint 4.0.0 was not applied. |

The local auth integration run exercised setup and TOTP enrollment, TOTP
replay rejection, one-time recovery login and reuse rejection, hashed database
session creation, verified-email reset, session revocation and one-time reset
consumption. It is gated by `AUTH_INTEGRATION_TESTS=1`, verifies the configured
local PostgreSQL host/port `127.0.0.1:55432`, creates uniquely named temporary
records, and cleans them up.

The smoke check initially failed because it still expected
`GET /api/auth/session` to be absent in M0. The stale assertion was corrected
to require the implemented route to return `{ "user": null }` when no session
cookie is present; the smoke suite then passed.

Integrated-browser checks confirmed that `/admin/login` displays the expected
sign-in form and does not require or imply an existing password. At the four
requested homepage widths, the deal grid used 6/3/2/2 columns and
`document.documentElement.scrollWidth <= window.innerWidth`. The integrated
browser's mobile-menu click timed out waiting for the control to become stable,
so that interaction is not claimed as validated in this run.

## M1.5 historical acceptance evidence

These are the earlier M1.5 acceptance results, not a second run during M2.5:

- Responsive sizes: 1536×1024, 768×1024, 390×844, 320×800.
- Deal columns: 6/3/2/2; no document horizontal overflow.
- Manrope active; 10/10 images loaded at each size.
- Mobile navigation, latest/featured views, search, category/store filtering
  and wishlist toggle/restore passed.
- Screenshots:
  - `docs/screenshots/acceptance/m15-desktop-1536.png`
  - `docs/screenshots/acceptance/m15-tablet-768.png`
  - `docs/screenshots/acceptance/m15-mobile-390.png`
  - `docs/screenshots/acceptance/m15-mobile-320.png`

## Security and external-action boundaries

- The M2.5 additive migration is applied only to the configured local database;
  no reset/drop or production migration was run.
- No bootstrap account was created and no initial admin was provisioned.
- No production deployment, real affiliate request, email, WhatsApp or Telegram
  message, public indexing, or mobile-native workflow was performed.
- Full audit results and compatible-remediation follow-up are tracked in
  `KNOWN-ISSUES.md`.

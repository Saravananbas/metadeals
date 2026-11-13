# Security remediation log

Branch `security/cloudflare-audit`. All fixes are local and uncommitted until the owner approves; nothing was deployed.

| # | Finding | Severity | Fix | Evidence | Independent check |
|---|---|---|---|---|---|
| 1 | Deal text can close the JSON-LD script tag (stored XSS) | Medium | `serializeJsonLd` escapes `<` and U+2028/2029 (`src/lib/json-ld.ts`, used in `src/app/deal/[slug]/page.tsx`) | Unit test: no raw `<`, data unchanged | Reviewer agent confirmed escaping is complete and no other inline JSON exists |
| 2 | Internal error text returned on failures | Medium | Fixed message plus request id (`src/server/http.ts`) | Unit test with a fake database error | Reviewer OK |
| 3 | Rate limits keyed on a forgeable header | Medium | One shared helper `src/server/client-ip.ts` (trusted last entry, ports/brackets handled, range checks) used at all call sites; `TRUSTED_PROXY_HOPS` added to `.env.example` | Unit tests incl. forged first entry, ports, brackets | Reviewer found two edge cases (ports, octet range); both fixed |
| 4 | Editors could rewrite the merchant directory | Medium | Non-GET needs `merchant:manage` | Source-check test + permission test | Reviewer OK |
| 5 | Editors could delete categories and re-point deals | Medium | `category:manage`, transaction, audit row | Source-check test | Reviewer confirmed valid Prisma use |
| 6 | Editors could ingest/scan in the scraper | Low | `operations:read` for ingest and scan; limit/offset clamped | Source-check test | Reviewer OK |
| 7 | Editors could read affiliate earnings / spend Cuelinks quota | Low | GET needs `operations:read`, POST needs `affiliate:manage`; Cuelinks admin page needs `operations:read` | Source-check test | Reviewer flagged POST gap; fixed |
| 8 | Publishing kill switch: no origin check, editors could switch it off | Low | Origin check, bounded body, audit event, switching OFF needs `operations:read` | Source-check test | Reviewer OK |
| 9 | YouTube review changes ignored the deal in the URL | Low | `dealId` in every where clause, reorder capped | Source-check test | Reviewer confirmed valid Prisma where |
| 10 | View/share counters on unpublished deals, unlimited shares | Low | `publicWhere` on both lookups; per-address share throttle | Local probe: unknown deal returns 404 for both; source-check test | Reviewer OK |
| 11 | Suspended members could change name/picture | Low | `assertNotSuspended` in all three identity writes | Source-check test | Reviewer OK |
| 12 | Chunked uploads skipped the size check | Low | `assertDeclaredUploadSize` (411 without `Content-Length`) | Local probe: anonymous upload gets 401 first; tsc | Reviewer OK; asks to test an avatar upload on staging |
| 13 | Avatar path accepted any image format | Low | Allowlist jpeg/png/webp before processing | tsc | Reviewer OK |
| 14 | `affiliateHosts` accepted any text | Low | Host-name regex, max 100 | Unit test (`com` rejected, real hosts accepted) | Reviewer found punycode TLD and size limit issues; fixed |
| 15 | Shallow log redaction, raw errors logged | Low | Wildcard redact paths; name-only logging in sign-in and next-auth | Reviewer verified path syntax for pino | Reviewer OK |
| 16 | Admin links from third-party data | Low | `safeHttpsHref` on three links | Unit test | Reviewer OK |
| 17 | Weak default password in an import script | Low | Fallback removed; script requires `DATABASE_URL` | Read | n/a |
| 18 | CSP absent | Medium | Full policy added as **Report-Only** (does not block); enforcement held | Local probe shows both headers; test | n/a |
| 19 | Loose localhost origin check | Low | Exact host match | tsc | Reviewer OK |

Not fixed (held or needs the owner): see `HOLD_FOR_OWNER_APPROVAL.md`.

## Test evidence
- `tests/security-regression.test.ts`: 10 tests, all pass. `tests/admin-ip-proxy.test.ts`: passes.
- Full existing suite run serially: the same 18 failures as before this work (17 need `DATABASE_URL`/`REDIS_URL` that this machine's test environment lacks; 1 is the brand-colour test that fails because new CSS uses plain colour codes). No new failure was introduced (one new failure caused by a CSS variable was found and fixed during this work).
- Route-level authorization is checked only by source-pattern tests plus reviewer reading. **No automated test logs in as an EDITOR and calls the routes.** That needs a database; see the checklist.
- The Cloudflare skill's JSON validators could not run on Windows (they need no-follow file opening that this platform lacks). `findings.json` was checked against the schema's required and allowed fields with a small script instead.

## Round 2 (items 1 to 11 of the approval list)

| Item | Fix | Evidence | Independent review |
|---|---|---|---|
| Login lockout | Per-address (IPv6 /64) total limit; per email+address and per-email counters bumped before the check and cleared on a correct password; global counters and sign-up global cap removed; expired counter rows cleaned | `tests/login-throttle.test.ts` (4 database tests, also run as a DML-only database user) | Two reviews; fixed: counter order, IPv6 /64, row growth |
| Guest names | `looksLikeStaffName` (homoglyphs, digits, zero-width, accents, spaced letters, whole-word); "Guest" tag on every web comment | Security regression test | Two reviews; fixed: "Admin1", accents, zero-width |
| Click throttle | `normalizeClickChannel`, `shouldRecordClick`; redirect unaffected; subId carries the normalised channel | Security regression test; `tests/affiliate.test.ts` passes | Review OK |
| Telegram | `TELEGRAM_CALLBACK_SECRET`, stored pending record, conditional update, REJECT/HOLD/REVERIFY close the offer, no reopening of used records, future timestamps refused | `tests/telegram-approval-hardening.test.ts` (5), existing Agent 1 tests (12) | Two reviews; fixed: reopen race, rejection |
| Image deadline | 30 s total (lookup, redirects, body) | Security regression test | Review OK |
| Redirect allowlist | Forwarded addresses in any parameter/path/encoding layer must be allowed stores; control characters and odd schemes refused | Security regression test (20 assertions) | Two reviews; fixed: tab, double-encoding, unknown parameter names |
| CSP | `CSP_MODE=enforce` | Local production build, 3 pages, 0 violations; unit test | Review OK; found `upgrade-insecure-requests` breaks plain-http runs (removed) |
| Network check | Staff-only `/api/admin/network-check` (ADMIN and above) | Source-check test | Review OK |
| Brand-colour rule | 15 files moved to official colour tokens (automatic nearest-colour mapping), small muted text darkened one step | `tests/design-tokens.test.ts` passes; build and lint pass | Review OK (minor contrast note applied) |
| Existing test updated | `tests/community-submissions.test.ts` now expects a pasted `http://` link to be upgraded to https (an earlier requested behaviour), not refused | Passes | n/a |

## Final regression (this PC, disposable MariaDB, DML-only user, all test flags on)
204 passed, 7 failed, 1 skipped, of 212. The 7 failures are the queue/worker/scheduler tests (`Missing or invalid environment variables: REDIS_URL`; Redis is not installed here); the skipped test needs Docker Postgres/Redis. **These 8 are UNVERIFIED on this machine.** Lint, type check and production build pass. The client bundle contains none of the 35 secret-sized values checked from `.env`, `staging/env` and the local test password, and no source maps.

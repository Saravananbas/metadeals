# MetaDeals4U security audit report

Date: 13 November 2026. Branch `security/cloudflare-audit` (base `cf0288f`). Full machine-readable records: `~/security-audit-skill/MetaDeals4U/run-1/` (`findings.json`, `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, `coverage-ledger.json`, `architecture.md`).

## Overall assessment
No critical or high-severity vulnerability was confirmed. Seventeen medium and low issues were confirmed; most are now fixed in the working tree (not committed or deployed). The strongest areas are staff authentication (argon2id, mandatory TOTP with replay protection, hashed recovery codes, server-side 60-minute inactivity timeout, hashed session tokens, `__Host-` cookies), customer data isolation (ownership is part of every database query; public responses expose only handles), and the SSRF defences in the Node product fetcher (https only, allowlist per hop, resolved address pinned, private ranges blocked). **This is a statement about what the reviewers found. It is not proof that the application is secure.**

## How the audit was done and its limits
- Method: Cloudflare's security-audit workflow read from the installed skill and followed by hand: 4 reconnaissance agents, 6 hunters, 4 fresh verifiers, then fixes and an independent review of the fixes.
- **All findings come from reading source.** There is no OS-enforced sandbox on this Windows host, so no target code was executed for validation. A few anonymous requests were sent to the owner's own local dev server.
- **Not examined in depth:** `python-extractor/` internals, one-off `scripts/`, BullMQ workers and scraper connectors, the mobile API shape.
- **Unverified (outside the repository):** Hostinger proxy behaviour for `x-forwarded-for`, database user privileges, production environment values, backups and restore.
- **Not tested end to end:** User A versus User B and EDITOR versus ADMIN were checked by reading code and by source-pattern tests, not by logging in as each user. Row-level security does not exist on MariaDB, so isolation is application-level only.
- The Cloudflare JSON validators cannot run on Windows; structure was checked with a script.

## Confirmed findings
| Severity | Finding | Status |
|---|---|---|
| Medium | Deal text can close the JSON-LD script tag on the public deal page | Fixed |
| Medium | Internal error text returned to callers on failures | Fixed |
| Medium | Rate limits keyed on a forgeable address header | Fixed |
| Medium | Editors could rewrite the merchant directory and push merchants live | Fixed |
| Medium | Editors could delete categories and silently re-point deals | Fixed |
| Medium | Content Security Policy does not restrict scripts | Report-Only policy added; enforcing held |
| Low | Editors could ingest/scan in the scraper | Fixed |
| Low | Editors could read affiliate earnings | Fixed |
| Low | Publishing kill switch lacked origin check; editors could switch it off | Fixed |
| Low | YouTube review changes ignored the deal in the URL | Fixed |
| Low | View/share counters on unpublished deals, unlimited shares | Fixed |
| Low | Suspended members could change name and picture | Fixed |
| Low | Upload size check skipped for chunked bodies | Fixed |
| Low | `affiliateHosts` accepted any text | Fixed (network `url=` validation held) |
| Low | Shallow log redaction | Fixed |
| Low | Weak default password in an import script | Fixed |
| Low | Customer login lockout by anyone | Held |
| Low | Guest comment name spoofing | Held |
| Low | `/go` click rows have no throttle | Held |
| Low | Telegram approval callback trusts unsigned fields | Held (feature unused) |
| Low | Image download has no total deadline | Held |

## Needs validation (no severity)
Hostinger forwarding of `x-forwarded-for`; Python extractor DNS rebinding (not deployed on Hostinger); SVG handling in the image library; submission image route headers; whether `ADMIN_ALLOWED_IPS` is set in production.

## Secrets
Tracked files and the 36-commit history were scanned for key patterns and secret-like file names: none found. `.env`, `.env.*`, `staging/`, `.local/` and key files are ignored. `.env.example` contains only placeholders. `NEXT_PUBLIC_` variables are `APP_URL` and `APP_ENV` only. The local production build's client bundle (`.next/static`, 145 files, no source maps) was checked for 35 secret-sized values from `.env` and `staging/env`: none appeared except a public Cuelinks API base URL, which is not a secret. A bundle built on Hostinger was not checked. Dependency check: `npm audit` reported 0 vulnerabilities at all severities.

## Production blockers
Not production-ready until: the held items marked Medium in `HOLD_FOR_OWNER_APPROVAL.md` are decided (least-privilege database user, `ADMIN_ALLOWED_IPS`, CSP enforcement trial, Remote MySQL rules removed, staging password changed); the admin lock and an avatar upload are tested on staging; EDITOR/ADMIN/customer isolation is tested with real sessions against a disposable database; and backup restore is verified. Deployment is not approved by this report.

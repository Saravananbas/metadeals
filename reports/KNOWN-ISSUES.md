> Current update: M3 is implemented and locally validated; see MODULE-M3-REPORT.md and docs/m3-operations.md. M4–M7 remain pending and execution continues. No production or live provider activation.

> Autonomous continuation, 2026-11-02: M3–M7 are now authorized. M1.5 commit 3873410 and M2.5 commit 6f29733 preserve the previously mixed work. M3 is in progress; no M3 migration applied yet. See AUTONOMOUS-EXECUTION-CHECKPOINT.md for current state. Statements below describe the earlier run.

# Known Issues and Blockers

This register is updated after each roadmap module. Failures are not hidden and
blocked work is not represented as complete.

| ID | Severity | Module | Status | Description / impact | Next action |
|---|---|---|---|---|---|
| K-001 | BLOCKER | M2.5 and dependent modules | RESOLVED | Owner explicitly approved local email/password authentication, Argon2id, mandatory administrator TOTP, database-backed sessions and a CLI-only one-time bootstrap for the named initial SUPER_ADMIN. The implementation and local migration are complete; no account was provisioned. | Use `npm run auth:bootstrap` only when the owner is ready to provision the initial local administrator; never enable bootstrap in production. |
| K-005 | BLOCKER | M3 and dependent modules | OPEN | The database has no persisted deal/category/merchant/media domain or deal-management service. M2.5 now supplies admin identity and authorization, but no M3 work is authorized in this milestone. | Wait for explicit M3 approval, then design/review an additive deal migration and protected deal service. |
| K-006 | HIGH | M4 | OPEN | Affiliate provider account eligibility, terms and supported link/transaction operations have not been verified for this project. | Verify provider-specific official documentation and approvals before implementing real adapters; keep all integration behavior mocked. |
| K-007 | HIGH | M5 | OPEN | There are no deal publication, destination, delivery history, idempotency or subscriber-consent records. | Build the authorized publishing lifecycle only after M2.5/M3 and consent/policy requirements are established; use mock delivery only. |
| K-008 | MEDIUM | M6 | OPEN | `npm audit` reports 16 moderate `minimatch <11.0.1` findings in the development-tooling dependency tree (GHSA-g3hv-75wg-m249). `npm audit --omit=dev` reports zero vulnerabilities. npm's forced remediation would downgrade ESLint to 4.0.0. | Review the dependency graph and compatible upgrade path; do not apply `npm audit fix --force` without a reviewed migration and lint/type-check validation. |
| K-009 | MEDIUM | M6 | OPEN | Canonical/social metadata and a sitemap are absent. The site correctly remains `noindex, nofollow`; no public domain, deal detail pages or verified product data are ready for indexing. | After domain and content approval, add accurate metadata and sitemap, preserve staging noindex, and enable production indexing only through an explicit reviewed configuration. |
| K-010 | MEDIUM | M6 | OPEN | `next.config.ts` currently sets only `frame-ancestors`, `object-src`, and `base-uri` in its Content-Security-Policy. It is not a comprehensive script/style/resource policy, and no HSTS header is configured for a production HTTPS host. | Design and test a nonce-compatible CSP against the production hosting setup; enable HSTS only after HTTPS/domain readiness and launch approval. |
| K-011 | MEDIUM | M2.5 | OPEN | No verified outbound email transport is configured or included. Account setup and password-reset links are generated locally and must be delivered by an authorized operator through a private channel; users cannot self-serve a reset by email. | Configure and review an approved mail provider in a separately authorized task before implementing automated email delivery. Until then use the audited local CLI reset workflow. |
| K-012 | MEDIUM | M2.5 / production | OPEN | Login throttling includes a hashed proxy-IP bucket and trusts `x-forwarded-for` / `x-real-ip` as supplied by the deployment. Email-based throttling also applies, but forwarded headers must not be attacker-controlled in production. | Deploy behind a trusted proxy that strips and replaces forwarding headers, then test rate limits through that ingress before enabling production auth. |
| K-002 | MEDIUM | M1.5 | RESOLVED | The pre-existing pink/lavender semantic surfaces did not match the supplied light-blue M1.5 direction. | Updated the existing semantic system and verified the requested blue values in tests and production captures. |
| K-003 | LOW | M1.5 | OPEN | The repository does not include the reference's exact logo, category icons or complete product-collage artwork. | Supply approved assets if pixel-level visual matching is required. |
| K-004 | MEDIUM | M1.5 | OPEN | Official white/orange CTA and white/discount-red text pairs measure below the 4.5:1 small-text contrast target (2.61:1 and 4.46:1). | Obtain owner approval for a foreground/background role adjustment; do not silently change the approved brand palette. |

No live credentials or provider approvals were inspected or supplied. No initial
administrator account has been created.

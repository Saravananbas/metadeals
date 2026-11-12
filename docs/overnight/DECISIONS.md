# Decisions and Constraints

Last updated: 2026-11-11

## Owner decisions

- Include all prompt scopes, with security and stability first.
- Apply additive migrations only to disposable PostgreSQL/MariaDB databases; keep the persistent local DB untouched until a separate approval.
- User prefers Hostinger managed Node.js hosting without Docker or an additional VPS. Work may prepare local compatibility only; no Hostinger access, credentials, or deployment.
- Google Cloud was researched earlier but is not the current target; no cloud account is provisioned.

## Architecture decisions

- Continue the existing Next.js 16 App Router, React/TypeScript, Prisma, PostgreSQL/MariaDB, Redis/BullMQ, scraper, Cuelinks V3, and `/go/[dealId]` architecture.
- Do not create a second app/backend/database/admin portal.
- Use the existing Agent 1 → review → Agent 2 publishing flow. Agent 3 remains shadow-only and cannot publish or mutate live deals.
- Dashboard must be driven by persisted execution/business records. Build/verify data collection before presenting operational metrics.
- Keep public/mobile contracts versioned JSON APIs, server-authorized, paginated, and responsive.

## Hosting decision context

- Managed Node.js is the current desired destination because the owner does not want an extra VPS. Do not upload until Redis-backed security/rate-limit/queue behavior, workers, Python extraction, MariaDB and durable media are safely supported or explicitly disabled.
- Local web development now runs as a regular Node process on port 4123. Docker remains for local PostgreSQL/Redis/Python infrastructure, and the Compose app container is retained but stopped.

- Google Cloud Free Trial: $300 valid for 90 days, whichever is earlier (credit exhausted or time elapsed); it does not guarantee 3–6 months free. Cloud Run has an always-free request allowance and can scale to zero, but the existing persistent PostgreSQL + Redis + BullMQ worker stack is not covered as a complete always-free always-on deployment. Consider GCP only for a bounded pilot after cost controls and architecture are reviewed.
- Hostinger KVM 2 is the likely simple Docker Compose fit from the provided screenshot (2 vCPU/8GB/100GB), but owner declined Hostinger access/changes. Current public plan prices differ from screenshot, so checkout price and renewal terms must be verified if reconsidered.
- No environment has been provisioned or deployed by Codex.

## Safety decisions

- Never run migrations on local persistent databases or production without explicit approval.
- No credential rotation, database reset/data deletion, staging/commit/push, production deployment, or automatic deal publishing.
- Never print secret values. If any secret exposure is confirmed, report the affected secret class and ask owner to rotate through the provider; do not rotate autonomously.

## Known limitations and unresolved engineering decisions

- Standard Compose app command launches Next.js directly and does not run migrations; disposable test profile owns its separate test database migrations.
- Worker consumer handlers currently return placeholder success objects and the scheduler uses hardcoded sample identifiers. No worker/scheduler service is running. Do not enable these in production or use their status as real operational telemetry.
- Local comments are pending migration approval; endpoint/UI exists but the persistent local database has no applied comments migration.
- Remote CI status and repository branch protection have not been verified in this continuation. Local workflow presence is not proof of remote CI.
- GitHub read-only inspection found the local branch absent remotely and the default branch still at the older M0 project state, without the local CI workflow. No push was performed; CI/CD is not established remotely.
- A moderate transitive `minimatch` advisory was addressed with a scoped override to 11.0.1. Local Docker npm installation and production dependency installation report zero vulnerabilities. Remote GitHub Actions audit has not run because the branch is not published.
- README startup instructions should be updated only after the supported container workflow and CI gates are established and verified; the current local CI YAML has not run remotely and no CD target is approved.

## Product photo gallery requirement

- Owner requests every fetched product image to be retained with the deal and displayed in home cards as a carousel advancing every 3 seconds in a left-to-right direction. Use existing extraction data/media import security. Design storage for both PostgreSQL and MariaDB, validate schema/migrations only on disposable databases, and make carousel accessible/responsive with reduced-motion behavior. No migration is to be applied to persistent databases without approval.
- Merchant-directory listing is now the source for chosen merchant name and logo. Public/mobile JSON enriches the operational merchant with its directory logo by exact normalized website domain. Avoid loose substring/first-merchant fallbacks.


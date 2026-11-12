# MetaDeals4U Consolidated Development Plan

## Goal

Stabilize the existing application first, then complete the agreed user, community, Deal Intelligence, affiliate, legal, and mobile-ready scope without replacing existing systems or losing working-tree changes.

## Decisions and boundaries

- Include the full scope from the overlapping takeover, stabilization, security, Deal Intelligence, user/community, legal, and continuity prompts.
- Sequence security and runtime stability ahead of new feature completion.
- Keep PostgreSQL and MariaDB migration validation limited to disposable databases. Do not migrate the persistent local database or any hosted database without a new explicit approval.
- Current production preference: Hostinger managed Node.js hosting without a VPS or Docker runtime. This is a target for local compatibility work only; do not access Hostinger, add credentials, provision cloud resources, or deploy without separate owner authorization.
- Google Cloud's $300 trial credit lasts at most 90 days; it is not a 3–6 month guarantee. No provisioning, paid-account upgrade, or deployment is authorized by this plan.
- Keep Agent 3 shadow-only; Agent 2 remains the only publishing authority. No autonomous live publishing.
- Preserve Cuelinks V3, `/go/[dealId]`, existing integrations, user data, migration history, and unrelated worktree edits.
- Do not reset databases, stage, commit, push, or deploy.
- Android/iOS compatibility is a design constraint: share versioned JSON APIs and validation, use responsive accessible UI, and avoid web-only assumptions in business logic.

## Phases and exit gates

### 0. Preserve and map current state

- Recheck branch, staged/unstaged/untracked/deleted inventory before edits.
- Keep a record of initial and current working-tree states.
- Map existing app, schemas, integrations, agents, admin screens, CI, Docker, and deployment artifacts.
- Record existing user work separately from task changes.

**Exit:** no unreviewed overwrite; key systems and known risks have source-file evidence.

### 1. Security and database integrity

- Verify auth/session/origin protections, roles, ownership, rate limits, webhook authentication/replay protection, persistent kill switch, atomic publish authorization, and crash recovery.
- Inspect secret handling without printing values; identify any exposed credentials for owner-controlled rotation.
- Verify Agent 3 cannot publish or mutate live deals.
- Validate additive PostgreSQL and MariaDB migrations on disposable instances only.
- Add defect regression coverage; report real passed/failed/skipped/blocked counts.

**Exit:** applicable security suite passes; untested restart/process guarantees are called out; no production or persistent-database writes.

### 2. Runtime, Docker, and CI foundation

- Verify Node/npm, dependency lock integrity, Prisma clients and both schemas, Postgres, Redis, app startup/shutdown, Docker health, and production build.
- Confirm the actual worker/scheduler lifecycle and whether handlers perform real business work.
- Validate Docker Compose health, restart, storage, environment, network, and migration behavior.
- Ensure CI runs lockfile install, Prisma generation/validation, TypeScript, ESLint, unit/integration tests with disposable Postgres/Redis, and production build.
- Distinguish a workflow file in the local worktree from CI actually established on the remote repository. Do not add automatic CD without approval.

**Exit:** local and CI gates are evidenced; no service is reported healthy when a worker/scheduler is absent or a handler is a stub.

### 3. Confirmed bugs and performance

- Fix reproducible runtime/auth/media/affiliate issues with narrow patches and regression tests.
- Measure cold and warm homepage, catalog/search/category, admin/API, and media requests before optimizing.
- Profile slow SQL and request waterfalls; fix N+1/unbounded queries and pagination first.
- Keep price, availability, and published visibility fresh; avoid stale caching.
- Validate the guest-comments flow requested by the owner only after its schema is applied in a disposable environment and explicitly scheduled for the local database.

**Exit:** defects have reproduction, root cause, patch, regression test, and before/after evidence; no fabricated performance claims.

### 4. User identity and profile

- Complete secure registration/login/logout, safe homepage redirect for ordinary users, profile ownership, name/phone/avatar as supported, password change/reset, email-change verification, and account lifecycle.
- Enforce user/admin separation from server-side session data.
- Make account UI usable on narrow screens and from native-app clients through versioned APIs.

**Exit:** owner/sensitive-field tests and authentication regression suite pass.

### 5. Community submissions and moderation

- Reuse existing product extraction and safe URL-fetching infrastructure.
- Implement submission preview/editing, provenance of extracted/manual fields, duplicate identity matching, variant checks, ±5% price review rules, transactions/idempotency, submission history, and user status visibility.
- Never auto-publish user submissions. Agent 2/admin approval remains mandatory.
- Add admin review, duplicate/price-update queues, audit history, notifications, and authorization tests.

**Exit:** concurrent duplicate submissions cannot create duplicate live deals; all actions are auditable and admin-authorized.

### 6. Deal Intelligence and operations admin

- Extend the existing admin application, not a second portal.
- Add Overview, Agents, Source Management, Approval Queue, Review Required, Published Deals, Price History/Anomalies, Worker/Queue Health, AI Cost Analytics, Telegram Settings, and Affiliate Analytics.
- Build only from actual database/queue/execution records; show missing telemetry as unavailable, never sample numbers.
- Implement agent execution records and operational telemetry before dashboards depend on them.
- Preserve Agent 1 discovery/approval, Agent 2 publishing authority, Agent 3 shadow-only boundaries.

**Exit:** server-authorized APIs, real data, pagination, mobile/tablet layouts, and workflow tests are in place.

### 7. Affiliate, notifications, and legal content

- Preserve Cuelinks V3 and `/go/[dealId]`; verify click attribution and reporting data provenance.
- Separate estimated/reported/pending/approved commission and only import supported reports.
- Complete retry-safe notification flows for relevant user/admin events.
- Draft Privacy Policy and Terms that reflect actual implementation, mark them for Indian legal counsel, and use placeholders for unknown business details.

**Exit:** no fabricated commissions or legal claims; redirects and attribution remain covered by tests.

### 8. Mobile compatibility and product readiness

- Validate public/auth/community/admin APIs with native-app use in mind (versioning, JSON envelopes, pagination, error codes, auth tokens/cookie strategy, CORS where appropriate).
- Verify Android and iOS design/API contracts; native app implementation is a separate milestone unless owner expands it.
- Test responsive public and admin routes at phone/tablet/desktop breakpoints.

**Exit:** documented stable API contracts and responsive acceptance checks.

### 9. Cloud deployment readiness

- Adapt toward Hostinger managed Node.js only if required workflows fit its service limits without a VPS or Docker runtime. Keep Docker available for local database/cache infrastructure.
- Verify MariaDB migration parity and application compatibility on disposable databases before any hosted data migration.
- Replace Redis-backed rate limits/replay/kill-switch/queue use with safe durable alternatives, or explicitly disable dependent features without weakening authorization. Worker handlers are currently stubs and must not be presented as operational.
- Port needed Python extraction behavior into the existing Node app or leave it disabled on a Node-only host. Configure durable media storage before enabling uploads.
- Build CI/CD deployment only after target, cost controls, secrets, and owner approval are explicit. CI must not deploy to production automatically by default.

**Exit:** reviewed architecture, restore-tested backups, budgets/alerts, CI checks, rollback plan, migration plan, and explicit deployment approval.

### Current non-container runtime work (2026-11-11)

- `npm run dev` runs Next.js directly on port 4123 with Webpack; `npm run dev:docker` retains the optional Compose app workflow.
- `npm run start` uses Next.js `PORT` (defaults to 3000); `npm run start:local` targets 4123.
- Docker remains local PostgreSQL/Redis/Python infrastructure. The app container was stopped without removing it or touching data volumes.
- Direct Node runtime startup and production build pass, but managed-host readiness remains blocked by unresolved Redis/BullMQ, Python, MariaDB, storage, and production-workflow requirements.

## Current priority

Finish runtime/build/lint and application-path verification; then address actual worker/scheduler and schema/migration blockers before any dashboard expansion.

## Newly requested presentation work

The current user request ledger, including progress and immediate next actions, is in [USER_TASK_TRACKER.md](USER_TASK_TRACKER.md). New requirements: merchant selection must use the complete Merchant Websites directory, deal display must use its actual logo, and fetched product photo galleries must be persisted and shown in an accessible 3-second home-card carousel. These do not change the security-first sequence or disposable-only migration boundary.


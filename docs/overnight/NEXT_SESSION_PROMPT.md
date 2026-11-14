# MetaDeals4U Continuation Prompt

Continue the active MetaDeals4U stabilization goal in `D:\Metadeals`.

Before changing code, read:

1. `AGENTS.md` and relevant `node_modules/next/dist/docs/` guidance before any Next.js code edits.
2. `docs/overnight/MASTER_PROGRESS.md`
3. `docs/overnight/SESSION_HANDOFF.md`
4. `docs/overnight/TEST_RESULTS.md`
5. `docs/overnight/DECISIONS.md`
6. `docs/overnight/DEVELOPMENT_PLAN.md`

Then inspect actual `git status --short`, `git status --branch`, diffs, Docker state, and application/database state. Do not trust checkpoint claims without re-verifying them.

## Owner constraints

- Full scope is included, but security and stability come first.
- Migrations may be applied only to disposable PostgreSQL/MariaDB databases. Do not migrate persistent local DB, Hostinger, or any production database.
- Do not access Hostinger. Google Cloud is only a future candidate; no provisioning, paid upgrade, or deployment is approved.
- Preserve all existing uncommitted/untracked work. Never reset, clean, broadly format, stage, commit, push, deploy, or delete data.
- Preserve Cuelinks V3, `/go/[dealId]`, Agent 1/2/3 security boundaries, and mobile API compatibility.

## Resume here

1. Recheck Docker Desktop CLI access. Direct Docker API calls were denied by the named-pipe permissions, but the existing Compose Watch process remained live and logged HTTP 200 health checks; do not restart containers as a diagnostic shortcut.
2. Once CLI access is available, verify Compose-managed app readiness on `localhost:4123` and confirm Compose Watch. The prior standalone app container remains stopped as rollback.
3. The 144/144 isolated test suite, full ESLint, TypeScript, production Docker image build, and disposable MariaDB migration parity have passed in this work session; verify only if current state or source changes warrant it.
4. Test search/catalog/category/detail/admin workflows and measure cold/warm request times. Profile before optimizing.
5. Verify successful admin login, protected routes, and affiliate click attribution/redirect without production services.
6. Worker consumers return placeholder success results and scheduler identifiers are samples. Keep processing disabled until real safe handlers and lifecycle tests exist.
7. Check local CI workflow and remote GitHub Actions/branch protection without pushing. No CD deployment.
8. Continue using `DEVELOPMENT_PLAN.md` in phase order, adding regression tests for confirmed defects and rerunning the isolated suite.
9. Review the latest Deal Intelligence page at `src/app/admin/(protected)/intelligence/page.tsx`. Verify its metrics against actual database records; missing migration/telemetry must remain visibly unavailable. Preserve Agent 3's shadow-only boundary.
10. Complete authenticated visual/workflow review of the requested DealManager extraction UI, merchant directory/logo selection, comments dialog, multi-image gallery carousel, and `/admin/scraper?tab=` links. Do not apply migrations to persistent databases; use disposable PostgreSQL/MariaDB only.

When complete, update all five checkpoint files and provide PASS/FAIL/BLOCKED/NOT VERIFIED status. Do not claim production readiness from a successful build alone.

Before resuming, read docs/overnight/USER_TASK_TRACKER.md for the consolidated user request/status ledger. Continue from its Immediate next actions, verify current source and Git state, and preserve all user changes.

# Continuation addendum — 2026-11-14

Before continuing, read `docs/community-forum/MODERATOR_PHASE_1_AUDIT_AND_IMPLEMENTATION_PLAN.md` and this session’s latest appended checkpoint in `MASTER_PROGRESS.md`, `SESSION_HANDOFF.md`, and `TEST_RESULTS.md`. Reconcile older notes with the 2026-11-14 runtime follow-up: the existing app launcher and Next child were already serving port 4123, `/admin/login` returned 200, and the Python extractor reported healthy at 127.0.0.1:8765. Do not launch duplicates or terminate the existing app casually. The admin navigation overflow was fixed and checked in a browser at 1280px. Docker access and DB-dependent moderator tests remain unverified; moderator coding has not begun.

The moderator source audit is complete, but moderator code/schema work has not begun. Owner clarified that Docker and PostgreSQL are no longer in use; MariaDB is the active runtime database. The local `.env` was confirmed to select `mysql:` at 127.0.0.1:3307, and `prisma.config.ts` chooses the MariaDB schema/migrations accordingly. Recheck actual state before edits. Preserve all staged, unstaged and untracked user files. Do not grant moderator access by broadening `forum:moderate`; design and test least-privilege permissions first. Validate schema/migrations on a disposable MariaDB database only; do not delete the existing PostgreSQL schema/history unless explicitly requested. No production/Hostinger/GCP access, deploy, stage, commit or push.

## Addendum: moderator system (2026-11-14, later)
The moderator system is implemented locally; read `docs/community-forum/MODERATOR_PHASE_2_IMPLEMENTATION.md` first. Do not treat it as deployed or applied: migration `20261126100000_community_moderator` exists only in the repository and on the disposable database `metadeals_modtest`. Next steps: (1) owner decides on applying the migration to the persistent local database; (2) browser-verify `/moderator`, `/admin/moderators`, `/community/moderator-invite`, `/community/moderation` with a moderator and an admin session (the 4123 dev server needs the migration first); (3) decide how invitation links reach moderators (no email path exists); (4) review the PostgreSQL migration copy before any PostgreSQL use. Rerun the suite on a disposable MariaDB with every database gate on; the Redis-dependent suites still need a Redis server. Preserve all uncommitted work; no stage, commit, push or deploy.

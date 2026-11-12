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


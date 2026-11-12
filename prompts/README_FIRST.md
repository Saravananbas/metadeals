# MetaDeals4U AI Deal Intelligence – Antigravity Overnight Development Pack

## What is included
- `00_MASTER_ORCHESTRATION_PROMPT.md`: Give this to Google Antigravity first. It explains how to execute the milestones safely and sequentially.
- `M01_REPOSITORY_AUDIT.md` through `M10_PRODUCTION_READINESS.md`: Individual milestone prompts.
- `EXECUTION_CHECKLIST.md`: Morning review checklist.

## Important: overnight execution is not a guarantee
A full ten-milestone implementation may not safely finish in one night. The prompts intentionally require the agent to stop when it encounters missing information, failing tests, risky migrations, architectural conflicts, or incomplete prerequisites. A truthful partial completion is preferable to a large, broken implementation.

## Before starting Antigravity
1. Open the existing MetaDeals4U repository, not a new/empty workspace.
2. Make sure your current work is committed or backed up.
3. Confirm Antigravity is operating on a dedicated feature branch.
4. Ensure it has access only to the development environment, never production credentials.
5. Do not provide production database credentials, production affiliate secrets, or production Telegram bot credentials.
6. Review the current Git status and branch before starting.
7. Keep the local development website on port `4123`, PostgreSQL on `55432`, and Redis on `6380`, unless the repository already documents a deliberate alternative that must be preserved.

## Required operating mode
- Execute one milestone at a time.
- M01 is read-only.
- Do not begin M02 unless M01 identifies a safe, evidence-based implementation path.
- Do not skip failed acceptance criteria.
- Do not fabricate test results or claim a feature works without running it.
- Do not enable Agent 3 publishing. Agent 3 must remain shadow-only.
- Do not enable autonomous production publishing.
- Do not deploy to production.
- Do not modify production data.
- Stop and report blockers instead of guessing.

## Suggested Antigravity usage
1. Paste `00_MASTER_ORCHESTRATION_PROMPT.md`.
2. Attach or reference this prompt pack.
3. Ask it to execute M01 and continue sequentially only when each milestone's gates pass.
4. If Antigravity cannot reliably read all files from the ZIP, extract the ZIP into the repository's `docs/ai-deal-intelligence/prompts/` directory and tell it to read them in order.
5. Review `EXECUTION_CHECKLIST.md` the next morning.

The package is a development specification, not authorization to make destructive changes or publish deals autonomously.

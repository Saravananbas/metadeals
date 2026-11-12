# Morning Review – MetaDeals4U Antigravity Run

Do not assume the agent completed everything just because it produced a final message.

## Git and repository
- [ ] Confirm the repository and branch.
- [ ] Inspect `git status`.
- [ ] Review every commit created overnight.
- [ ] Review `git diff` against the starting branch.
- [ ] Confirm no user work was overwritten.
- [ ] Confirm no unexpected files, secrets or generated artifacts were committed.

## Milestone progress
- [ ] Read `docs/ai-deal-intelligence/progress-tracker.md`.
- [ ] Read M01 architecture audit.
- [ ] Check which milestones are COMPLETE, PARTIAL or BLOCKED.
- [ ] Confirm each completed milestone has evidence and tests.

## Database
- [ ] Inspect all new migrations.
- [ ] Confirm migrations are additive.
- [ ] Confirm no destructive production changes.
- [ ] Confirm rollback instructions exist.
- [ ] Confirm existing data and relationships are preserved.

## Core business rules
- [ ] Agent 1 requires persisted human approval.
- [ ] Agent 2 is the only publishing authority.
- [ ] Agent 3 is shadow-only and cannot create publishing jobs or live Deals.
- [ ] Suspected price errors cannot be auto-published.
- [ ] Historical prices are append-only and 90-day analytics are supported.
- [ ] Product variants are not incorrectly merged.
- [ ] Scraper failure is not interpreted as product unavailability.
- [ ] Confirmed unavailable published deals are hidden and admin notified.
- [ ] Cuelinks V3 and existing `/go/[dealId]` tracking are preserved.
- [ ] Global publishing kill switch is enforced server-side.

## Quality
- [ ] Run tests yourself.
- [ ] Run lint and type checks.
- [ ] Run production build.
- [ ] Review test failures and warnings.
- [ ] Review security findings.
- [ ] Verify local website uses port 4123 and existing database/Redis ports.

## Before any production rollout
- [ ] Independently review the code.
- [ ] Review migration and rollback.
- [ ] Configure development-only secrets.
- [ ] Test Telegram with an authorized development bot/admin.
- [ ] Test Cuelinks in its approved test/sandbox mode if available.
- [ ] Run Agent 3 in shadow mode for at least 30 days and evaluate at least 500 independently labelled candidates before considering any supervised rollout.
- [ ] Obtain explicit approval for any production deployment or autonomy change.

## Stop conditions
If there are failing tests, destructive migrations, unclear authorization, exposed secrets, or any path for Agent 3 to publish, do not merge or deploy.

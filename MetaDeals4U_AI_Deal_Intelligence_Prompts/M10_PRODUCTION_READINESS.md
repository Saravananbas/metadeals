# M10 – Production Readiness, Shadow Validation and Controlled Rollout Plan

This milestone validates the platform. It does NOT authorize production deployment or Agent 3 autonomous publishing.

## Functional validation
Test retailer/competitor monitoring, product identity, variants, price history, 90-day statistics, score reproducibility, price breakdown, price-error detection, Telegram approval, Agent 2 authorization, Cuelinks V3, click attribution, lifecycle, unavailable hiding, expiry, source health and Agent 3 shadow analytics.

## Security validation
- No unauthorized publishing.
- Agent 3 shadow publishing is impossible.
- Suspected price errors never auto-publish.
- Telegram callback identity, freshness and replay protection.
- SSRF and redirect protections.
- Secrets not exposed.
- Kill switch enforced at final publication boundary.
- Audit history complete.
- Scraped content cannot instruct agents or access tools/secrets.

## Shadow-mode evaluation
Proposed future gate for considering Agent 3 supervised rollout:
- At least 500 independently evaluated competitor candidates.
- At least 30 days observation.
- Target >=98% verified precision.
- Target >=99% price verification success.
- Target >=99% product/variant matching.
- Zero unauthorized publishing.
- Zero suspected price errors automatically published.
Report source/category-specific sample sizes, confusion matrix, precision/recall where labels permit, confidence intervals and limitations. These are proposed targets, not assumed results.

## Controlled future rollout – documentation only
Document future stages:
1. Shadow.
2. Human-supervised recommendations.
3. Limited allowlisted source/category automation after separate approval.
4. Controlled expansion with monitoring and kill switch.

Do not implement or enable Agent 3 autonomous publishing now. Do not provide an enabled switch that can accidentally bypass shadow restrictions.

## Quality gates
Run actual backend/frontend tests, lint, type checks, production build, migration checks, security tests and end-to-end workflows. Record exact commands and results. Do not claim unrun checks passed.

## Deployment restrictions
- No production deployment.
- No production database changes.
- No production credentials.
- No live Telegram bot or retailer actions unless development credentials and explicit authorization are available.
- Prepare deployment and rollback documentation only.

## Final report
Provide completed/partial/blocked milestones, branch and commit hashes, changed files, migrations and rollback, APIs/UI, exact test results, build/lint/type-check results, security findings, known issues, manual configuration, confirmation Agent 3 remains shadow-only and confirmation no production deployment/data changes occurred.

## Acceptance
All completed features work in development, existing functionality remains intact, and autonomous competitor publishing remains disabled.

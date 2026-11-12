# M01 – Repository Audit and Architecture Validation

## Objective
Perform a read-only audit of the existing MetaDeals4U repository before implementation.

## Mandatory restrictions
- Do not modify application source files.
- Do not create migrations.
- Do not install dependencies.
- Do not change environment files.
- Do not modify databases.
- Do not run destructive commands.
- Do not start implementation.

## Audit
1. Inspect repository structure, package manifests and framework versions.
2. Identify frontend routes, admin navigation and design system.
3. Identify API routes, backend services and authentication/authorization.
4. Inspect database schema, migrations, ORM and data-access conventions.
5. Inspect scraper engine, source adapters, scheduling, queue and worker runtimes.
6. Inspect DealCandidate, PriceObservation, ScraperJob and equivalents.
7. Inspect Deals publishing workflow and existing duplicate handling.
8. Inspect Cuelinks V3, `src/server/affiliate`, `cuelinks-client.ts`, `/go/[dealId]`, `/admin/cuelinks` and click attribution.
9. Inspect DistributionDestination/DistributionPost or equivalents.
10. Inspect DealCard.tsx, DealManager.tsx and existing admin UI.
11. Inspect source health, price history, product identity, lifecycle, analytics and kill-switch capabilities.
12. Inspect tests, CI, lint, type-check and build conventions.
13. Verify local ports and environment conventions. Known expected ports: website 4123, PostgreSQL 55432, Redis 6380.
14. Check Git branch, working tree and recent commits without altering user work.

## Deliverables
Create `docs/ai-deal-intelligence/architecture-audit.md` containing:
- Actual architecture diagram.
- Framework/runtime inventory.
- Database entity inventory.
- API inventory.
- Scraper and scheduling workflow.
- Existing deal lifecycle and publishing workflow.
- Affiliate attribution workflow.
- Existing reusable components/services.
- Gaps against the approved target architecture.
- Proposed additive schema changes.
- Proposed affected files.
- Migration and rollback strategy.
- Test strategy.
- Risks and dependencies.
- M02–M10 dependency map.
- READY / NOT READY recommendation for M02.

Base every finding on repository evidence. Distinguish verified facts from assumptions.

## Acceptance
M01 is complete only when the audit is documented and no source code or database was modified.

> Current update: M3 is implemented and locally validated; see MODULE-M3-REPORT.md and docs/m3-operations.md. M4–M7 remain pending and execution continues. No production or live provider activation.

> Autonomous continuation, 2026-11-02: M3–M7 are now authorized. M1.5 commit 3873410 and M2.5 commit 6f29733 preserve the previously mixed work. M3 is in progress; no M3 migration applied yet. See AUTONOMOUS-EXECUTION-CHECKPOINT.md for current state. Statements below describe the earlier run.

# Next Steps for User Review

M1.5 and the M2.5 authentication/admin foundation are implemented. The additive
M2.5 migration is applied to the local database; no initial administrator account
has been provisioned. M3–M7 remain unimplemented. Review
`MASTER-EXECUTION-SUMMARY.md` and the module reports before authorizing more work.

The verified audit and plan are in `REPOSITORY-AUDIT-AND-RECOVERY-PLAN.md`.
`SECURITY-DECISIONS.md` records the approved local credential design and
remaining production gates.

## Decisions needed first

1. **Initial local administrator:** when ready, review the private CLI bootstrap
   instructions in `README.md`. The bootstrap flag is disabled; no account was
   created as part of implementation.
2. **M3 deal data and authorization (K-005):** explicitly authorize M3, then
   approve an additive
   database-backed deal/category/store model and protected management service.
3. **Affiliate providers (K-006):** confirm provider account eligibility,
   official capabilities and terms before real adapters or link claims.
4. **Publishing policy (K-007):** define publication approval, destination,
   opt-in/consent, idempotency, retention and audit requirements. Keep actual
   delivery mocked until separately approved.
5. **Dependency finding (K-008):** review a compatible remediation for the
   moderate `minimatch` development-tooling findings. Do not apply
   `npm audit fix --force` without an approved breaking-toolchain migration.
6. **Public SEO (K-009):** approve the public domain and verified product/deal
   content before canonical metadata, sitemap or any production indexing.
7. **M1.5 visual follow-up (K-003/K-004):** provide approved artwork if exact
   reference matching is required and decide whether the two documented contrast
   pairs may be adjusted.

## Recommended implementation order after approval

1. Provision the initial local administrator only when the owner is ready.
2. After explicit approval, implement and test M3 persisted deal management with a reviewed additive
   migration.
3. Add only provider-verified M4 affiliate capabilities and safe redirects.
4. Add M5 mock publishing, approval, consent and idempotency before any separately
   approved live activation.
5. Revisit M6 analytics, metadata, accessibility/performance audits and production
   checklist using real domain data; explicitly preserve staging noindex.
6. Define M7 versioned API contracts from the implemented services, then add
   contract and authorization tests. Native Expo apps remain a later project.

## Local run and checks

From PowerShell, follow the repository `README.md` instructions:

```powershell
cd D:\Metadeals
npm ci
npm run env:setup
npm run infra:up
npm run db:deploy
npm run db:generate
npm run dev
```

Open `http://localhost:4123`. To validate:

```powershell
npm run lint
npm run typecheck
npm test
npm run db:validate
npm run db:status
npm run build
npm run test:smoke
```

`npm run test:smoke` should run after the production build. The optional
`npm run test:auth:integration` is restricted to the project's local PostgreSQL
port and removes its generated test records. Do not reset/drop database volumes
to fix local configuration. The generated `.env` is ignored and must not be
committed. Do not deploy, enable indexing, send messages, or use live affiliate
credentials without separate explicit approval.

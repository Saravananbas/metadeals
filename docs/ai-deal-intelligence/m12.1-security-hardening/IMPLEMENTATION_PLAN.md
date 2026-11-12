# M12.1 Security Hardening Implementation Plan

## Objective
Remediate all outstanding M10.1 blockers identified during M12 independent review:
1. Production Telegram Webhook route with secret-token constant-time comparison.
2. Distributed Redis replay defense for admin callback approvals.
3. Persistent shared kill switch stored in Redis across all cluster instances.
4. Database-backed atomic state machine for Agent 2 publishing authorization.
5. Crash recovery reconciliation worker for interrupted publishing operations.

## Workstream Breakdown & Deliverables
- **Workstream 1:** Route `src/app/api/telegram/webhook/route.ts` with constant-time verification.
- **Workstream 2:** Atomic Redis operations via `SharedSecurityStore` in `src/server/queue/security-store.ts`.
- **Workstream 3:** Shared kill switch state machine in `src/server/queue/security-store.ts` and `Agent2PublishingEngine`.
- **Workstream 4:** PostgreSQL enum expansion and atomic conditional update `APPROVED -> CLAIMED -> PUBLISHING -> PUBLISHED`.
- **Workstream 5:** `PublishingReconciliationWorker` in `src/server/scraper/reconciliation-worker.ts`.


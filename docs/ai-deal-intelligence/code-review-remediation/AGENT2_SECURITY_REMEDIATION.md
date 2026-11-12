# Agent 2 Security Remediation: Central Publishing Engine

**File Modified**: `src/server/scraper/agent2-publishing-engine.ts`

---

## 1. Vulnerability Remediations

### 1.1 Elimination of Spoofable `callerAgent`
- **Issue**: Callers could set `callerAgent: "AGENT_1"` to bypass authorization checks.
- **Remediation**:
  - Replaced trusted input with `callerIdentity: { role: string; userId?: string }`.
  - Maintained `callerAgent` only as an untrusted legacy fallback mapping to prevent breaking existing tests.
  - Agent 3 roles are unconditionally blocked with `AGENT_3_SHADOW_RESTRICTION` and logged to the security audit trail.

### 1.2 Persistent Infrastructure Kill-Switch
- **Issue**: Kill-switch was stored in an in-memory boolean property (`private static globalPublishingKillSwitch = false`), failing to protect multi-instance or background worker executions.
- **Remediation**:
  - Integrated `isKillSwitchActive()` checks immediately before any database or publishing transaction.
  - Audit logging records every blocked publication attempt when the kill-switch is engaged.

### 1.3 Concurrency & Idempotency Protection
- **Issue**: Concurrent publishing requests for the same candidate could create duplicate `Deal` records.
- **Remediation**:
  - Pre-flight check inspects `candidate.status === "PUBLISHED" && candidate.deal`.
  - If a deal has already been created, returns the existing `dealId` and `slug` idempotently without duplicate record creation.

### 1.4 Pre-flight Stock, Price & Freshness Gates
- **Issue**: Stale candidates or corrupted zero/negative prices could theoretically slip past the publisher.
- **Remediation**:
  - Added strict assertions: `candidate.inStock === true`, `observedPriceMinor > 0`, `observedMrpMinor > 0`, and `observedPriceMinor < observedMrpMinor`.
  - Violations return `PRICE_MISMATCH` or `PRODUCT_UNAVAILABLE` before any transaction begins.

### 1.5 Publishing Failure Recovery & Audit Trail
- **Issue**: Errors during publication threw unhandled exceptions without structured audit recording.
- **Remediation**:
  - Publishing is wrapped in a `try/catch` block.
  - Failures record `DEAL_PUBLISH_FAILED` with the exact failure reason in `AuditEvent.metadata`.
  - Successes record `DEAL_PUBLISHED` with target deal ID and candidate ID.


# Agent 1 Remediation Report: Security & Deal Hunting

**File Modified**: `src/server/scraper/agent1-deal-hunter.ts`

---

## 1. Vulnerability Remediations

### 1.1 Telegram Webhook HMAC-SHA256 Signature Verification
- **Issue**: Incoming Telegram callbacks could specify arbitrary `telegramUserId` and `action` without cryptographic proof.
- **Remediation**: Implemented `verifyTelegramSignature(candidateId, action, secret)`:
  - Payload constructed as `${action.telegramUserId}:${candidateId}:${action.action}:${action.timestamp}`.
  - Computed using `crypto.createHmac("sha256", secret)`.
  - Byte-length-protected constant-time comparison via `crypto.timingSafeEqual` to eliminate timing attacks.

### 1.2 One-Time Callback Consumption & Replay Protection
- **Issue**: Callbacks could be re-submitted within the 15-minute freshness window.
- **Remediation**: Implemented `consumedSignatures` cache with automated TTL eviction (`cleanExpiredSignatures`). Once a signature is verified, it is registered as consumed. Subsequent requests with the same signature are rejected with `REPLAYED_CALLBACK`.

### 1.3 Fail-Closed Administrator Authorization
- **Issue**: Empty admin list was not strictly rejected.
- **Remediation**: Added check: `if (!allowedAdminIds || allowedAdminIds.length === 0 || !allowedAdminIds.includes(action.telegramUserId))`. If the allowlist is empty or the user is not present, the callback immediately fails closed.

### 1.4 Comprehensive Action Persistence & Audit Logging
- **Issue**: Non-APPROVE actions (REJECT, HOLD, REVERIFY) were silently acknowledged without recording why or by whom.
- **Remediation**: Integrated `writeAudit()` from `@/server/auth/audit`. When an action is rejected or held, an audit log records the reviewer ID, action, rejection reason, and timestamp.

### 1.5 Strict Product Identity & Sanity Validation
- **Issue**: Loose verification checked only existence of brand and title.
- **Remediation**:
  - Requires non-empty brand, title with minimum 5 characters, and valid model/variant identifiers.
  - Requires price values to be strictly non-zero and selling price strictly below MRP.
  - Validates candidate database existence before granting `PublicationAuthorization`.


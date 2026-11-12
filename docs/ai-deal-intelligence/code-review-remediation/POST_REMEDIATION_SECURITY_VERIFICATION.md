# Post-Remediation Security & Architecture Verification

**Audit Date**: November 8, 2026  
**Auditor**: Principal Software Architect & Application Security Engineer  
**Scope**: In-depth independent source verification of Agent 1, 2, and 3 security remediation and operational readiness prior to Milestone M11.

---

## 1. Executive Verdict & Findings Classification

| Area / Subsystem | Item Verified | Classification | Evidence & Technical Finding |
| :--- | :--- | :--- | :--- |
| **1. Telegram Webhook** | Official `X-Telegram-Bot-Api-Secret-Token` Header | **FAIL** | There is currently **no public Next.js route** mounted at `/api/telegram/webhook`. While `verifyTelegramSignature` was added in `agent1-deal-hunter.ts`, Telegram's official webhook authentication relies on comparing the incoming `X-Telegram-Bot-Api-Secret-Token` header against a secret string configured via `setWebhook`, rather than a custom HMAC payload format. |
| **1. Telegram Webhook** | Constant-Time Secret Comparison | **PASS** | `verifyTelegramSignature` uses `crypto.timingSafeEqual` with byte-length equality validation. |
| **1. Telegram Webhook** | Administrator Allowlist | **PASS** | `handleTelegramApproval` strictly enforces `!allowedAdminIds.includes(action.telegramUserId)` and fails closed if the list is empty. |
| **1. Telegram Webhook** | Callback Freshness Check | **PASS** | Callbacks with timestamps older than 15 minutes are strictly rejected (`STALE_CALLBACK`). |
| **2. Replay Protection** | Distributed / Cross-Instance Protection | **FAIL** | Replay protection currently uses `private static consumedSignatures = new Map<string, number>()` in **local Node.js process memory**. While valid in a single-process development environment, this fails across serverless instances, clustered workers, or after application restarts. A shared store (Redis `SET ... EX` or a PostgreSQL `ConsumedCallback` table) is required for production. |
| **3. Agent 2 Authorization** | Trusted Server-Side Authentication | **FAIL** | `publishCandidate` accepts `PublishingPreflightRequest`, but `Agent2PublishingEngine.publishCandidate` is not yet called by an authenticated Next.js API route. Any external API endpoint created in the future must construct `callerIdentity` exclusively from server-side session cookies via `getCurrentAuthContext()`, rather than trusting request JSON. |
| **3. Agent 2 Authorization** | Agent 3 Shadow Isolation | **PASS** | Hardcoded restriction `if (effectiveRole === "AGENT_3" \|\| request.callerAgent === "AGENT_3")` unconditionally returns `AGENT_3_SHADOW_RESTRICTION` and audits the attempt. |
| **3. Agent 2 Authorization** | Atomic Authorization & Concurrency | **FAIL** | Authorization claiming and deal creation are not wrapped in a single database serializable transaction (`db.$transaction`). If two concurrent requests arrive simultaneously, both can read `auth.status === "APPROVED"` before either updates it to `PUBLISHED`. Furthermore, a crash between `publishVerifiedCandidate` and `db.publicationAuthorization.update` leaves the authorization in `APPROVED` while the deal already exists. |
| **4. Kill Switch** | Shared Persistent Infrastructure | **FAIL** | Kill switch is stored in `private static globalPublishingKillSwitch = false` in **local process memory**. When toggled via `/api/v1/admin/intelligence-controls`, it only affects that specific Node.js process. Separate worker processes or instances will not see the state. |
| **5. Agent 3 Isolation** | Comprehensive Perimeter Audit | **PASS** | Comprehensive codebase grep confirms Agent 3 has zero imports or execution paths to `Deal`, `DealCandidate`, `publishCandidate`, or queue producers. |

---

## 2. In-Depth Technical Analysis

### 2.1 Telegram Webhook Reality vs Official Telegram Bot API
1. **Official Mechanism**:
   - When calling Telegram's `setWebhook` API, the bot operator supplies a `secret_token` parameter (1–256 characters, `[A-Za-z0-9_-]`).
   - Telegram sends every update with the HTTP header:
     ```http
     X-Telegram-Bot-Api-Secret-Token: <your_secret_token>
     ```
   - The application must verify this header using `crypto.timingSafeEqual` against `process.env.TELEGRAM_WEBHOOK_SECRET` **before** reading or parsing the update body.
2. **Current Implementation**:
   - `Agent1DealHunter.verifyTelegramSignature` constructs a custom HMAC:
     `HMAC-SHA256("${action.telegramUserId}:${candidateId}:${action.action}:${action.timestamp}", secret)`.
   - While mathematically robust, Telegram's native servers **do not compute custom HMACs on callback queries**. A custom webhook route must receive the standard update, verify the `X-Telegram-Bot-Api-Secret-Token` header, parse the callback query, and forward it to Agent 1.

### 2.2 Replay Protection: In-Memory vs. Shared Infrastructure
- **Vulnerability**: If the Next.js dev server restarts or scales out across multiple instances, the in-memory `consumedSignatures` Map is cleared. A valid signed callback query could be re-submitted within its 15-minute validity window.
- **Remediation Requirement**:
  - Connect replay tracking to Redis using atomic key expiration:
    ```ts
    const acquired = await redis.set(`tg:consumed:${signature}`, "1", "EX", 900, "NX");
    if (!acquired) return { success: false, error: "REPLAYED_CALLBACK" };
    ```
  - Fall back to a PostgreSQL unique record (`ConsumedCallbackSignature`) if Redis is unavailable.

### 2.3 Agent 2 Concurrency & Crash Recovery (Race Condition Analysis)
In `Agent2PublishingEngine.publishCandidate`:
```ts
// 1. Read authorization status
const auth = await db.publicationAuthorization.findUnique({ where: { candidateId } });
// ... validations ...
// 2. Publish deal
const publishResult = await publishVerifiedCandidate(db, candidate.id);
// 3. Update authorization status
await db.publicationAuthorization.update({ where: { id: auth.id }, data: { status: "PUBLISHED" } });
```
- **Race Condition**: If request A and request B execute step 1 simultaneously, both pass the check because `auth.status` is still `"APPROVED"`. Both invoke `publishVerifiedCandidate`, attempting duplicate publication.
- **Crash Inconsistency**: If the server crashes or the process is killed at step 2, the `Deal` is created, but `publicationAuthorization` remains `"APPROVED"`. On retry, it attempts to publish again.
- **Remediation Requirement**:
  - Use an atomic state transition:
    ```ts
    const claimed = await db.publicationAuthorization.updateMany({
      where: { id: auth.id, status: "APPROVED" },
      data: { status: "CLAIMED" },
    });
    if (claimed.count === 0) return { published: false, error: "CONCURRENT_CLAIM" };
    ```

### 2.4 Kill Switch: Distributed State
- Currently `Agent2PublishingEngine.setKillSwitch(active)` mutates `private static globalPublishingKillSwitch`.
- In a production Next.js environment (serverless functions, standalone clustered containers, or background workers), memory is not shared.
- Must be persisted to Redis (`SET metadeals:kill_switch "active"`) or PostgreSQL `SystemSetting` table.

---

## 3. Remaining Blockers Before M11

Before Milestone M11 (Production Deployment / Operations) can safely commence, these 4 architectural gaps must be addressed:

1. **Mount Live Webhook Route (`src/app/api/telegram/webhook/route.ts`)**:
   - Must validate `X-Telegram-Bot-Api-Secret-Token`.
   - Parse `callback_query` data and invoke `Agent1DealHunter.handleTelegramApproval`.
2. **Distributed Replay & Kill Switch via Shared Store**:
   - Move replay signatures to Redis (`SET key NX EX 900`).
   - Move kill-switch state to Redis or database with fail-closed fallback.
3. **Atomic Authorization Claiming in Agent 2**:
   - Prevent race conditions using atomic status transition (`APPROVED` -> `CLAIMED` -> `PUBLISHED`).
4. **Database Migration Parity**:
   - The tables `PublicationAuthorization`, `ShadowCandidate`, `SourceHealthRecord`, and `DealLifecycleEvent` were added to `prisma/schema.prisma` but have **not yet been created in PostgreSQL via an official Prisma migration file** (`prisma migrate dev`).

---

## 4. Final Recommendation

**Can M11 safely begin?**
**NO — M11 should NOT begin until the 4 blockers above are implemented.**

While the domain algorithms and local test suites pass (31/31), the distributed concurrency guards, live webhook route, and persistent migrations are prerequisites for a safe production deployment.

